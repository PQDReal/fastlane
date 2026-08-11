import type { Metadata } from 'next'

import { PreviewAuthForm } from './preview-auth-form'

export const metadata: Metadata = { title: 'Xác thực môi trường | FastLane' }

export default async function PreviewAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const params = await searchParams
  const returnTo = params.returnTo?.startsWith('/') && !params.returnTo.startsWith('//')
    ? params.returnTo
    : '/'

  return <PreviewAuthForm returnTo={returnTo} />
}
