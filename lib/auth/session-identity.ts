import 'server-only'

import type { SessionData } from '@auth0/nextjs-auth0/types'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FastlaneSessionData = SessionData & {
  localUserId?: unknown
}

export function isLocalUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function readLocalUserId(session: SessionData | null | undefined): string | null {
  if (!session || !isLocalUserId((session as FastlaneSessionData).localUserId)) {
    return null
  }
  return (session as FastlaneSessionData).localUserId as string
}

export function withLocalUserId(
  session: SessionData,
  localUserId: string,
): FastlaneSessionData {
  return {
    ...session,
    localUserId,
  }
}
