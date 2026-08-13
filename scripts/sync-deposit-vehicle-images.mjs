import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const apply = process.argv.includes('--apply')
const base = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images'
const swatches = {
  'Granite Black': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp',
  Black: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp',
  'Saddle Brown': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw65203801/images/deposit/interior/CI12.webp',
  'Cotton Beige': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw6b5810a9/images/deposit/interior/CI13.webp',
  'Mocca Brown': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7e53f19e/images/deposit/interior/CI18.webp',
  Grey: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw33eb76b4/images/deposit/interior/CI1M.webp',
}
function interiorImage(row) {
  const p = row.product_name, i = row.interior_color || (p === 'VinFast VF 0' ? 'Granite Black' : null)
  if (p === 'VinFast VF 9') return `${base}/VF9/interior/${i === 'Cotton Beige' ? 'CI13' : i === 'Saddle Brown' ? 'CI12' : 'CI11'}/1.${i === 'Granite Black' ? 'jpg' : 'webp'}`
  if (p === 'VinFast VF 8') return `${base}/VF8/interior/${i === 'Saddle Brown' ? 'CI12' : 'CI11'}/1.png`
  if (p === 'VinFast VF 8 The All-New 2026') return `${base}/VF8-THE-ALL-NEW/interior/${i === 'Saddle Brown' ? 'CI12' : 'CI11'}/1.webp`
  if (p === 'VinFast VF 7') return `${base}/VF7/interior/${i === 'Cotton Beige' ? 'CI13' : i === 'Mocca Brown' ? 'CI18' : 'CI11'}/1.webp`
  if (p === 'VinFast VF 6') return `${base}/VF6/interior/${i === 'Cotton Beige' ? 'CI13' : i === 'Mocca Brown' ? 'CI18' : 'CI11'}/1.${i === 'Mocca Brown' ? 'png' : 'webp'}`
  if (p === 'VinFast VF 5') return `${base}/VF5/GA12V/interior/CI11/1.jpg`
  if (p === 'VinFast VF 3') return `${base}/VF3/TI1CV/interior/CI11/1.jpg`
  if (p === 'VinFast VF 2') return 'https://vinfastauto.com/themes/porto/img/pdp-page/vf2/interior/interior-1.webp'
  if (p === 'VinFast VF MPV 7') return `${base}/VFMPV7/interior/${i === 'Mocca Brown' ? 'CI18' : 'CI11'}/1.webp`
  return row.image_car_url || null
}
const { data, error } = await s.from('vehicle_variants').select('*').eq('product_type', 'CAR').eq('is_active', true)
if (error) throw error
let count = 0
for (const row of data ?? []) {
  const interior = row.interior_color || (row.product_name === 'VinFast VF 0' ? 'Granite Black' : null)
  const image = interiorImage({ ...row, interior_color: interior }), swatch = swatches[interior]
  const specs = row.specs && typeof row.specs === 'object' ? { ...row.specs } : {}
  specs.catalog = { ...(specs.catalog || {}), interior_color: interior, interior_image_url: image, interior_swatch_url: swatch }
  if (apply) {
    const result = await s.from('vehicle_variants').update({ interior_color: interior, specs }).eq('id', row.id)
    if (result.error) throw result.error
  }
  count++
}
console.log(`${apply ? 'Applied' : 'Preview'} ${count} vehicle image records`)
