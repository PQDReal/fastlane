import { NextResponse } from 'next/server'

import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { requireAdminMutationIdentity } from '@/lib/auth/admin-mutation-identity'
import { archiveAdminAccessoryDraft, getAdminAccessoryDraft, parseAccessoryDraftWriteInput, saveAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft-server'

type Context = { params: Promise<{ draftId: string }> }

async function identity(request: Request) {
  const claims = await authorizeAdminCatalogRequest(request)
  return requireAdminMutationIdentity(request, claims.subject)
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await identity(request)
    const { draftId } = await context.params
    return NextResponse.json({ data: await getAdminAccessoryDraft(user.id, draftId) })
  } catch (error) { return apiErrorResponse(error) }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await identity(request)
    const { draftId } = await context.params
    const input = parseAccessoryDraftWriteInput(await readJsonBody(request))
    return NextResponse.json({ data: await saveAdminAccessoryDraft(user.id, { ...input, draftId }) })
  } catch (error) { return apiErrorResponse(error) }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await identity(request)
    const { draftId } = await context.params
    const revision = new URL(request.url).searchParams.get('revision')
    const expectedRevision = revision == null ? undefined : Number(revision)
    return NextResponse.json({ data: await archiveAdminAccessoryDraft(user.id, draftId, expectedRevision) })
  } catch (error) { return apiErrorResponse(error) }
}
