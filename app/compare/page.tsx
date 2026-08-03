import { listComparableVehicles } from '@/lib/services/compare-service'
import { CompareVehicles } from './compare-vehicles'

export const revalidate = 300

export default async function ComparePage() {
  try {
    return <CompareVehicles vehicles={await listComparableVehicles()} />
  } catch (error) {
    console.error('Unable to load comparison vehicles:', error)
    return <CompareVehicles vehicles={[]} loadError />
  }
}
