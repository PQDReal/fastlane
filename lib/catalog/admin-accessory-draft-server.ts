import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import {
  ADMIN_ACCESSORY_SESSION_VERSION,
  normalizeAdminAccessoryDraft,
} from '@/lib/catalog/admin-accessory-session'
import type { AdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PAYLOAD_BYTES = 512_000
const SELECT = 'id,client_key,product_id,root_category_id,template_version_id,name_snapshot,payload,schema_version,revision,status,created_at,updated_at,last_opened_at'

export type AdminAccessoryDraftRecord = {
  id: string
  clientKey: string
  productId: string | null
  rootCategoryId: string | null
  templateVersionId: string | null
  name: string
  draft: AdminAccessoryDraft
  schemaVersion: number
  revision: number
  status: 'DRAFT' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

export type AccessoryDraftWriteInput = {
  draftId?: string
  clientKey: string
  productId?: string | null
  expectedRevision?: number
  draft: unknown
}

function uuid(value: unknown, field: string, nullable = false) {
  if (value == null && nullable) return null
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ApiRouteError(422, 'VALIDATION_ERROR', `${field} không hợp lệ.`)
  }
  return value
}

export function parseAccessoryDraftWriteInput(body: unknown): AccessoryDraftWriteInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiRouteError(422, 'VALIDATION_ERROR', 'Dữ liệu bản nháp không hợp lệ.')
  }
  const row = body as Record<string, unknown>
  const clientKey = uuid(row.clientKey, 'clientKey') as string
  const draftId = row.draftId == null ? undefined : uuid(row.draftId, 'draftId') as string
  const productId = row.productId == null ? null : uuid(row.productId, 'productId') as string
  const expectedRevision = row.expectedRevision == null ? undefined : Number(row.expectedRevision)
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
    throw new ApiRouteError(422, 'VALIDATION_ERROR', 'revision không hợp lệ.')
  }
  if (!row.draft || typeof row.draft !== 'object' || Array.isArray(row.draft)) {
    throw new ApiRouteError(422, 'VALIDATION_ERROR', 'Thiếu nội dung bản nháp.')
  }
  let serialized: string
  try { serialized = JSON.stringify(row.draft) } catch { throw new ApiRouteError(422, 'VALIDATION_ERROR', 'Nội dung bản nháp không thể lưu.') }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new ApiRouteError(413, 'DRAFT_TOO_LARGE', 'Bản nháp vượt quá dung lượng cho phép.')
  }
  return { draftId, clientKey, productId, expectedRevision, draft: row.draft }
}

function mapRecord(row: Record<string, unknown>): AdminAccessoryDraftRecord {
  const rootCategoryId = typeof row.root_category_id === 'string' ? row.root_category_id : ''
  return {
    id: String(row.id),
    clientKey: String(row.client_key),
    productId: typeof row.product_id === 'string' ? row.product_id : null,
    rootCategoryId: rootCategoryId || null,
    templateVersionId: typeof row.template_version_id === 'string' ? row.template_version_id : null,
    name: typeof row.name_snapshot === 'string' ? row.name_snapshot : '',
    draft: normalizeAdminAccessoryDraft(row.payload, rootCategoryId),
    schemaVersion: Number(row.schema_version) || ADMIN_ACCESSORY_SESSION_VERSION,
    revision: Number(row.revision) || 1,
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: typeof row.last_opened_at === 'string' ? row.last_opened_at : null,
  }
}

function mapDbError(error: { code?: string; message?: string }): never {
  if (error.code === '23505') throw new ApiRouteError(409, 'DRAFT_CONFLICT', 'Bản nháp đã tồn tại hoặc vừa được cập nhật.')
  if (error.code === '40001') throw new ApiRouteError(409, 'DRAFT_CONFLICT', 'Bản nháp vừa được cập nhật ở nơi khác.')
  if (error.code === '23503' || error.code === '22P02' || error.code === '23514') throw new ApiRouteError(422, 'VALIDATION_ERROR', 'Dữ liệu bản nháp không hợp lệ.')
  if (error.code === '42P01' || error.code === '42703') throw new ApiRouteError(503, 'DRAFT_STORAGE_UNAVAILABLE', 'Hệ thống lưu nháp chưa sẵn sàng.')
  throw new ApiRouteError(500, 'DRAFT_STORAGE_ERROR', error.message || 'Không thể lưu bản nháp.')
}

