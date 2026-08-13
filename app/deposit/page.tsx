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
import { getCurrentUser } from '../../lib/auth/current-user'
import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import Link from 'next/link'
import { CarFront } from 'lucide-react'
import { DepositLoginRequired } from '../../components/deposit-login-required'

export const dynamic = 'force-dynamic'

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const currentUser = await getCurrentUser().catch(() => null)
  if (!currentUser) {
    return <DepositLoginRequired />
  }
  if (currentUser?.role === 'ADMIN') {
    return (
      <main className="flex min-h-screen flex-col bg-slate-50 pt-[74px]">
        <Header />
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-20 text-center">
          <CarFront className="h-14 w-14 text-red-300" />
          <h1 className="mt-5 text-2xl font-bold text-slate-900">Không thể đặt cọc xe</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Tài khoản quản trị không được tạo hoặc thanh toán đơn đặt cọc xe.</p>
          <Link href="/admin" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Quay về trang quản trị</Link>
        </section>
        <Footer />
      </main>
    )
  }
  const params = await searchParams
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')

  const motorbikeCatalog = await listMotorbikeCatalog()

  const supabase = getSupabaseAdmin()
  let dbProducts: any[] = []
  try {
    const { data } = await supabase
      .from('products')
      .select('id, name, is_active, specifications, advanced_color_price, vehicle_variants(color, image_car_url, image_color_url, version, is_active)')
      .eq('product_type', 'CAR')
    if (data) dbProducts = data
  } catch (e) {
    console.error('Error fetching products with variants', e)
  }

  const matchedProductIds = new Set<string>()

  const rawCarsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const carsData = rawCarsData.map((c: any) => {
    let dbP = dbProducts.find(p => p.name === c.name || p.name === c.name.replace('VinFast ', ''))
    if (!dbP) {
      dbP = dbProducts.find(p => {
        if (c.name.includes('The All-New') && !p.name.includes('The All-New')) return false
        return c.name.includes(p.name) || p.name.includes(c.name)
      })
    }
    if (dbP) {
      c.product_id = dbP.id
      c.specifications = dbP.specifications
      if (dbP.is_active === false) {
        c.is_active = false
      }
      matchedProductIds.add(dbP.id)
      if (dbP.advanced_color_price !== null) {
        c.advanced_color_price = dbP.advanced_color_price
      }
      if (dbP.specifications && typeof dbP.specifications === 'object') {
        const specsObj = dbP.specifications as any
        if (specsObj.interiors) {
          c.interiors = specsObj.interiors
        }
        if (specsObj.gallery?.interior_images) {
          c.gallery = {
            ...c.gallery,
            interior_images: specsObj.gallery.interior_images
          }
        }
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
            const fallbackColor = dbP.specifications?.fallback_colors?.find((c: any) => c.name === colorObj.name)
            if (fallbackColor && fallbackColor.is_advanced) {
              colorObj.is_advanced = true
            }
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

  // Map dynamic cars from database that are not in the static cars.json and are active
  const unmatchedProducts = dbProducts.filter(p => !matchedProductIds.has(p.id) && p.is_active !== false)
  const dynamicCars = unmatchedProducts.map((p: any) => {
    const specsObj = p.specifications || {}
    
    let colors = []
    if (p.vehicle_variants && p.vehicle_variants.length > 0) {
      colors = p.vehicle_variants
        .filter((v: any) => v.is_active !== false && v.color && v.image_car_url)
        .map((v: any) => {
          const fallbackColor = specsObj.fallback_colors?.find((c: any) => c.name === v.color)
          return {
            name: v.color,
            image: v.image_car_url,
            swatch: v.image_color_url,
            is_advanced: fallbackColor?.is_advanced || false
          }
        })
    } else if (specsObj.fallback_colors) {
      colors = specsObj.fallback_colors
    }

    const interiors = specsObj.interiors || []
    const variantsNames = Object.keys(specsObj.specs || {})
    const firstVarName = variantsNames[0]
    const firstVar = firstVarName ? specsObj.specs[firstVarName] : null
    const priceStr = firstVar ? `Chỉ từ ${new Intl.NumberFormat('vi-VN').format(firstVar.price)} VNĐ*` : 'Liên hệ'
    const depositStr = firstVar ? `${new Intl.NumberFormat('vi-VN').format(firstVar.deposit_amount)} VNĐ` : '15.000.000 VNĐ'

    const variantsList = variantsNames.map(name => {
      const v = specsObj.specs[name]
      return `${p.name} ${name}: ${new Intl.NumberFormat('vi-VN').format(v.price)} VNĐ*`
    })

    return {
      product_id: p.id,
      name: p.name,
      url: `/cars/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      price: priceStr,
      deposit: depositStr,
      colors,
      variants: variantsList,
      interiors,
      gallery: {
        interior_images: specsObj.gallery?.interior_images || [],
        exterior_images: specsObj.gallery?.exterior_images || [],
        detail_images: specsObj.gallery?.detail_images || []
      },
      specifications: specsObj,
      advanced_color_price: p.advanced_color_price
    }
  })

  // Filter out any static cars that have been deactivated in the database
  const activeStaticCars = carsData.filter((c: any) => c.is_active !== false)
  const combinedCarsData = [...activeStaticCars, ...dynamicCars]

  const motorbikesData = motorbikeCatalog.map((motorbike) => ({
    product_id: motorbike.productId,
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

  // Inject specs for database-driven dynamic cars
  unmatchedProducts.forEach((p: any) => {
    const specsObj = p.specifications || {}
    specsData[p.name] = {
      name: p.name,
      model_key: `Products-Car-${p.name.replace(/[^a-zA-Z0-9]+/g, '')}`,
      variants: specsObj.specs || {}
    }
    const shortName = p.name.replace('VinFast ', '')
    if (shortName !== p.name) {
      specsData[shortName] = specsData[p.name]
    }
  })

  const initialCar = Array.isArray(params.model) ? params.model[0] : params.model
  const requestedType = Array.isArray(params.type) ? params.type[0] : params.type
  const initialVehicleType: DepositVehicleType =
    requestedType === 'motorbike' ||
    (!findDepositVehicle(combinedCarsData, initialCar) &&
      Boolean(findDepositVehicle(motorbikesData, initialCar)))
      ? 'motorbike'
      : 'car'

  return (
    <DepositClient
      carsData={combinedCarsData}
      motorbikesData={motorbikesData}
      specsData={specsData}
      initialCar={initialCar}
      initialVehicleType={initialVehicleType}
    />
  )
}
