const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.')
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
}

async function probe(name, body) {
  const startedAt = performance.now()
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    const payload = await response.json().catch(() => null)
    return {
      name,
      ok: response.ok,
      status: response.status,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      code: response.ok ? null : payload?.code ?? null,
    }
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      code: error instanceof Error ? error.name : 'NETWORK_ERROR',
    }
  }
}

const results = await Promise.all([
  probe('list_admin_inventory', {
    p_search: null,
    p_product_type: 'ALL',
    p_product_id: null,
    p_variant: 'ALL',
    p_color: 'ALL',
    p_interior_color: 'ALL',
    p_status: 'ALL',
    p_activity: 'ALL',
    p_limit: 1,
    p_cursor: null,
  }),
  probe('get_admin_inventory_filter_options', {
    p_product_type: 'ALL',
    p_product_id: null,
  }),
])

for (const result of results) {
  console.log(`${result.name}: ${result.ok ? 'ACTIVE' : 'MISSING'} (${result.status}, ${result.durationMs} ms)`)
}

if (results.some((result) => !result.ok)) {
  console.error('Migration 057 chưa hoạt động đầy đủ; ứng dụng sẽ dùng fallback legacy cho đến khi migration được áp dụng.')
  process.exitCode = 1
}
