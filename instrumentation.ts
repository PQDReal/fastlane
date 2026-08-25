import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Pre-warm sales-agent catalog cache engines in background
    void import('@/lib/sales-agent/cache/catalog-cache').then(({ catalogCacheEngine }) => {
      void catalogCacheEngine.getSnapshotAsync()
    }).catch((err) => {
      console.warn('[INSTRUMENTATION] Failed to pre-warm product catalog cache:', err)
    })

    void import('@/lib/sales-agent/knowledge/scope-catalog').then(({ knowledgeScopeCatalogEngine }) => {
      void knowledgeScopeCatalogEngine.getSnapshotAsync()
    }).catch((err) => {
      console.warn('[INSTRUMENTATION] Failed to pre-warm knowledge scope catalog:', err)
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError