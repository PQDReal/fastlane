'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'

import { DepositLoginRequired } from '@/components/deposit-login-required'

export function DepositAuthGuard() {
  const { user, isLoading } = useUser()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/deposit') setOpen(false)
  }, [pathname])

  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('fastlane:close-deposit-login', close)
    return () => window.removeEventListener('fastlane:close-deposit-login', close)
  }, [])

  useEffect(() => {
    if (isLoading || user) return
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const url = new URL(anchor.href, window.location.origin)
      if (url.origin !== window.location.origin || url.pathname !== '/deposit') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [isLoading, user])

  return (
    <AnimatePresence>
      {open ? <DepositLoginRequired key="deposit-login-required" /> : null}
    </AnimatePresence>
  )
}
