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
  const motorbikeCatalog = await listMotorbikeCatalog()

  const supabase = getSupabaseAdmin()
  let dbProducts: any[] = []
  try {
    const { data } = await supabase
      .from('products')
      .select('id, name, is_active, specifications, advanced_color_price, vehicle_variants(color, image_car_url, image_color_url, is_active, color_type, color_price_adjustment, interior_color)')
      .eq('product_type', 'CAR')
    if (data) dbProducts = data
  } catch (e) {
    console.error('Error fetching products with variants', e)
  }

  // Vehicle selection data comes exclusively from the canonical Supabase rows.
  const carsData = dbProducts.filter((p: any) => p.is_active !== false).map((p: any) => {
    const specsObj = p.specifications || {}
    const colors = Array.from(new Map((p.vehicle_variants || [])
      .filter((v: any) => v.is_active !== false && v.color && v.image_car_url)
      .map((v: any) => [v.color, {
        name: v.color, image: v.image_car_url, swatch: v.image_color_url,
        type: v.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        priceAdjustment: Number(v.color_price_adjustment || 0),
        interiorColor: v.interior_color || undefined,
      }])).values()).sort((a: any, b: any) => {
        const tier = Number(a.type === 'ADVANCED') - Number(b.type === 'ADVANCED')
        return tier || a.name.localeCompare(b.name, 'vi')
      })

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
      name: p.name.replace(/^VinFast\s+/i, ''),
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
  const combinedCarsData = carsData

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
  const specsData: Record<string, any> = buildMotorbikeDepositSpecs(motorbikesData)
  // Inject specs for database-driven dynamic cars
  dbProducts.filter((p: any) => p.is_active !== false).forEach((p: any) => {
    const specsObj = p.specifications || {}
    const depositSpecs = {
      name: p.name,
      model_key: `Products-Car-${p.name.replace(/[^a-zA-Z0-9]+/g, '')}`,
      variants: specsObj.specs || {}
    }
    specsData[p.name] = depositSpecs
    const shortName = p.name.replace('VinFast ', '')
    specsData[shortName] = depositSpecs
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
