import fs from 'fs'
import path from 'path'
import { DepositClient } from './DepositClient'

export const dynamic = 'force-dynamic'

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')
  
  const carsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const specsData = JSON.parse(fs.readFileSync(specsDataPath, 'utf8'))

  const initialCar = Array.isArray(params.model) ? params.model[0] : params.model

  return <DepositClient carsData={carsData} specsData={specsData} initialCar={initialCar} />
}
