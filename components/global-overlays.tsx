'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

import { useAppStore } from '@/lib/store'

const LazySearchModal = dynamic(
  () => import('@/components/search-modal').then((module) => module.SearchModal),
  { ssr: false },
)

const LazyCartFlyAnimation = dynamic(
  () => import('@/components/cart-fly-animation').then((module) => module.CartFlyAnimation),
  { ssr: false },
)

export function GlobalOverlays() {
  const pathname = usePathname()
  const searchModalOpen = useAppStore((state) => state.searchModalOpen)

  return (
    <>
      {searchModalOpen && <LazySearchModal />}
      {pathname.startsWith('/accessories') && <LazyCartFlyAnimation />}
    </>
  )
}
