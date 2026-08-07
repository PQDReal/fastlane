import { getCostEstimatorData } from '@/lib/services/cost-estimator-service'
import { CostEstimator } from './cost-estimator'
// Cost estimation reads the live Supabase catalog at request time.
export const dynamic = 'force-dynamic'
export default async function CostEstimatorPage({searchParams}:{searchParams:Promise<{vehicle?:string}>}){const {vehicle}=await searchParams;try{const data=await getCostEstimatorData();return <CostEstimator {...data} initialVehicleSlug={vehicle}/>}catch{return <CostEstimator vehicles={[]} policies={[]} loadError initialVehicleSlug={vehicle}/>}}
