import { listCostPolicies } from '@/lib/services/admin-cost-policy-service'
import { CostPoliciesManager } from './cost-policies-manager'
export const dynamic='force-dynamic'
export default async function AdminCostPoliciesPage(){const data=await listCostPolicies();return <CostPoliciesManager initialFees={data.fees} loadError={data.error}/>}