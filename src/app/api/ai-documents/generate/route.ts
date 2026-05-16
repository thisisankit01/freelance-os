import { auth } from '@clerk/nextjs/server'
import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { supabaseAdmin } from '@/lib/supabase-admin'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

type DocumentType = 'contract' | 'legal_notice'

type GenerateBody = {
  documentType?: DocumentType
  clientName?: string
  projectName?: string
  invoiceNumber?: string
  title?: string
  terms?: string
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function money(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString('en-IN')}` : ''
}

function scoreMatch(query: string, title: string) {
  const q = query.toLowerCase().trim()
  const t = title.toLowerCase().trim()
  if (!q) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 90
  if (t.includes(q)) return 75
  const parts = q.split(/\s+/).filter((p) => p.length > 1)
  if (parts.length && parts.every((p) => t.includes(p))) return 55
  return 0
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 12000)
}

function documentTitle(type: DocumentType, clientName?: string, projectTitle?: string) {
  if (type === 'legal_notice') return `Legal notice${clientName ? ` for ${clientName}` : ''}`
  return `Contract${clientName ? ` for ${clientName}` : ''}${projectTitle ? ` - ${projectTitle}` : ''}`
}

async function findClient(userId: string, clientName?: string) {
  let query = supabaseAdmin
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(clientName ? 10 : 1)

  if (clientName) query = query.ilike('name', `%${clientName}%`)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  if (!clientName) return data?.[0] ?? null
  return (data ?? []).sort((a, b) => scoreMatch(clientName, b.name ?? '') - scoreMatch(clientName, a.name ?? ''))[0] ?? null
}

async function findProject(userId: string, projectName?: string) {
  if (!projectName) return null
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, clients(*)')
    .eq('user_id', userId)
    .ilike('title', `%${projectName}%`)
    .limit(10)

  if (error) throw new Error(error.message)
  return (data ?? []).sort((a, b) => scoreMatch(projectName, b.title ?? '') - scoreMatch(projectName, a.title ?? ''))[0] ?? null
}

async function findLatestClientProject(userId: string, clientId?: string | null) {
  if (!clientId) return null
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, clients(*)')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

async function findInvoice(userId: string, invoiceNumber?: string, clientId?: string | null) {
  let query = supabaseAdmin
    .from('invoices')
    .select('*, clients(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (invoiceNumber) query = query.ilike('invoice_number', invoiceNumber)
  else if (clientId) query = query.eq('client_id', clientId)
  else return null

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

async function collectKnowledgeBase(userId: string, body: GenerateBody) {
  const client = body.clientName ? await findClient(userId, body.clientName) : null
  let project = body.projectName ? await findProject(userId, body.projectName) : null

  if (body.clientName && !client) {
    return { error: `Could not find client "${body.clientName}".` }
  }
  if (body.projectName && !project) {
    return { error: `Could not find project "${body.projectName}".` }
  }
  if (project && !project.client_id) {
    return { error: `Project "${project.title}" is not assigned to a client. Assign a client before drafting this document.` }
  }
  if (client && project && project.client_id !== client.id) {
    return { error: `Project "${project.title}" is assigned to "${project.clients?.name ?? 'another client'}", not "${client.name}".` }
  }

  let effectiveClient = client ?? project?.clients ?? null
  const invoice = await findInvoice(userId, body.invoiceNumber, effectiveClient?.id)

  if (body.documentType === 'legal_notice' && !invoice) {
    return { error: 'A legal notice needs a matching unpaid invoice. Please mention the invoice number.' }
  }
  if (body.invoiceNumber && !invoice) {
    return { error: `Could not find invoice "${body.invoiceNumber}".` }
  }
  if (invoice && effectiveClient && invoice.client_id && invoice.client_id !== effectiveClient.id) {
    return { error: `Invoice "${invoice.invoice_number}" belongs to "${invoice.clients?.name ?? 'another client'}", not "${effectiveClient.name}".` }
  }

  effectiveClient = effectiveClient ?? invoice?.clients ?? null
  if (!project && effectiveClient?.id) {
    project = await findLatestClientProject(userId, effectiveClient.id)
  }

  const projectId = project?.id as string | undefined
  const clientId = effectiveClient?.id as string | undefined
  const invoiceId = invoice?.id as string | undefined

  const [tasksRes, timeRes, invoiceItemsRes, relatedInvoicesRes, assignmentsRes, payoutsRes] = await Promise.all([
    projectId
      ? supabaseAdmin.from('tasks').select('*').eq('user_id', userId).eq('project_id', projectId).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? supabaseAdmin
          .from('time_entries')
          .select('*, tasks(id, title, project_id)')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [], error: null }),
    invoiceId
      ? supabaseAdmin.from('invoice_items').select('*').eq('invoice_id', invoiceId)
      : Promise.resolve({ data: [], error: null }),
    clientId
      ? supabaseAdmin.from('invoices').select('*').eq('user_id', userId).eq('client_id', clientId).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? supabaseAdmin.from('work_assignments').select('*, team_members(*)').eq('user_id', userId).eq('project_id', projectId).limit(30)
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? supabaseAdmin.from('payouts').select('*, team_members(*)').eq('user_id', userId).eq('project_id', projectId).limit(30)
      : Promise.resolve({ data: [], error: null }),
  ])

  for (const result of [tasksRes, timeRes, invoiceItemsRes, relatedInvoicesRes, assignmentsRes, payoutsRes]) {
    if (result.error) throw new Error(result.error.message)
  }

  const tasks = tasksRes.data ?? []
  const projectTaskIds = new Set(tasks.map((task: { id: string }) => task.id))
  const timeEntries = (timeRes.data ?? []).filter((entry: { tasks?: { id?: string } | null }) =>
    entry.tasks?.id ? projectTaskIds.has(entry.tasks.id) : true,
  )

  return {
    client: effectiveClient,
    project,
    invoice,
    tasks,
    timeEntries,
    invoiceItems: invoiceItemsRes.data ?? [],
    relatedInvoices: relatedInvoicesRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    payouts: payoutsRes.data ?? [],
  }
}

function fallbackContract(kb: Record<string, unknown>, terms?: string) {
  const client = kb.client as Record<string, unknown> | null
  const project = kb.project as Record<string, unknown> | null
  const tasks = Array.isArray(kb.tasks) ? kb.tasks as Record<string, unknown>[] : []
  const budget = money(project?.budget)
  return `# SERVICE AGREEMENT

This Service Agreement is entered into between the freelancer/service provider ("Service Provider") and ${client?.name ?? '[Client Name]'} ("Client") for ${project?.title ?? '[Project Name]'}.

## 1. Project Background
The Client has engaged the Service Provider for ${project?.title ?? 'the agreed project'}. Project description: ${project?.description ?? '[Project scope to be added]'}.

## 2. Scope of Work
${tasks.length ? tasks.map((task) => `- ${task.title}${task.status ? ` (${task.status})` : ''}`).join('\n') : '- Deliverables, milestones, revision limits, acceptance criteria, and handover material to be finalized in writing.'}

## 3. Commercial Terms
Project budget: ${budget || '[Amount to be added]'}.
${terms || 'Payment schedule, taxes, late fees, and milestone-wise release terms will be as agreed in writing by both parties.'}

## 4. Timeline
Deadline: ${project?.deadline ?? '[Deadline to be added]'}. Any delay caused by pending feedback, missing content, unpaid milestones, or change requests may extend the delivery timeline.

## 5. Intellectual Property and Usage
Final deliverables transfer to the Client only after full payment is received. Drafts, working files, source files, and rejected concepts remain with the Service Provider unless expressly agreed otherwise.

## 6. Confidentiality
Both parties shall keep confidential business, pricing, technical, and client information received during the project.

## 7. Change Requests
Work outside the agreed scope, additional revisions, urgent timelines, or new deliverables will be charged separately unless agreed in writing.

## 8. Termination
Either party may terminate in writing. The Client remains liable for work completed, approved milestones, third-party costs, and committed effort up to termination.

## 9. Dispute Resolution
The parties shall first attempt good-faith resolution. If unresolved, disputes may be pursued through applicable civil remedies and courts/tribunals with competent jurisdiction in India, subject to the final agreement.

## 10. Review
This draft is generated by SoloOS from workspace records and should be reviewed by the Service Provider and, where needed, a qualified legal professional before signature.

## Signatures

Service Provider Signature: __________________________

Name: __________________________

Date: __________________________

Client Signature: __________________________

Name: __________________________

Date: __________________________
`
}

function fallbackLegalNotice(kb: Record<string, unknown>) {
  const client = kb.client as Record<string, unknown> | null
  const invoice = kb.invoice as Record<string, unknown> | null
  const project = kb.project as Record<string, unknown> | null
  return `# LEGAL NOTICE FOR RECOVERY OF OUTSTANDING DUES

To,
${client?.name ?? '[Client Name]'}
${client?.email ? `Email: ${client.email}` : ''}

Subject: Legal notice for payment of outstanding dues against Invoice ${invoice?.invoice_number ?? '[Invoice Number]'}

Under instructions from the Service Provider, this notice records that services were provided in relation to ${project?.title ?? 'the agreed work'} and Invoice ${invoice?.invoice_number ?? '[Invoice Number]'} for ${money(invoice?.total) || '[Outstanding Amount]'} remains unpaid.

Despite completion/progress of the agreed work and issuance of invoice/reminders, the outstanding amount has not been cleared. You are called upon to pay the full outstanding amount within 7 days from receipt of this notice.

If the payment remains unpaid, the Service Provider reserves the right to initiate appropriate civil recovery proceedings, claim interest, costs, and any other remedies available under applicable law. If facts support dishonesty, fraudulent inducement, cheque dishonour, or other statutory violations, appropriate proceedings may also be considered under applicable Indian law, including relevant provisions of the Bharatiya Nyaya Sanhita, 2023 and Section 138 of the Negotiable Instruments Act, 1881 where applicable.

This draft should be reviewed by a qualified advocate before dispatch.

Service Provider Signature: __________________________

Name: __________________________

Date: __________________________
`
}

async function generateDocumentContent(documentType: DocumentType, kb: Record<string, unknown>, terms?: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    return documentType === 'contract' ? fallbackContract(kb, terms) : fallbackLegalNotice(kb)
  }

  const legalContext = `
India legal drafting context as of 2026:
- The IPC has been replaced for current criminal-law references by the Bharatiya Nyaya Sanhita, 2023, enforced from 1 July 2024.
- For payment disputes, draft civil recovery and breach-of-contract remedies first. Do not allege crimes unless the facts indicate dishonest or fraudulent intent.
- BNS section 316 concerns criminal breach of trust where property is entrusted and dishonestly used/disposed of.
- BNS section 318 concerns cheating/fraudulent inducement; use conditionally, not for a mere breach of contract.
- BNS section 321 concerns dishonestly/fraudulently preventing debt from being available for creditors.
- Section 138 of the Negotiable Instruments Act, 1881 applies only when a cheque is dishonoured for a legally enforceable debt/liability and statutory timelines are met, including written demand notice within 30 days of dishonour information and 15 days for payment after notice.
`

  const instruction =
    documentType === 'contract'
      ? `Draft a premium Indian freelance service agreement. Use the full workspace knowledge base. Include scope, milestones, deliverables, client dependencies, revision limits, payment schedule, taxes, late fees, IP transfer after full payment, confidentiality, termination, dispute resolution, and final signature blocks for both Service Provider and Client.`
      : `Draft a serious but professional Indian legal notice for non-payment. Use the full workspace knowledge base. Mention invoice, amount, project/work facts, prior reminders if available, demand payment within a defined period, reserve civil recovery remedies, interest/costs, and only conditionally mention BNS/NI Act sections when facts support them. Do not overclaim. Include a sender signature block.`

  const result = await generateText({
    model: openrouter('google/gemini-2.0-flash-001'),
    temperature: 0.2,
    maxOutputTokens: 3200,
    messages: [
      {
        role: 'system',
        content:
          'You draft business/legal documents for SoloOS. Return only the finished document in clean Markdown. No explanation, no code fences. This is a draft for user review, not legal advice.',
      },
      {
        role: 'user',
        content: `${instruction}

${legalContext}

User extra terms/instructions:
${terms || 'None'}

Workspace knowledge base:
${compactJson(kb)}`,
      },
    ],
  })

  const text = (result.text ?? '').trim()
  return text || (documentType === 'contract' ? fallbackContract(kb, terms) : fallbackLegalNotice(kb))
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as GenerateBody
  const documentType = body.documentType === 'legal_notice' ? 'legal_notice' : body.documentType === 'contract' ? 'contract' : null
  if (!documentType) return Response.json({ error: 'documentType is required' }, { status: 400 })

  const kb = await collectKnowledgeBase(userId, {
    documentType,
    clientName: cleanText(body.clientName),
    projectName: cleanText(body.projectName),
    invoiceNumber: cleanText(body.invoiceNumber),
    title: cleanText(body.title),
    terms: cleanText(body.terms),
  })

  if ('error' in kb) return Response.json({ error: kb.error }, { status: 400 })

  const content = await generateDocumentContent(documentType, kb, cleanText(body.terms))
  const title = cleanText(body.title) || documentTitle(documentType, kb.client?.name, kb.project?.title)

  const { data, error } = await supabaseAdmin
    .from('ai_documents')
    .insert({
      user_id: userId,
      document_type: documentType,
      title,
      client_id: kb.client?.id ?? null,
      project_id: kb.project?.id ?? null,
      invoice_id: kb.invoice?.id ?? null,
      recipient_email: kb.client?.email ?? kb.invoice?.clients?.email ?? null,
      status: 'draft',
      question_answers: {
        clientName: kb.client?.name,
        projectName: kb.project?.title,
        invoiceNumber: kb.invoice?.invoice_number,
        extraTerms: cleanText(body.terms) || null,
        knowledgeBaseIncluded: {
          tasks: Array.isArray(kb.tasks) ? kb.tasks.length : 0,
          timeEntries: Array.isArray(kb.timeEntries) ? kb.timeEntries.length : 0,
          invoiceItems: Array.isArray(kb.invoiceItems) ? kb.invoiceItems.length : 0,
          relatedInvoices: Array.isArray(kb.relatedInvoices) ? kb.relatedInvoices.length : 0,
          assignments: Array.isArray(kb.assignments) ? kb.assignments.length : 0,
          payouts: Array.isArray(kb.payouts) ? kb.payouts.length : 0,
        },
      },
      content,
    })
    .select('*, clients(id, name, email), projects(id, title), invoices(id, invoice_number)')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}
