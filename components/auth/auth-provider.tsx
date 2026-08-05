'use client'

import { Auth0Provider } from '@auth0/nextjs-auth0/client'
import { SWRConfig } from 'swr'

export function FastLaneAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        shouldRetryOnError: false,
        revalidateOnFocus: false,
      }}
    >
      <Auth0Provider>{children}</Auth0Provider>
    </SWRConfig>
  )
}
