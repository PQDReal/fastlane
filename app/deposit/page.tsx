import fs from 'fs'
import path from 'path'
import { DepositClient } from './DepositClient'

export const dynamic = 'force-dynamic'

export default function DepositPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')
  
  const carsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const specsData = JSON.parse(fs.readFileSync(specsDataPath, 'utf8'))

  return <DepositClient carsData={carsData} specsData={specsData} initialCar={searchParams.model as string} />
}
