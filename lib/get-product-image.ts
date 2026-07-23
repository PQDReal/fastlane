import fs from 'fs'
import path from 'path'

let cachedData: any[] | null = null

export function getProductImage(productName: string, fallback: string = '/images/vf8.png'): string {
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
