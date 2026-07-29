'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationLoadingIndicator() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const navigationStartedAt = useRef(0)
  const [isNavigating, setIsNavigating] = useState(false)

  function startNavigation() {
    navigationStartedAt.current = performance.now()
    setIsNavigating(true)
  }

  useEffect(() => {
    if (!navigationStartedAt.current) return

    const elapsed = performance.now() - navigationStartedAt.current
    const timeout = window.setTimeout(() => {
      navigationStartedAt.current = 0
      setIsNavigating(false)
    }, Math.max(0, 450 - elapsed))

    return () => window.clearTimeout(timeout)
  }, [pathname, search])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return

      const link = target.closest('a')
      if (
        !link ||
        link.target === '_blank' ||
        link.hasAttribute('download')
      ) {
        return
      }

      const href = link.getAttribute('href')
      if (!href || href.startsWith('#')) return

      const destination = new URL(
        link.href,
        window.location.href,
      )
      if (
        destination.origin !==
        window.location.origin
      ) {
        return
      }

      const current = new URL(
        window.location.href,
      )
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return
      }

      startNavigation()
    }

    const handleProgrammaticNavigation = () => startNavigation()

    // Bubble phase is intentional: page-level capture guards (for example the
    // cart leave confirmation) must be able to prevent the click first.
    document.addEventListener(
      'click',
      handleClick,
    )
    window.addEventListener(
      'fastlane:navigation-start',
      handleProgrammaticNavigation,
    )
    return () => {
      document.removeEventListener(
        'click',
        handleClick,
      )
      window.removeEventListener(
        'fastlane:navigation-start',
        handleProgrammaticNavigation,
      )
    }
  }, [])

  useEffect(() => {
    if (!isNavigating) return

    const timeout = window.setTimeout(
      () => setIsNavigating(false),
      10000,
    )
    return () => window.clearTimeout(timeout)
  }, [isNavigating])

  if (!isNavigating) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Đang tải trang"
      className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-full border border-slate-900/10 bg-white/95 px-4 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur-md"
    >
      <span
        className="relative block h-7 w-7"
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-r-[#9b7200] border-t-slate-900 motion-reduce:animate-pulse" />
        <span className="absolute inset-[9px] rounded-full bg-[#9b7200]" />
      </span>
      <span className="pr-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-900">
        Đang tải
      </span>
      <span className="sr-only">
        Vui lòng chờ trong khi trang mới được tải.
      </span>
    </div>
  )
}
