import { getCostEstimatorData } from '@/lib/services/cost-estimator-service'
import { CostEstimator } from './cost-estimator'
export const revalidate = 300
// Cached vehicle and policy read models; `vehicle` only selects the initial
// value in the client UI.
// Keep runtime rendering because the initial read may require Supabase access.
export const dynamic = 'force-dynamic'
export default async function CostEstimatorPage({searchParams}:{searchParams:Promise<{vehicle?:string}>}){const {vehicle}=await searchParams;try{const data=await getCostEstimatorData();return <CostEstimator {...data} initialVehicleSlug={vehicle}/>}catch{return <CostEstimator vehicles={[]} policies={[]} loadError initialVehicleSlug={vehicle}/>}}
