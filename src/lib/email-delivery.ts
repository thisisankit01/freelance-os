import { clerkClient } from '@clerk/nextjs/server'

export const SOLOOS_FROM_EMAIL = 'SoloOS <noreply@soloos.site>'
export const SOLOOS_RAW_EMAIL = 'noreply@soloos.site'

export function uniqueRecipients(...values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const recipients: string[] = []

  for (const value of values) {
    const email = String(value || '').trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    recipients.push(email)
  }

  return recipients
}

export async function getClerkUserEmail(userId: string) {
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  return user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || null
}
