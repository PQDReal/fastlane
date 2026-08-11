import { NextResponse } from 'next/server'

import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { requireAdminMutationIdentity } from '@/lib/auth/admin-mutation-identity'
import { parseAccessoryDraftWriteInput, listAdminAccessoryDrafts, saveAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft-server'

async function identity(request: Request) {
  const claims = await authorizeAdminCatalogRequest(request)
  return requireAdminMutationIdentity(request, claims.subject)
}

export async function GET(request: Request) {
  try {
    const user = await identity(request)
    return NextResponse.json({ data: await listAdminAccessoryDrafts(user.id) })
  } catch (error) { return apiErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const user = await identity(request)
    const input = parseAccessoryDraftWriteInput(await readJsonBody(request))
    return NextResponse.json({ data: await saveAdminAccessoryDraft(user.id, input) }, { status: input.draftId ? 200 : 201 })
  } catch (error) { return apiErrorResponse(error) }
}
