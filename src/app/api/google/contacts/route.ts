import { auth, clerkClient } from '@clerk/nextjs/server'

function best<T>(items: T[] | undefined, pick: (item: T) => string | undefined) {
  return items?.map(pick).find(Boolean) ?? ''
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await clerkClient()
  const { data: tokens } = await client.users.getUserOauthAccessToken(userId, 'oauth_google')
  const accessToken = tokens?.[0]?.token
  if (!accessToken) {
    return Response.json({ error: 'Google is not connected.' }, { status: 400 })
  }

  const res = await fetch(
    'https://people.googleapis.com/v1/people/me/connections?pageSize=500&personFields=names,emailAddresses,phoneNumbers,organizations,addresses',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    const details = await res.json().catch(() => ({}))
    return Response.json(
      {
        error:
          'Could not read Google Contacts. Reconnect Google with Contacts permission, or paste/export contacts into AI import.',
        details,
      },
      { status: 400 },
    )
  }

  const json = await res.json()
  const contacts = ((json.connections ?? []) as Array<Record<string, unknown>>)
    .map((person) => {
      const names = person.names as Array<{ displayName?: string }> | undefined
      const emails = person.emailAddresses as Array<{ value?: string }> | undefined
      const phones = person.phoneNumbers as Array<{ value?: string }> | undefined
      const organizations = person.organizations as Array<{ name?: string }> | undefined
      const addresses = person.addresses as Array<{ city?: string; formattedValue?: string }> | undefined
      return {
        name: best(names, (n) => n.displayName),
        email: best(emails, (e) => e.value),
        phone: best(phones, (p) => p.value),
        company: best(organizations, (o) => o.name),
        city: best(addresses, (a) => a.city || a.formattedValue),
        status: 'active',
        notes: 'Imported from Google Contacts',
      }
    })
    .filter((contact) => contact.name || contact.email || contact.phone)

  return Response.json({ data: contacts })
}
