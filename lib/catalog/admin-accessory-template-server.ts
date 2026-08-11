import 'server-only'

import { revalidateTag } from 'next/cache'

import {
  parseAccessoryTemplateDefinition,
  type AdminAccessoryTemplateValidationError,
} from '@/lib/catalog/admin-accessory-template-validation'
import type {
  AccessoryTemplateDefinition,
  AdminAccessoryTemplate,
  AdminAccessoryTemplateMetadataPatch,
  AdminAccessoryTemplateVersion,
  AdminAccessoryTemplateWriteInput,
} from '@/lib/catalog/admin-accessory-template-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const ADMIN_ACCESSORY_TEMPLATE_TAG = 'admin-accessory-templates'

export class AdminAccessoryTemplatePersistenceError extends Error {
  constructor(
    readonly status: 404 | 409 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminAccessoryTemplatePersistenceError'
  }
}

type TemplateRow = {
  id: string
  code: string
  name: string
  group_name: string | null
  description: string | null
  display_order: number
  is_active: boolean
  current_version: number
  created_at: string
  updated_at: string
}

type VersionRow = {
  id: string
  template_id: string
  version: number
  definition_schema: string
  definition: unknown
  change_note: string | null
  created_at: string
}

function persistenceFailure(message = 'Không thể tải mẫu phụ kiện.') {
  return new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_READ_FAILED', message)
}

function legacyCodes(code: string) {
  const aliases: Record<string, string[]> = {
    'vehicle-fit': ['vehicle_fit'],
    'window-film': ['window_film'],
    apparel: ['apparel'],
    'ev-charger': ['ev_charger'],
  }
  return aliases[code] ?? []
}

function definition(value: unknown): AccessoryTemplateDefinition {
  try {
    return parseAccessoryTemplateDefinition(value)
  } catch (error) {
    const validation = error as AdminAccessoryTemplateValidationError
    throw persistenceFailure(`Định nghĩa mẫu trong database không hợp lệ: ${validation.message}`)
  }
}

function mapVersion(row: VersionRow): AdminAccessoryTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    definition: definition(row.definition),
    changeNote: row.change_note,
    createdAt: row.created_at,
  }
}

function mapTemplate(
  row: TemplateRow,
  current: VersionRow | undefined,
  usageCount: number,
): AdminAccessoryTemplate {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    groupName: row.group_name,
    description: row.description,
    displayOrder: row.display_order,
    isActive: row.is_active,
    currentVersion: row.current_version,
    usageCount,
    currentVersionId: current?.id ?? null,
    definition: current ? definition(current.definition) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function usageCounts(templateRows: TemplateRow[], versionRows: VersionRow[]) {
  const versionToTemplate = new Map(versionRows.map((row) => [row.id, row.template_id]))
  const counts = new Map<string, number>()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('products')
    .select('accessory_template_version_id, accessory_template_code')
    .eq('product_type', 'ACCESSORY')
  if (error) throw persistenceFailure('Không thể đếm số sản phẩm đang dùng mẫu.')
  const codeToTemplate = new Map(templateRows.flatMap((row) => [
    [row.code, row.id] as const,
    ...legacyCodes(row.code).map((alias) => [alias, row.id] as const),
  ]))
  for (const row of data ?? []) {
    const byVersion = typeof row.accessory_template_version_id === 'string'
      ? versionToTemplate.get(row.accessory_template_version_id)
      : undefined
    const byCode = typeof row.accessory_template_code === 'string'
      ? codeToTemplate.get(row.accessory_template_code)
      : undefined
    const templateId = byVersion ?? byCode
    if (templateId) counts.set(templateId, (counts.get(templateId) ?? 0) + 1)
  }
  return counts
}

export async function listAdminAccessoryTemplates(options: { includeInactive?: boolean } = {}) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('accessory_templates')
    .select('id,code,name,group_name,description,display_order,is_active,current_version,created_at,updated_at')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (!options.includeInactive) query = query.eq('is_active', true)
  const { data: templates, error: templateError } = await query
  if (templateError) throw persistenceFailure()
  const rows = (templates ?? []) as TemplateRow[]
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const { data: versions, error: versionError } = await supabase
    .from('accessory_template_versions')
    .select('id,template_id,version,definition_schema,definition,change_note,created_at')
    .in('template_id', ids)
  if (versionError) throw persistenceFailure('Không thể tải các phiên bản mẫu phụ kiện.')
  const versionRows = (versions ?? []) as VersionRow[]
  const counts = await usageCounts(rows, versionRows)
  return rows.map((row) => mapTemplate(
    row,
    versionRows.find((version) => version.template_id === row.id && version.version === row.current_version),
    counts.get(row.id) ?? 0,
  ))
}

export async function getAdminAccessoryTemplate(templateId: string, version?: number) {
  const supabase = getSupabaseAdmin()
  const { data: row, error } = await supabase
    .from('accessory_templates')
    .select('id,code,name,group_name,description,display_order,is_active,current_version,created_at,updated_at')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw persistenceFailure()
  if (!row) throw new AdminAccessoryTemplatePersistenceError(404, 'ACCESSORY_TEMPLATE_NOT_FOUND', 'Không tìm thấy mẫu phụ kiện.')
  const template = row as TemplateRow
  const targetVersion = version ?? template.current_version
  const { data: versionRow, error: versionError } = await supabase
    .from('accessory_template_versions')
    .select('id,template_id,version,definition_schema,definition,change_note,created_at')
    .eq('template_id', templateId)
    .eq('version', targetVersion)
    .maybeSingle()
  if (versionError) throw persistenceFailure('Không thể tải phiên bản mẫu phụ kiện.')
  if (!versionRow) throw new AdminAccessoryTemplatePersistenceError(404, 'ACCESSORY_TEMPLATE_VERSION_NOT_FOUND', 'Không tìm thấy phiên bản mẫu phụ kiện.')
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id,accessory_template_version_id,accessory_template_code')
    .eq('product_type', 'ACCESSORY')
  if (productsError) throw persistenceFailure('Không thể đếm số sản phẩm đang dùng mẫu.')
  const aliases = new Set([template.code, ...legacyCodes(template.code)])
  const usageCount = (products ?? []).filter((product) => (
    product.accessory_template_version_id === versionRow.id
    || (typeof product.accessory_template_code === 'string' && aliases.has(product.accessory_template_code))
  )).length
  return {
    ...mapTemplate(template, versionRow as VersionRow, usageCount),
    version: mapVersion(versionRow as VersionRow),
  }
}

export async function createAdminAccessoryTemplate(input: AdminAccessoryTemplateWriteInput) {
  const supabase = getSupabaseAdmin()
  const { data: template, error: templateError } = await supabase
    .from('accessory_templates')
    .insert({
      code: input.code,
      name: input.name,
      group_name: input.groupName,
      description: input.description,
      display_order: input.displayOrder,
      is_active: input.isActive,
      current_version: 1,
    })
    .select('id,code,name,group_name,description,display_order,is_active,current_version,created_at,updated_at')
    .single()
  if (templateError) {
    if (templateError.code === '23505') throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_DUPLICATE', 'Mã mẫu phụ kiện đã tồn tại.')
    throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_CREATE_FAILED', 'Không thể tạo mẫu phụ kiện.')
  }
  const { data: version, error: versionError } = await supabase
    .from('accessory_template_versions')
    .insert({
      template_id: template.id,
      version: 1,
      definition_schema: input.definition.schema,
      definition: input.definition,
      change_note: input.changeNote,
    })
    .select('id,template_id,version,definition_schema,definition,change_note,created_at')
    .single()
  if (versionError) {
    await supabase.from('accessory_templates').delete().eq('id', template.id)
    throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_VERSION_CREATE_FAILED', 'Không thể tạo phiên bản mẫu phụ kiện.')
  }
  revalidateTag(ADMIN_ACCESSORY_TEMPLATE_TAG)
  return {
    ...mapTemplate(template as TemplateRow, version as VersionRow, 0),
    version: mapVersion(version as VersionRow),
  }
}

export async function updateAdminAccessoryTemplate(templateId: string, patch: AdminAccessoryTemplateMetadataPatch) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('accessory_templates')
    .update({
      ...(patch.code === undefined ? {} : { code: patch.code }),
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.groupName === undefined ? {} : { group_name: patch.groupName }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.displayOrder === undefined ? {} : { display_order: patch.displayOrder }),
      ...(patch.isActive === undefined ? {} : { is_active: patch.isActive }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
  if (patch.expectedUpdatedAt) query = query.eq('updated_at', patch.expectedUpdatedAt)
  const { data, error } = await query
    .select('id,code,name,group_name,description,display_order,is_active,current_version,created_at,updated_at')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_DUPLICATE', 'Mã mẫu phụ kiện đã tồn tại.')
    throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_UPDATE_FAILED', 'Không thể cập nhật mẫu phụ kiện.')
  }
  if (!data) {
    if (patch.expectedUpdatedAt) throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_CONFLICT', 'Mẫu phụ kiện đã được cập nhật bởi người khác.')
    throw new AdminAccessoryTemplatePersistenceError(404, 'ACCESSORY_TEMPLATE_NOT_FOUND', 'Không tìm thấy mẫu phụ kiện.')
  }
  revalidateTag(ADMIN_ACCESSORY_TEMPLATE_TAG)
  return (await getAdminAccessoryTemplate(templateId))
}

export async function createAdminAccessoryTemplateVersion(
  templateId: string,
  definitionInput: AccessoryTemplateDefinition,
  changeNote: string | null,
  expectedUpdatedAt?: string,
) {
  const supabase = getSupabaseAdmin()
  const { data: row, error } = await supabase
    .from('accessory_templates')
    .select('id,code,name,group_name,description,display_order,is_active,current_version,created_at,updated_at')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_READ_FAILED', 'Không thể tải mẫu phụ kiện.')
  if (!row) throw new AdminAccessoryTemplatePersistenceError(404, 'ACCESSORY_TEMPLATE_NOT_FOUND', 'Không tìm thấy mẫu phụ kiện.')
  const template = row as TemplateRow
  if (expectedUpdatedAt && template.updated_at !== expectedUpdatedAt) {
    throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_CONFLICT', 'Mẫu phụ kiện đã được cập nhật bởi người khác.')
  }
  const nextVersion = template.current_version + 1
  const { data: version, error: versionError } = await supabase
    .from('accessory_template_versions')
    .insert({
      template_id: templateId,
      version: nextVersion,
      definition_schema: definitionInput.schema,
      definition: definitionInput,
      change_note: changeNote,
    })
    .select('id,template_id,version,definition_schema,definition,change_note,created_at')
    .single()
  if (versionError) {
    if (versionError.code === '23505') throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_VERSION_CONFLICT', 'Mẫu vừa được cập nhật. Hãy tải lại trước khi lưu.')
    throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_VERSION_CREATE_FAILED', 'Không thể tạo phiên bản mẫu phụ kiện.')
  }
  const { data: updatedTemplate, error: updateError } = await supabase
    .from('accessory_templates')
    .update({ current_version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('current_version', template.current_version)
    .select('id')
    .maybeSingle()
  if (updateError) throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_UPDATE_FAILED', 'Không thể kích hoạt phiên bản mẫu mới.')
  if (!updatedTemplate) {
    await supabase.from('accessory_template_versions').delete().eq('id', version.id)
    throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_CONFLICT', 'Mẫu vừa được cập nhật. Hãy tải lại trước khi lưu.')
  }
  revalidateTag(ADMIN_ACCESSORY_TEMPLATE_TAG)
  return {
    ...mapTemplate({ ...template, current_version: nextVersion, updated_at: new Date().toISOString() }, version as VersionRow, 0),
    version: mapVersion(version as VersionRow),
  }
}

export async function deleteAdminAccessoryTemplate(templateId: string) {
  const template = await getAdminAccessoryTemplate(templateId)
  if (template.usageCount > 0) {
    throw new AdminAccessoryTemplatePersistenceError(409, 'ACCESSORY_TEMPLATE_IN_USE', 'Mẫu đang được dùng bởi sản phẩm và chỉ có thể tạm ngừng.')
  }
  const { data, error } = await getSupabaseAdmin()
    .from('accessory_templates')
    .delete()
    .eq('id', templateId)
    .select('id')
    .maybeSingle()
  if (error) throw new AdminAccessoryTemplatePersistenceError(500, 'ACCESSORY_TEMPLATE_DELETE_FAILED', 'Không thể xóa mẫu phụ kiện.')
  if (!data) throw new AdminAccessoryTemplatePersistenceError(404, 'ACCESSORY_TEMPLATE_NOT_FOUND', 'Không tìm thấy mẫu phụ kiện.')
  revalidateTag(ADMIN_ACCESSORY_TEMPLATE_TAG)
  return { id: templateId }
}
