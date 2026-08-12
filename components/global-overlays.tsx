'use client'

import dynamic from 'next/dynamic'
import { useAppStore } from '@/lib/store'
import { SalesAgentShell } from '@/components/sales-agent/sales-agent-shell'

const LazySearchModal = dynamic(
  () => import('@/components/search-modal').then((module) => module.SearchModal),
  { ssr: false },
)

const LazyCartFlyAnimation = dynamic(
  () => import('@/components/cart-fly-animation').then((module) => module.CartFlyAnimation),
  { ssr: false },
)

export function GlobalOverlays() {
  const searchModalOpen = useAppStore((state) => state.searchModalOpen)

  return (
    <>
      {searchModalOpen && <LazySearchModal />}
      {/* Keep the animation mounted across route changes. An add-to-cart
          request may finish after the user has already opened /cart. */}
      <LazyCartFlyAnimation />
      <SalesAgentShell />
    </>
  )
}
