export type VnPayReconciliationJob = {
  attemptId: string
  orderKind: 'accessory' | 'deposit'
}

const DELAY = '15m'

export async function scheduleVnPayReconciliation(job: VnPayReconciliationJob) {
  const token = process.env.QSTASH_TOKEN?.trim()
  const callbackSecret = process.env.QSTASH_CALLBACK_SECRET?.trim()
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/$/, '')

  if (!token || !callbackSecret || !baseUrl) {
    console.warn('VNPAY delayed reconciliation is not configured', {
      attemptId: job.attemptId,
      hasQStashToken: Boolean(token),
      hasCallbackSecret: Boolean(callbackSecret),
      hasAppBaseUrl: Boolean(baseUrl),
    })
    return null
  }

  const destination = `${baseUrl}/api/v1/payments/vnpay/reconcile-attempt`
  const publishUrl = `https://qstash.upstash.io/v2/publish/${encodeURIComponent(destination)}`
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': DELAY,
      'Upstash-Forward-Authorization': `Bearer ${callbackSecret}`,
      'Upstash-Retries': '3',
      'Upstash-Retry-Delay': '300000',
      'Upstash-Deduplication-Id': `vnpay-reconcile-${job.attemptId}`,
      'Upstash-Label': 'vnpay-reconciliation',
    },
    body: JSON.stringify(job),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Không thể lên lịch đối soát VNPay: QStash HTTP ${response.status}`)
  }

  const result = await response.json() as { messageId?: string; deduplicated?: boolean }
  console.info('VNPAY reconciliation scheduled', {
    attemptId: job.attemptId,
    orderKind: job.orderKind,
    delay: DELAY,
    messageId: result.messageId || null,
    deduplicated: result.deduplicated === true,
  })
  return result
}
