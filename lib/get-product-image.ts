import fs from 'fs'
import path from 'path'

let cachedData: any[] | null = null

const OVERRIDE_IMAGES: Record<string, string> = {
  'VF 2': 'https://vinfastauto.com/themes/porto/img/pdp-page/vf2/vf2-car/vf2-infinity-blanc-car.webp',
  'VF 3': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784768418972/ldp-all-cars/360/VF3/exterior/CE18/F1.png',
  'VF 5': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw32aad97c/reserves/VF5/2025/12.webp',
  'VF 6': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw445cc03b/images/VF6/JB10V/CE18.webp',
  'VF 7': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0c109403/reserves/VF7/exterior/product-CE18.webp',
  'VF 7 MPV': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw5e18d16a/images/VF7/GC15V/CE18.webp',
  'VF 8': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3aa598fc/images/VF8/ND32V/CE18.webp',
  'VF 8 The all new': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw61dd02a5/images/VF8-THE-ALL-NEW/HC11V/CE18.webp',
  'VF 9': 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwec05bc92/images/VF9/NE3LV/CE18.webp'
}

export function getProductImage(productName: string, dbImageUrls: string[] | null = null, fallback: string = '/images/vf8.png'): string {
  const sortedKeys = Object.keys(OVERRIDE_IMAGES).sort((a, b) => b.length - a.length)
  const normalizedProductName = productName.toLowerCase().replace(/-/g, ' ')
  const overrideKey = sortedKeys.find(k => normalizedProductName.includes(k.toLowerCase().replace(/-/g, ' ')))
  if (overrideKey) {
    return OVERRIDE_IMAGES[overrideKey]
  }

  // 1. Check local prioritized white images
  const formattedName = productName.replace(/\s/g, '').toLowerCase() // "VF 9" -> "vf9"
  const localImgPath = path.join(process.cwd(), 'public', 'images', `${formattedName}.png`)
  if (fs.existsSync(localImgPath)) {
    return `/images/${formattedName}.png`
  }

  // 2. Use DB image if valid
  if (dbImageUrls && dbImageUrls.length > 0 && dbImageUrls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
    return dbImageUrls[0]
  }


  if (!cachedData) {
    try {
      const dataDir = path.join(process.cwd(), 'public', 'data', 'by_type')
      const cars = JSON.parse(fs.readFileSync(path.join(dataDir, 'cars.json'), 'utf8'))
      const bikes = JSON.parse(fs.readFileSync(path.join(dataDir, 'motorbikes.json'), 'utf8'))
      const accessories = JSON.parse(fs.readFileSync(path.join(dataDir, 'accessories.json'), 'utf8'))
      cachedData = [...cars, ...bikes, ...accessories]
    } catch (e) {
      console.error('Failed to load JSON data for product images:', e)
      return fallback
    }
  }

  const richData = cachedData.find((item: any) => {
    if (!item.name) return false;
    return productName.includes(item.name) || item.name.includes(productName)
  })

  if (!richData) return fallback

  const imgs = richData.gallery?.exterior_images || richData.images || []

  const validImgs = imgs.filter((img: string) =>
    !img.toLowerCase().includes('logo') &&
    !img.toLowerCase().endsWith('.mp4') &&
    !img.toLowerCase().endsWith('.svg') &&
    !img.toLowerCase().includes('banner') &&
    !img.toLowerCase().includes('tvc') &&
    !img.toLowerCase().includes('360')
  )

  // Prefer PNGs as they are usually transparent cutouts (good for product cards)
  const pngImage = validImgs.find((img: string) => img.toLowerCase().endsWith('.png') && !img.toLowerCase().includes('interior'))
  return pngImage || validImgs[0] || fallback
}

export function getCarSpecsSummary(productName: string): string | null {
  if (!cachedData) {
    try {
      const dataDir = path.join(process.cwd(), 'public', 'data', 'by_type')
      const cars = JSON.parse(fs.readFileSync(path.join(dataDir, 'cars.json'), 'utf8'))
      const bikes = JSON.parse(fs.readFileSync(path.join(dataDir, 'motorbikes.json'), 'utf8'))
      const accessories = JSON.parse(fs.readFileSync(path.join(dataDir, 'accessories.json'), 'utf8'))
      cachedData = [...cars, ...bikes, ...accessories]
    } catch (e) {
      return null
    }
  }

  const car = cachedData.find((item: any) => item.name && (item.name.includes(productName) || productName.includes(item.name)))
  if (!car || !car.variants) return null

  // Get the first variant's specs
  const firstVariantKey = Object.keys(car.variants)[0]
  if (!firstVariantKey) return null
  
  const specs = car.variants[firstVariantKey]?.specs
  if (!specs) return null

  const seats = specs.seats || specs.interior?.numberOfSeats
  const distance = specs.powertrain?.distance || specs.range
  
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
