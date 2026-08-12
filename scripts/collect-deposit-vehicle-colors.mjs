import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const apply = process.argv.includes('--apply')

// Canonical advanced-colour list confirmed for the deposit page. A row is
// keyed by product + exterior colour, so every version receives the same
// classification. All colours not listed here are STANDARD.
const advancedByModel = {
  'VinFast VF 0': {},
  'VinFast VF 2': {
    'Desat Silver': 8000000, 'Sky Blue': 8000000, 'Summer Yellow': 8000000,
    'Urban Mint': 8000000, 'Pebble Beige': 8000000,
  },
  'VinFast VF 3': {
    'Zenith Grey': 8000000, 'Urban Mint': 8000000, 'Infinity Blanc': 8000000,
  },
  'VinFast VF 5': {
    'Infinity Blanc': 8000000, 'Solar Ruby': 8000000,
    'Summer Yellow Body - Jet Black Roof': 8000000,
  },
  'VinFast VF 6': { 'Urban Mint': 12000000 },
  'VinFast VF 7': { 'Urban Mint': 12000000 },
  'VinFast VF 8': {
    'Zenith Grey - Desat Silver Roof': 12000000,
    'Infinity Blanc - Zenith Grey Roof': 12000000,
    'Crimson Velvet - Mystery Bronze Roof': 12000000,
    'Jet Black - Mystery Bronze Roof': 12000000,
  },
  'VinFast VF 8 The All-New 2026': {
    'Solar Ruby Body - Jet Black Roof': 12000000,
    'Starburst Blue': 12000000,
    'Starburst Blue Body - Infinity Blanc Roof': 12000000,
    'Vitality Orange': 12000000,
    'Vitality Orange Body - Infinity Blanc Roof': 12000000,
    'Infinity Blanc': 12000000,
    'Jet Black': 12000000,
    'Vitality Orange Body - Jet Black Roof': 12000000,
  },
  'VinFast VF 9': { 'Ivy Green': 12000000, 'Desat Silver': 12000000 },
  'VinFast VF MPV 7': { 'Solar Ruby': 10000000, 'Zenith Grey': 10000000 },
}

const { data, error } = await supabase
  .from('vehicle_variants')
  .select('id,product_name,color,color_type,color_price_adjustment,is_active')
  .eq('product_type', 'CAR')
if (error) throw error

const updates = (data ?? []).map((row) => {
  const model = Object.keys(advancedByModel).find((name) => row.product_name === name)
  const adjustment = model ? advancedByModel[model][row.color] : undefined
  const next = adjustment === undefined
    ? { color_type: 'STANDARD', color_price_adjustment: 0 }
    : { color_type: 'ADVANCED', color_price_adjustment: adjustment }
  if (row.color_type === next.color_type && Number(row.color_price_adjustment || 0) === next.color_price_adjustment) return null
  return { ...row, ...next }
}).filter(Boolean)

console.log(`${apply ? 'Applying' : 'Preview'} ${updates.length} vehicle colour updates`)
for (const row of updates) console.log(`${row.product_name} | ${row.color} | ${row.color_type} | ${row.color_price_adjustment}`)

if (apply) {
  for (const row of updates) {
    const result = await supabase.from('vehicle_variants').update({
      color_type: row.color_type,
      color_price_adjustment: row.color_price_adjustment,
    }).eq('id', row.id)
    if (result.error) throw result.error
  }
  console.log('Done')
}
