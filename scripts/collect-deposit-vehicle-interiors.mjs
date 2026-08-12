import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const apply = process.argv.includes('--apply')
const image = (code) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/${code}`
const interiorMeta = {
  'Granite Black': { swatch: image('dw9a153245/images/deposit/interior/CI11.webp') },
  'Black': { swatch: image('dw9a153245/images/deposit/interior/CI11.webp') },
  'Saddle Brown': { swatch: image('dw65203801/images/deposit/interior/CI12.webp') },
  'Cotton Beige': { swatch: image('dw6b5810a9/images/deposit/interior/CI13.webp') },
  'Mocca Brown': { swatch: image('dw7e53f19e/images/deposit/interior/CI18.webp') },
  'Grey': { swatch: image('dw33eb76b4/images/deposit/interior/CI1M.webp') },
}
const names = (row) => {
  const p = row.product_name, c = row.color, eco = row.version.toLowerCase().includes('eco')
  if (p === 'VinFast VF 2') return ['Grey']
  if (p === 'VinFast VF 3' || p === 'VinFast VF 5') return [p === 'VinFast VF 3' ? 'Black' : 'Granite Black']
  if (p === 'VinFast VF 6' || p === 'VinFast VF 7') {
    if (eco) return ['Jet Black', 'Solar Ruby'].includes(c) ? ['Black', 'Cotton Beige'] : ['Black']
    if (c === 'Solar Ruby') return ['Cotton Beige']
    if (c === 'Jet Black') return ['Mocca Brown', 'Cotton Beige']
    return ['Mocca Brown']
  }
  if (p === 'VinFast VF 8' || p === 'VinFast VF 8 The All-New 2026') {
    const allowBrown = ['Infinity Blanc', 'Starburst Blue', 'Jet Black', 'Starburst Blue Body - Infinity Blanc Roof', 'Jet Black Body - Stealth Gray Roof'].includes(c)
    return allowBrown ? ['Granite Black', 'Saddle Brown'] : ['Granite Black']
  }
  if (p === 'VinFast VF 9') {
    const hasBeige = ['Jet Black', 'Crimson Red', 'Ivy Green'].includes(c)
    const hasBrown = !eco && c !== 'Crimson Red'
    return ['Granite Black', ...(hasBrown ? ['Saddle Brown'] : []), ...(hasBeige ? ['Cotton Beige'] : [])]
  }
  if (p === 'VinFast VF MPV 7') return ['Solar Ruby', 'Introspective Brown'].includes(c) ? ['Black'] : ['Black', 'Mocca Brown']
  return ['Granite Black']
}

const { data, error } = await supabase.from('vehicle_variants')
  .select('*').eq('product_type', 'CAR').eq('is_active', true)
if (error) throw error
let updates = 0, inserts = 0
for (const row of data ?? []) {
  const interiors = names(row)
  for (let i = 0; i < interiors.length; i++) {
    const interior = interiors[i]
    const existing = i === 0 ? row : data.find((candidate) =>
      candidate.product_name === row.product_name && candidate.version === row.version &&
      candidate.color === row.color && candidate.interior_color === interior)
    if (existing) {
      if (existing.interior_color !== interior) {
        if (apply) await supabase.from('vehicle_variants').update({ interior_color: interior }).eq('id', existing.id)
        updates++
      }
      continue
    }
    const payload = { ...row, interior_color: interior, sku: `${row.sku}-${interior.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}` }
    delete payload.id; delete payload.created_at; delete payload.updated_at
    if (apply) { const result = await supabase.from('vehicle_variants').insert(payload); if (result.error) throw result.error }
    inserts++
  }
}
console.log(`${apply ? 'Applied' : 'Preview'}: ${updates} interior updates, ${inserts} rows to insert`)