export async function listAdminAccessoryDrafts(ownerUserId: string) {
  const { data, error } = await getSupabaseAdmin().from('admin_accessory_drafts')
    .select(SELECT).eq('owner_user_id', ownerUserId).eq('status', 'DRAFT')
    .order('updated_at', { ascending: false })
  if (error) mapDbError(error)
  return (data ?? []).map((row) => mapRecord(row as Record<string, unknown>))
}

export async function getAdminAccessoryDraft(ownerUserId: string, draftId: string) {
  uuid(draftId, 'draftId')
  const { data, error } = await getSupabaseAdmin().from('admin_accessory_drafts')
    .select(SELECT).eq('owner_user_id', ownerUserId).eq('id', draftId).maybeSingle()
  if (error) mapDbError(error)
  if (!data) throw new ApiRouteError(404, 'DRAFT_NOT_FOUND', 'Không tìm thấy bản nháp.')
  const client = getSupabaseAdmin()
  await client.from('admin_accessory_drafts').update({ last_opened_at: new Date().toISOString() }).eq('id', draftId).eq('owner_user_id', ownerUserId)
  return mapRecord(data as Record<string, unknown>)
}

export async function saveAdminAccessoryDraft(ownerUserId: string, input: AccessoryDraftWriteInput) {
  if (input.draftId && input.expectedRevision === undefined) {
    throw new ApiRouteError(428, 'DRAFT_REVISION_REQUIRED', 'Thiếu revision để bảo vệ bản nháp khỏi bị ghi đè.')
  }
  const rawDraft = input.draft as Record<string, unknown>
  const rawRootCategoryId = typeof rawDraft.rootCategoryId === 'string' && UUID_PATTERN.test(rawDraft.rootCategoryId)
    ? rawDraft.rootCategoryId
    : ''
  const draft = normalizeAdminAccessoryDraft(input.draft, rawRootCategoryId)
  const rootCategoryId = UUID_PATTERN.test(draft.rootCategoryId) ? draft.rootCategoryId : null
  const templateVersionId = draft.templateVersionId && UUID_PATTERN.test(draft.templateVersionId) ? draft.templateVersionId : null
  const row = {
    owner_user_id: ownerUserId,
    client_key: input.clientKey,
    product_id: input.productId ?? null,
    root_category_id: rootCategoryId,
    template_version_id: templateVersionId,
    name_snapshot: draft.name.trim().slice(0, 200),
    payload: input.draft,
    schema_version: ADMIN_ACCESSORY_SESSION_VERSION,
    updated_at: new Date().toISOString(),
  }
  const client = getSupabaseAdmin()
  if (input.draftId) {
    const query = client.from('admin_accessory_drafts').update({ ...row, revision: (input.expectedRevision ?? 0) + 1 })
      .eq('id', input.draftId).eq('owner_user_id', ownerUserId).eq('status', 'DRAFT')
    if (input.expectedRevision !== undefined) query.eq('revision', input.expectedRevision)
    const { data, error } = await query.select(SELECT).maybeSingle()
    if (error) mapDbError(error)
    if (!data) throw new ApiRouteError(409, 'DRAFT_CONFLICT', 'Bản nháp đã thay đổi, hãy tải lại trước khi lưu.')
    return mapRecord(data as Record<string, unknown>)
  }
  const { data: existing, error: findError } = await client.from('admin_accessory_drafts').select('id,revision')
    .eq('owner_user_id', ownerUserId).eq('client_key', input.clientKey).eq('status', 'DRAFT').maybeSingle()
  if (findError) mapDbError(findError)
  if (existing) return saveAdminAccessoryDraft(ownerUserId, { ...input, draftId: String(existing.id), expectedRevision: input.expectedRevision ?? Number(existing.revision) })
  const { data, error } = await client.from('admin_accessory_drafts').insert({ ...row, revision: 1 }).select(SELECT).single()
  if (error) mapDbError(error)
  return mapRecord(data as Record<string, unknown>)
}

export async function archiveAdminAccessoryDraft(ownerUserId: string, draftId: string, expectedRevision?: number) {
  uuid(draftId, 'draftId')
  const query = getSupabaseAdmin().from('admin_accessory_drafts').update({ status: 'ARCHIVED', revision: (expectedRevision ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', draftId).eq('owner_user_id', ownerUserId).eq('status', 'DRAFT')
  if (expectedRevision !== undefined) query.eq('revision', expectedRevision)
  const { data, error } = await query.select(SELECT).maybeSingle()
  if (error) mapDbError(error)
  if (!data) throw new ApiRouteError(409, 'DRAFT_CONFLICT', 'Bản nháp đã thay đổi hoặc không còn tồn tại.')
  return mapRecord(data as Record<string, unknown>)
}
