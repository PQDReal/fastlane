import fs from 'fs'
import path from 'path'
import { DepositClient } from './DepositClient'
import {
  buildMotorbikeDepositSpecs,
  findDepositVehicle,
  mergeMotorbikeDatabaseRows,
  normalizeMotorbikesForDeposit,
  type DepositVehicleType,
} from '../../lib/deposit-vehicles'
import { getSupabaseAdmin } from '../../lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const motorbikesDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'motorbikes.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')

  const carsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const publishedMotorbikes = JSON.parse(fs.readFileSync(motorbikesDataPath, 'utf8'))
  const motorbikeResult = await getSupabaseAdmin()
    .from('products')
    .select(`
      name,
      slug,
      displayed_price,
      image_urls,
      specifications,
      category:categories!inner(name),
      product_variants(name,original_price,sale_price,deposit_amount,is_active)
    `)
    .eq('is_active', true)
    .eq('categories.name', 'Xe máy điện')
    .order('name', { ascending: true })
  if (motorbikeResult.error) {
    console.error('Unable to load motorbike deposit data from Supabase:', motorbikeResult.error)
  }
  const motorbikesData = normalizeMotorbikesForDeposit(
    mergeMotorbikeDatabaseRows(
      publishedMotorbikes,
      motorbikeResult.data ?? [],
    ),
  )
  const specsData = {
    ...JSON.parse(fs.readFileSync(specsDataPath, 'utf8')),
    ...buildMotorbikeDepositSpecs(motorbikesData),
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
