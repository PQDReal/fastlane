import { listComparableVehicles } from '@/lib/services/compare-service'
import { CompareVehicles } from './compare-vehicles'

// Avoid querying Supabase while the deployment build is prerendering pages.
export const dynamic = 'force-dynamic'

export default async function ComparePage() {
  try {
    return <CompareVehicles vehicles={await listComparableVehicles()} />
  } catch (error) {
    console.error('Unable to load comparison vehicles:', error)
    return <CompareVehicles vehicles={[]} loadError />
  }
}
