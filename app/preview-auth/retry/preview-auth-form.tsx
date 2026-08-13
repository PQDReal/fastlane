'use client'

import { useCallback } from 'react'

import { PreviewAuthDialog } from '@/components/auth/preview-auth-dialog'

export function PreviewAuthForm({ returnTo }: { returnTo: string }) {
  const completeAuthentication = useCallback(() => {
    window.setTimeout(() => window.location.replace(returnTo), 350)
  }, [returnTo])

  return (
    <main className="min-h-screen bg-slate-950">
      <PreviewAuthDialog open onAuthenticated={completeAuthentication} />
    </main>
  )
}
