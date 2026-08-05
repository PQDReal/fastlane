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

export const dynamic = 'force-dynamic'

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const currentUser = await getCurrentUser().catch(() => null)
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
    const { data } = await supabase.from('products').select('name, advanced_color_price').eq('product_type', 'CAR')
    if (data) dbProducts = data
  } catch (e) {
    console.error('Error fetching advanced_color_price', e)
  }

  const rawCarsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const carsData = rawCarsData.map((c: any) => {
    const dbP = dbProducts.find(p => p.name === c.name || c.name.includes(p.name) || p.name.includes(c.name))
    if (dbP && dbP.advanced_color_price !== null) {
      c.advanced_color_price = dbP.advanced_color_price
    }
    return c
  })
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
