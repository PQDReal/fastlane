import { getCostEstimatorData } from '@/lib/services/cost-estimator-service'
import { CostEstimator } from './cost-estimator'
export const dynamic='force-dynamic'
export default async function CostEstimatorPage(){try{const data=await getCostEstimatorData();return <CostEstimator {...data}/>}catch{return <CostEstimator vehicles={[]} policies={[]} loadError/>}}