'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function startNavigationLoading() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('fastlane:navigation-start'))
}

export function NavigationLoadingIndicator() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const navigationStartedAt = useRef(0)
  const pendingLinks = useRef<Set<HTMLAnchorElement>>(new Set())
  const [isNavigating, setIsNavigating] = useState(false)

  function startNavigation() {
    navigationStartedAt.current = performance.now()
    setIsNavigating(true)
  }

  useEffect(() => {
    if (!navigationStartedAt.current) return

    for (const link of pendingLinks.current) {
      delete link.dataset.fastlanePending
      link.removeAttribute('aria-disabled')
      link.classList.remove('pointer-events-none', 'opacity-60')
    }
    pendingLinks.current.clear()

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

      if (link.dataset.noGlobalLoading === 'true') {
        return
      }

      if (link.dataset.fastlanePending === 'true') {
        event.preventDefault()
        event.stopPropagation()
        return
      }

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

      link.dataset.fastlanePending = 'true'
      link.setAttribute('aria-disabled', 'true')
      link.classList.add('pointer-events-none', 'opacity-60')
      pendingLinks.current.add(link)

      const current = new URL(
        window.location.href,
      )
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return
      }

      // Next.js prevents the browser's native navigation for <Link>, so
      // defaultPrevented does not mean the route change was cancelled.
      // Page-level guards can explicitly defer the indicator until the user
      // confirms the navigation.
      if (
        (
          event as MouseEvent & {
            fastlaneNavigationDeferred?: boolean
          }
        ).fastlaneNavigationDeferred
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

  if (!isNavigating) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="relative overflow-hidden rounded-full p-[1.5px] shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] max-w-none -translate-x-1/2 -translate-y-1/2">
          <div className="h-full w-full animate-[spin_2.5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_80%,#fbbf24_96%,white_100%)]" />
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-label="Đang tải trang"
          className="relative flex items-center gap-3 rounded-full bg-slate-950 px-5 py-2.5"
        >
          <span className="navigation-loading-image relative flex h-11 w-[4.125rem] shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
          <img
            src="/images/fastlane-loading.png"
            alt=""
            className="h-9 w-[3.375rem] translate-x-[9px] object-contain"
          />
          <svg
            viewBox="0 0 72 48"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d="M11 45c5.3-1.1 8.5-4.2 9.8-9.4L27.2 10c.8-3.3 3.1-5 6.8-5h19.4c5.4 0 10.3-1.4 17.6-4"
              pathLength="100"
              fill="none"
              stroke="#9b7200"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.8"
              className="navigation-speed-trace"
            />
            <path
              d="M8 42.2c4.7-1 7.4-3.6 8.6-8.2L22.9 8.4C24.3 2.8 28 .2 34.1.2h18.7c5.7 0 11.2-1.4 18.8-4.1"
              pathLength="100"
              fill="none"
              stroke="#d8a313"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.35"
              className="navigation-speed-trace navigation-speed-trace-secondary"
            />
          </svg>
        </span>
        <span className="pr-1 text-[13px] font-bold uppercase tracking-[0.2em] text-slate-100">
          Đang tải
        </span>
        <span className="sr-only">
          Vui lòng chờ trong khi trang mới được tải.
        </span>
        </div>
      </div>
    </div>
  )
}
