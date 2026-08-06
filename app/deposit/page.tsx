import fs from 'fs'
import path from 'path'
import { DepositClient } from './DepositClient'
import {
  buildMotorbikeDepositSpecs,
  findDepositVehicle,
  type DepositVehicleType,
} from '../../lib/deposit-vehicles'
import { getSupabaseAdmin } from '../../lib/supabase-admin'
import { listMotorbikeCatalog } from '../../lib/motorbike-catalog'

export const dynamic = 'force-dynamic'

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')

  const motorbikeCatalog = await listMotorbikeCatalog()

  const supabase = getSupabaseAdmin()
  let dbProducts: any[] = []
  try {
    const { data } = await supabase.from('products').select('id, name, advanced_color_price, vehicle_variants(color, image_car_url, image_color_url, is_active)').eq('product_type', 'CAR')
    if (data) dbProducts = data
  } catch (e) {
    console.error('Error fetching products with variants', e)
  }

  const rawCarsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const carsData = rawCarsData.map((c: any) => {
    const dbP = dbProducts.find(p => p.name === c.name || c.name.includes(p.name) || p.name.includes(c.name))
    if (dbP) {
      if (dbP.advanced_color_price !== null) {
        c.advanced_color_price = dbP.advanced_color_price
      }
      if (dbP.vehicle_variants && dbP.vehicle_variants.length > 0) {
        const dbColors = dbP.vehicle_variants
          .filter((v: any) => v.is_active !== false && v.color && v.image_car_url)
          .map((v: any) => ({
            name: v.color,
            image: v.image_car_url,
            swatch: v.image_color_url
          }))
        
        const uniqueColorsMap = new Map()
        dbColors.forEach((colorObj: any) => {
          if (!uniqueColorsMap.has(colorObj.name)) {
            uniqueColorsMap.set(colorObj.name, colorObj)
          }
        })
        
        if (uniqueColorsMap.size > 0) {
          c.colors = Array.from(uniqueColorsMap.values())
        }
      }
    }
    return c
  })
  const motorbikesData = motorbikeCatalog.map((motorbike) => ({
    name: motorbike.name,
    slug: motorbike.slug,
    product_type: 'motorbike' as const,
    displayed_price: motorbike.displayedPrice,
    deposit_value: motorbike.versions[0]?.depositAmount ?? 2_000_000,
    image_url: motorbike.heroImageUrl,
    colors: motorbike.colors.map((color) => ({
      name: color.name,
      image: color.imageUrl,
      swatch: color.swatchUrl,
    })),
    variants: motorbike.versions.map((version) => version.name),
    variant_prices: Object.fromEntries(
      motorbike.versions.map((version) => [version.name, version.price]),
    ),
    specs: motorbike.specifications,
    optional_packages: [],
    gallery: {
      exterior_images: motorbike.colors.map((color) => color.imageUrl),
      interior_images: [],
      detail_images: motorbike.detailImageUrls,
    },
  }))
  const specsData = {
    ...JSON.parse(fs.readFileSync(specsDataPath, 'utf8')),
    ...buildMotorbikeDepositSpecs(motorbikesData),
  }
  if (specsData['VF 8'] && !specsData['VinFast VF 8 The All-New 2026']) {
    specsData['VinFast VF 8 The All-New 2026'] = specsData['VF 8']
  }

  const initialCar = Array.isArray(params.model) ? params.model[0] : params.model
  const requestedType = Array.isArray(params.type) ? params.type[0] : params.type
  const initialVehicleType: DepositVehicleType =
    requestedType === 'motorbike' ||
    (!findDepositVehicle(carsData, initialCar) &&
      Boolean(findDepositVehicle(motorbikesData, initialCar)))
      ? 'motorbike'
      : 'car'

  return (
    <DepositClient
      carsData={carsData}
      motorbikesData={motorbikesData}
      specsData={specsData}
      initialCar={initialCar}
      initialVehicleType={initialVehicleType}
    />
  )
}
