import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/current-user'
import { listCustomerOrders } from '@/lib/orders/server'
import { ProfileContentClient } from './profile-client'

export const dynamic = 'force-dynamic'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const validTabs = ['info', 'orders', 'car-orders', 'addresses']
  const requestedTab = resolvedSearchParams?.tab
  const initialTab = validTabs.includes(requestedTab || '') ? (requestedTab as any) : 'info'

  let user = null
  try {
    user = await getCurrentUser()
  } catch (error) {
    // If not authenticated, let the client component handle the Auth0 redirect
    // or we can redirect to login if we want server-side enforcement.
    // Auth0 useUser() handles it gracefully, but to fetch data we need it.
  }

  let initialProfile = null
  let initialOrders = null

  if (user) {
    initialProfile = {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      fullName: user.full_name,
      phoneNumber: user.phone_number,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }

    if (initialTab === 'orders' || initialTab === 'car-orders') {
      try {
        const typeQuery = initialTab === 'orders' ? 'accessory' : 'car'
        const ordersData = await listCustomerOrders(user.id, user.email, 1, 5, typeQuery)
        initialOrders = {
          ...ordersData,
          type: typeQuery
        }
      } catch (error) {
        console.error('Error fetching initial orders:', error)
      }
    }
  }

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-[#836100]" />
        </main>
      }
    >
      <ProfileContentClient
        initialProfile={initialProfile}
        initialOrders={initialOrders}
        initialTab={initialTab}
      />
    </Suspense>
  )
}
