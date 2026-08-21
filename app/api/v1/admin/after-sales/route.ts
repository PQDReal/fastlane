import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/current-user'
import { authorizeAdminAfterSalesRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const FACT_COLUMNS = [
  'fact_id',
  'fact_group_id',
  'canonical_key',
  'primary_source_id',
  'service_type',
  'vehicle_type',
  'powertrain',
  'model',
  'subject',
  'policy_entity',
  'battery_chemistry',
  'usage_condition',
  'applicability',
  'action',
  'fact_type',
  'value_numeric',
  'value_text',
  'unit',
  'qualifier',
  'interval_relation',
  'interval_group_id',
  'interval_group_distance_policy',
  'distance_policy',
  'confidence',
  'source_review_status',
  'approval_status',
  'publication_status',
  'review_reasons',
  'release_id',
  'reviewer_id',
  'reviewed_at',
  'approved_by',
  'approved_at',
  'approval_note',
  'created_at',
  'updated_at',
].join(',')

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function asText(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${field} không hợp lệ.`)
  }
  return value.trim()
}

function optionalText(value: unknown, max = 500): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > max) throw new Error('Giá trị văn bản không hợp lệ.')
  return value.trim() || null
}

function parseFactInput(body: Record<string, unknown>) {
  const valueNumeric = Number(body.value_numeric)
  const confidence = Number(body.confidence)
  if (!Number.isFinite(valueNumeric) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Giá trị số hoặc confidence không hợp lệ.')
  }

  const serviceType = asText(body.service_type, 'service_type', 80)
  const vehicleType = asText(body.vehicle_type, 'vehicle_type', 40)
  const subject = asText(body.subject, 'subject', 120)
  const factType = asText(body.fact_type, 'fact_type', 120)

  return {
    fact_group_id: optionalText(body.fact_group_id, 160) ?? `admin-${crypto.randomUUID()}`,
    canonical_key: optionalText(body.canonical_key, 240) ?? `admin:${crypto.randomUUID()}`,
    primary_source_id: asText(body.primary_source_id, 'primary_source_id', 160),
    source_ids: [asText(body.primary_source_id, 'primary_source_id', 160)],
    service_type: serviceType,
    vehicle_type: vehicleType,
    powertrain: optionalText(body.powertrain, 40) ?? 'all',
    model: optionalText(body.model, 160),
    subject,
    policy_entity: optionalText(body.policy_entity, 160) ?? subject,
    battery_chemistry: optionalText(body.battery_chemistry, 40) ?? 'not_applicable',
    usage_condition: optionalText(body.usage_condition, 160) ?? 'standard_use',
    applicability: optionalText(body.applicability, 160) ?? 'all',
    action: optionalText(body.action, 160) ?? 'inspect',
    fact_type: factType,
    value_numeric: valueNumeric,
    value_text: optionalText(body.value_text, 500) ?? String(body.value_numeric),
    unit: asText(body.unit, 'unit', 40),
    qualifier: optionalText(body.qualifier, 160),
    interval_relation: optionalText(body.interval_relation, 40),
    interval_group_id: optionalText(body.interval_group_id, 160),
    interval_group_distance_policy: optionalText(body.interval_group_distance_policy, 80),
    distance_policy: optionalText(body.distance_policy, 80) ?? 'not_stated',
    confidence,
    source_review_status: 'admin_draft',
    approval_status: 'pending',
    publication_status: 'review_required',
    review_reasons: ['admin_created_or_edited'],
    release_id: null,
  }
}

export async function GET(request: Request) {
  try {
    await authorizeAdminAfterSalesRequest(request)
  } catch (error) {
    return authError(error)
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const search = searchParams
    .get('search')
    ?.trim()
    .replace(/[%_(),]/g, '')
  const supabase = getSupabaseAdmin()
  let factsQuery = supabase
    .from('after_sales_facts')
    .select(FACT_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (status !== 'all') factsQuery = factsQuery.eq('approval_status', status)
  if (search)
    factsQuery = factsQuery.or(`model.ilike.%${search}%,subject.ilike.%${search}%,fact_type.ilike.%${search}%`)

  const [
    { data: facts, error: factsError },
    { data: sources, error: sourcesError },
    { data: release, error: releaseError },
  ] = await Promise.all([
    factsQuery,
    supabase
      .from('after_sales_sources')
      .select('source_id,title,source_url,service_type,vehicle_type,availability,updated_at')
      .order('updated_at', { ascending: false }),
    supabase.from('after_sales_current_published_release').select('release_id,published_at,counts').maybeSingle(),
  ])

  if (factsError || sourcesError || releaseError) {
    return NextResponse.json(
      { error: factsError?.message ?? sourcesError?.message ?? releaseError?.message },
      { status: 500 },
    )
  }
  return NextResponse.json({ data: { facts: facts ?? [], sources: sources ?? [], publishedRelease: release ?? null } })
}

export async function POST(request: Request) {
  try {
    await authorizeAdminAfterSalesRequest(request)
  } catch (error) {
    return authError(error)
  }

  try {
    const payload = parseFactInput(await request.json())
    const { data, error } = await getSupabaseAdmin().rpc('admin_after_sales_upsert_fact', {
      p_fact_id: `admin-${crypto.randomUUID()}`,
      p_payload: payload,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 400 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dữ liệu fact không hợp lệ.' },
      { status: 400 },
    )
  }
}
