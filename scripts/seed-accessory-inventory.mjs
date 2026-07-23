import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadLocalEnvironment() {
  const text = fs.readFileSync('.env.local', 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadLocalEnvironment()

if (process.env.ALLOW_ACCESSORY_INVENTORY_SEED !== '1') {
  throw new Error(
    'Set ALLOW_ACCESSORY_INVENTORY_SEED=1 to confirm the development inventory seed.',
  )
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  throw new Error('Supabase server environment is missing.')
}

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: products, error: catalogError } = await db
  .from('products')
  .select(`
    id,
    name,
    product_variants!inner(
      id,
      sku,
      is_active,
      inventory_items(on_hand_quantity)
    )
  `)
  .eq('is_active', true)
  .eq('product_type', 'ACCESSORY')
  .eq('product_variants.is_active', true)
  .order('name', { ascending: true })

if (catalogError) throw new Error(catalogError.message)

const targets = (products || [])
  .flatMap((product) =>
    (product.product_variants || []).map((variant) => ({
      productName: product.name,
      variantId: variant.id,
      sku: variant.sku,
      quantity: Array.isArray(variant.inventory_items)
        ? variant.inventory_items[0]?.on_hand_quantity
        : variant.inventory_items?.on_hand_quantity,
    })),
  )
  .filter((variant) => Number(variant.quantity || 0) === 0)
  .slice(0, 5)

if (targets.length === 0) {
  console.log('No zero-stock accessory variants need a development seed.')
  process.exit(0)
}

for (const target of targets) {
  const { data, error } = await db
    .from('inventory_items')
    .update({ on_hand_quantity: 10, updated_at: new Date().toISOString() })
    .eq('variant_id', target.variantId)
    .eq('on_hand_quantity', 0)
    .select('variant_id, on_hand_quantity')
    .maybeSingle()

  if (error) throw new Error(`${target.sku}: ${error.message}`)
  if (data) {
    console.log(`${target.sku} | ${target.productName} | 0 -> 10`)
  }
}
