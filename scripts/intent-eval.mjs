const baseUrl = process.env.INTENT_EVAL_BASE_URL || 'http://localhost:3000'

const cases = [
  ['how is my business performing', 'show_profit_loss'],
  ['where am i losing money', 'show_profit_loss'],
  ['show me revenue vs expenses', 'show_profit_loss'],
  ['open finance dashboard', 'show_profit_loss'],
  ['show financial insights', 'show_profit_loss'],
  ['which project has best hourly rate', 'show_project_profit'],
  ['what project is most profitable', 'show_project_profit'],
  ['show project revenue per hour', 'show_project_profit'],
  ['show low stock products', 'list_inventory'],
  ['draft legal notice for Rahul invoice INV-001', 'draft_legal_notice'],
  ['draft contract for Rahul project Website Redesign', 'draft_contract'],
  ['send saved contract to Rahul', 'send_document'],
  ['create payment link for invoice INV-001', 'create_payment_link'],
]

const payload = {
  projects: ['Website Redesign', 'Logo Design'],
  tasks: ['Homepage design', 'Logo concept'],
  clients: ['Rahul', 'Priya'],
}

async function runCase([prompt, expectedKind]) {
  const res = await fetch(`${baseUrl}/api/pm-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, prompt }),
  })

  if (!res.ok) {
    return {
      prompt,
      expectedKind,
      actualKind: `HTTP ${res.status}`,
      confidence: 0,
      ok: false,
    }
  }

  const json = await res.json()
  return {
    prompt,
    expectedKind,
    actualKind: json?.kind || 'none',
    confidence: typeof json?.confidence === 'number' ? json.confidence : 0,
    ok: json?.kind === expectedKind,
  }
}

try {
  const results = []
  for (const testCase of cases) {
    results.push(await runCase(testCase))
  }

  console.table(results)

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    console.error(`${failed.length} intent eval case(s) failed.`)
    process.exit(1)
  }

  console.log(`All ${results.length} intent eval cases passed.`)
} catch (error) {
  console.error(
    `Intent eval could not reach ${baseUrl}. Start the dev server first, then run npm run eval:intents.`,
  )
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
