import { NextResponse } from 'next/server'

import { auth0 } from '@/lib/auth0'
import {
  deleteDepositDraft,
  readDepositDraft,
  saveDepositDraft,
} from '@/lib/deposit/draft-server'
import {
  DepositDraftValidationError,
  parseDepositDraft,
} from '@/lib/deposit/draft'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function owner() {
  const session = await auth0.getSession()
  return typeof session?.user?.sub === 'string' ? session.user.sub : null
}

export async function GET() {
  const subject = await owner()
  if (!subject) return response({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)

  try {
    return response({ data: await readDepositDraft(subject) })
  } catch {
    return response({ error: { code: 'DRAFT_UNAVAILABLE' } }, 503)
  }
}

async function persistDraft(request: Request) {
  const subject = await owner()
  if (!subject) return response({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return response({ error: { code: 'INVALID_JSON' } }, 400)
  }

  try {
    const saved = await saveDepositDraft(subject, parseDepositDraft(body))
    if (!saved) return response({ error: { code: 'DRAFT_UNAVAILABLE' } }, 503)
    return response({ data: { savedAt: saved.savedAt } })
  } catch (error) {
    if (error instanceof DepositDraftValidationError) {
      return response({ error: { code: 'VALIDATION_FAILED', message: error.message } }, 400)
    }
    return response({ error: { code: 'DRAFT_UNAVAILABLE' } }, 503)
  }
}

export async function PUT(request: Request) {
  return persistDraft(request)
}

// sendBeacon uses POST while the page is being hidden or unloaded.
export async function POST(request: Request) {
  return persistDraft(request)
}

export async function DELETE() {
  const subject = await owner()
  if (!subject) return response({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)

  await deleteDepositDraft(subject)
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  })
}
