'use client'

import { Auth0Provider } from '@auth0/nextjs-auth0/client'
import { SWRConfig } from 'swr'

import { PreviewAuthExpiryGuard } from './preview-auth-expiry-guard'

export function FastLaneAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        shouldRetryOnError: false,
        revalidateOnFocus: false,
      }}
    >
      <Auth0Provider>
        <PreviewAuthExpiryGuard />
        {children}
      </Auth0Provider>
    </SWRConfig>
  )
}
