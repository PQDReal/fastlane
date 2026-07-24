import { getCurrentUser } from '@/lib/auth/current-user'
import { listTestDriveVehicles } from '@/lib/services/test-drive-service'
import { TestDriveForm } from './test-drive-form'

export const dynamic = 'force-dynamic'

export default async function TestDrivePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>
}) {
  const { productId } = await searchParams
  const [vehicleResult, userResult] = await Promise.allSettled([
    listTestDriveVehicles(),
    getCurrentUser(),
  ])

  if (vehicleResult.status === 'rejected') {
    console.error('Failed to load test-drive vehicles:', vehicleResult.reason)
  }

  if (userResult.status === 'rejected') {
    console.error('Failed to load test-drive user:', userResult.reason)
  }

  const user = userResult.status === 'fulfilled' ? userResult.value : null

  return (
    <TestDriveForm
      vehicles={vehicleResult.status === 'fulfilled' ? vehicleResult.value : []}
      loadError={vehicleResult.status === 'rejected'}
      initialVehicleId={productId}
      initialUser={
        user
          ? {
              fullName: user.full_name,
              phoneNumber: user.phone_number ?? '',
              email: user.email,
            }
          : null
      }
    />
  )
}