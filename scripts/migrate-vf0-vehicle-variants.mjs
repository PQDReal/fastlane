import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const slug = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-')
const priceOf = (row) => Number(row.price ?? row.original_price ?? row.sale_price ?? 0)

const [{ data: vehicleRows, error: vehicleError }, { data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
  supabase.from('vehicle_variants').select('*').eq('product_type', 'CAR'),
  supabase.from('products').select('id,name,product_type').eq('product_type', 'CAR'),
  supabase.from('product_variants').select('id,product_id,sku,name,original_price,sale_price,deposit_amount,is_active'),
])
if (vehicleError || productError || variantError) throw new Error((vehicleError ?? productError ?? variantError).message)

const vf0Rows = (vehicleRows ?? []).filter((row) => /VF\s*0/i.test(`${row.product_name ?? ''} ${row.variant_name ?? ''} ${row.version ?? ''}`))
if (vf0Rows.length === 0) {
  console.log('No VF0 vehicle_variants rows found.')
  process.exit(0)
}
const product = (products ?? []).find((item) => /VF\s*0/i.test(item.name ?? ''))
if (!product) throw new Error('VF0 vehicle_variants exist but no matching active CAR product was found.')

const existingBySku = new Map((variants ?? []).map((item) => [item.sku, item]))
const planned = []
for (const row of vf0Rows) {
  if (row.product_variant_id) {
    planned.push({ row, variantId: row.product_variant_id, action: 'already-linked' })
    continue
  }
  const color = clean(row.color) || 'DEFAULT'
  const baseSku = clean(row.sku) || `VINFAST-VF0-${slug(row.version || row.variant_name || color)}`
  const existing = existingBySku.get(baseSku)
  planned.push({ row, variantId: existing?.id ?? null, sku: baseSku, action: existing ? 'reuse-sku' : 'create-variant' })
}

console.log(JSON.stringify({ apply, product: product.name, vf0Rows: planned.map(({ row, ...item }) => ({ rowId: row.id, color: row.color, version: row.version, variantName: row.variant_name, ...item })) }, null, 2))
if (!apply) {
  console.log('Dry run only. Re-run with --apply to write VF0 mappings and inventory rows.')
  process.exit(0)
}

for (const item of planned) {
  let variantId = item.variantId
  if (!variantId) {
    const row = item.row
    const name = clean(row.variant_name) || clean(row.version) || `VF0 ${clean(row.color)}`
    const inserted = await supabase.from('product_variants').insert({
      product_id: product.id,
      sku: item.sku,
      name,
      original_price: priceOf(row),
      sale_price: row.sale_price == null ? null : priceOf(row),
      deposit_amount: row.deposit_amount == null ? 0 : Number(row.deposit_amount),
      is_active: row.is_active !== false,
    }).select('id').single()
    if (inserted.error) throw new Error(`VF0 product variant ${item.sku}: ${inserted.error.message}`)
    variantId = inserted.data.id
  }
  const link = await supabase.from('vehicle_variants').update({ product_variant_id: variantId }).eq('id', item.row.id)
  if (link.error) throw new Error(`VF0 vehicle row ${item.row.id}: ${link.error.message}`)
  const inventory = await supabase.from('inventory_items').upsert({ variant_id: variantId, on_hand_quantity: 0 }, { onConflict: 'variant_id', ignoreDuplicates: true })
  if (inventory.error) throw new Error(`VF0 inventory ${variantId}: ${inventory.error.message}`)
}
console.log(`Applied VF0 migration for ${planned.length} row(s); new inventory starts at 0.`)
