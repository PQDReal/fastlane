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
      className="fixed bottom-6 right-6 z-[100] flex items-center gap-4 rounded-full border border-slate-900/10 bg-white/95 px-6 py-4 shadow-[0_16px_48px_rgba(15,23,42,0.2)] backdrop-blur-md"
    >
      <svg
        viewBox="0 0 48 48"
        className="h-11 w-11 shrink-0 overflow-visible"
        aria-hidden="true"
      >
        <path
          d="M7.5 8.5h7.4L24 29.4l9.1-20.9h7.4L27.1 39.5h-6.2L7.5 8.5Z"
          fill="#0f172a"
        />
        <path
          d="M7.5 8.5h7.4L24 29.4l9.1-20.9h7.4L27.1 39.5h-6.2L7.5 8.5Z"
          pathLength="100"
          fill="none"
          stroke="#9b7200"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
          className="navigation-logo-trace"
        />
        <path
          d="M13 10.5 24 35.5 35 10.5"
          pathLength="100"
          fill="none"
          stroke="#d8a313"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
          className="navigation-logo-trace navigation-logo-trace-secondary"
        />
      </svg>
      <span className="pr-1 text-[13px] font-bold uppercase tracking-[0.2em] text-slate-900">
        Đang tải
      </span>
      <span className="sr-only">
        Vui lòng chờ trong khi trang mới được tải.
      </span>
    </div>
  )
}
