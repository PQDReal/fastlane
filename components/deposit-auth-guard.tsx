'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'

import { DepositLoginRequired } from '@/components/deposit-login-required'

export function DepositAuthGuard() {
  const { user, isLoading } = useUser()
  const [open, setOpen] = useState(false)

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

  return open ? <DepositLoginRequired /> : null
}
