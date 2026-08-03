import * as Sentry from '@sentry/nextjs'

import { scrubSentryEvent, sentrySampleRate } from '@/lib/sentry-config'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: sentrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  ),
  beforeSend: scrubSentryEvent,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart