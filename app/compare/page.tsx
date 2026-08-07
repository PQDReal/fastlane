import { listComparableVehicles } from '@/lib/services/compare-service'
import { CompareVehicles } from './compare-vehicles'

export const revalidate = 300
// The comparison service supplies a cached public read model.
// It still depends on the live catalog during the first read, which may not be
// reachable from the deployment build worker.
export const dynamic = 'force-dynamic'

export default async function ComparePage() {
  try {
    return <CompareVehicles vehicles={await listComparableVehicles()} />
  } catch (error) {
    console.error('Unable to load comparison vehicles:', error)
    return <CompareVehicles vehicles={[]} loadError />
  }
}
