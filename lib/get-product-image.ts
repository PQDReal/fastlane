const OVERRIDE_IMAGES: Record<string, string> = {
  // The public vinfastauto.com PDP asset blocks server-side image proxying (403).
  // Use the equivalent official Shop CDN asset, which permits Next/Image requests.
  'VF 2': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw05aa09f9/images/VF2/TH14V/CE18.webp',
  'VF 3': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784768418972/ldp-all-cars/360/VF3/exterior/CE18/F1.png',
  'VF 5': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw32aad97c/reserves/VF5/2025/12.webp',
  'VF 6': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw445cc03b/images/VF6/JB10V/CE18.webp',
  'VF 7': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0c109403/reserves/VF7/exterior/product-CE18.webp',
  'VF 7 MPV': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VFMPV7/SL1WV/CE18.webp',
  'VF MPV 7': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VFMPV7/SL1WV/CE18.webp',
  'VF 8': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3aa598fc/images/VF8/ND32V/CE18.webp',
  'VF 8 The all new': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw61dd02a5/images/VF8-THE-ALL-NEW/HC11V/CE18.webp',
  'VF 9': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwec05bc92/images/VF9/NE3LV/CE18.webp'
}

export function getProductImage(productName: string, dbImageUrls: string[] | null = null, fallback: string = '/images/vf8.png'): string {
  // Some legacy VinFast PDP URLs return 403 through the image optimizer.
  // Resolve the product override before considering those persisted URLs.
  const normalizedProductName = productName.toLowerCase().replace(/-/g, ' ')
  const sortedKeys = Object.keys(OVERRIDE_IMAGES).sort((a, b) => b.length - a.length)
  const overrideKey = sortedKeys.find(k => normalizedProductName.includes(k.toLowerCase().replace(/-/g, ' ')))
  if (overrideKey) return OVERRIDE_IMAGES[overrideKey]

  // 1. Use DB image if valid and available
  if (dbImageUrls && dbImageUrls.length > 0) {
    // Ưu tiên tìm ảnh xe (thường có từ khoá 'car-compare', 'exterior', hoặc '.png', '.webp') 
    // và loại trừ logo, banner, video, nội thất, v.v.
    const carImage = dbImageUrls.find((url: string) => {
      const lowerUrl = url.toLowerCase();
      const isImage = lowerUrl.match(/\.(jpeg|jpg|png|webp)$/i);
      const isNotMisc = !lowerUrl.includes('logo') && 
                        !lowerUrl.includes('banner') && 
                        !lowerUrl.includes('interior') && 
                        !lowerUrl.includes('section') && 
                        !lowerUrl.includes('map');
      
      // Ưu tiên ảnh xe trong suốt hoặc ảnh so sánh
      return isImage && isNotMisc && (lowerUrl.includes('car-compare') || lowerUrl.includes('.png') || lowerUrl.includes('.webp'));
    }) || dbImageUrls.find((url: string) => {
      const lowerUrl = url.toLowerCase();
      const isImage = lowerUrl.match(/\.(jpeg|jpg|png|webp)$/i);
      const isNotMisc = !lowerUrl.includes('logo') && 
                        !lowerUrl.includes('banner') && 
                        !lowerUrl.includes('interior') && 
                        !lowerUrl.includes('section') && 
                        !lowerUrl.includes('map');
      return isImage && isNotMisc;
    });

    if (carImage && (carImage.startsWith('http') || carImage.startsWith('/'))) {
      return carImage;
    }
  }

  // Product imagery is authored in Supabase. Do not read legacy JSON files on
  // a request-path fallback; a missing image should be explicit and cheap.
  return fallback
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

export function getCarSpecsSummary(specifications: unknown): string | null {
  const root = record(specifications)
  const firstVariant = record(Object.values(record(root.specs))[0])
  const variantSpecs = record(firstVariant.specs)
  const seats = root.seat_count
    ?? root.seats
    ?? variantSpecs.seats
    ?? record(variantSpecs.interior).numberOfSeats
  const distance = root.range_text
    ?? root.range_km
    ?? record(variantSpecs.powertrain).distance
    ?? variantSpecs.range
  
  // Extract number from distance (e.g. "626 (WLTP)" -> "626")
  let cleanDistance = distance
  if (typeof distance === 'string') {
    const match = distance.match(/\d+/)
    if (match) cleanDistance = match[0]
  }

  if (seats && cleanDistance) {
    return `${seats} chỗ | ~${cleanDistance} km/lần sạc`
  }
  return null
}
