import * as Sentry from '@sentry/nextjs'

import { isSentryEnabled, scrubSentryEvent, sentrySampleRate } from '@/lib/sentry-config'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: isSentryEnabled(dsn, process.env.NODE_ENV),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release:
    process.env.SENTRY_RELEASE
    || process.env.RAILWAY_GIT_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT,
  sendDefaultPii: false,
  tracesSampleRate: sentrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  ),
  beforeSend: scrubSentryEvent,
})
