export type CatalogServiceLabel = {
  id: string
  code: string
  name: string
  description: string | null
  displayOrder: number
  isActive: boolean
  assignmentCount: number
}

export type ServiceLabelInput = {
  code: string
  name: string
  description: string | null
  displayOrder: number
  isActive: boolean
}

type InputResult =
  | { ok: true; value: ServiceLabelInput }
  | { ok: false; error: string }

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const INPUT_KEYS = new Set(['code', 'name', 'description', 'displayOrder', 'isActive'])

export function parseServiceLabelInput(value: unknown): InputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Dữ liệu nhãn dịch vụ không hợp lệ.' }
  }

  const input = value as Record<string, unknown>
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    return { ok: false, error: 'Dữ liệu nhãn dịch vụ chứa trường không được hỗ trợ.' }
  }
  const code = typeof input.code === 'string' ? input.code.trim().toLowerCase() : ''
  const name = typeof input.name === 'string' ? input.name.normalize('NFC').trim() : ''
  const description = typeof input.description === 'string'
    ? input.description.normalize('NFC').trim() || null
    : null
  const displayOrder = typeof input.displayOrder === 'number'
    ? input.displayOrder
    : Number(input.displayOrder)

  if (!CODE_PATTERN.test(code) || code.length > 80) {
    return { ok: false, error: 'Mã nhãn phải bắt đầu bằng chữ thường và chỉ gồm chữ, số hoặc dấu gạch dưới.' }
  }
  if (!name || name.length > 160) {
    return { ok: false, error: 'Tên nhãn phải có từ 1 đến 160 ký tự.' }
  }
  if (description !== null && description.length > 1000) {
    return { ok: false, error: 'Mô tả nhãn không được vượt quá 1.000 ký tự.' }
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1_000_000) {
    return { ok: false, error: 'Thứ tự hiển thị phải là số nguyên không âm.' }
  }
  if ('isActive' in input && typeof input.isActive !== 'boolean') {
    return { ok: false, error: 'Trạng thái nhãn dịch vụ không hợp lệ.' }
  }

  return {
    ok: true,
    value: {
      code,
      name,
      description,
      displayOrder,
      isActive: input.isActive !== false,
    },
  }
}

export function parseServiceLabelIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null
  const ids = value.filter((item): item is string => (
    typeof item === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)
  ))
  if (ids.length !== value.length) return null
  return [...new Set(ids)]
}

export function matchingProductIdsForLabels(
  assignments: Array<{ productId: string; serviceLabelId: string }>,
  selectedLabelIds: string[],
): string[] {
  if (selectedLabelIds.length === 0) return []
  const selected = new Set(selectedLabelIds)
  const matches = new Map<string, Set<string>>()

  for (const assignment of assignments) {
    if (!selected.has(assignment.serviceLabelId)) continue
    const labels = matches.get(assignment.productId) ?? new Set<string>()
    labels.add(assignment.serviceLabelId)
    matches.set(assignment.productId, labels)
  }

  return [...matches.entries()]
    .filter(([, labels]) => labels.size === selected.size)
    .map(([productId]) => productId)
}

export function mapServiceLabelRow(
  row: Record<string, unknown>,
  assignmentCount = 0,
): CatalogServiceLabel {
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    displayOrder: Number(row.display_order) || 0,
    isActive: row.is_active === true,
    assignmentCount,
  }
}
