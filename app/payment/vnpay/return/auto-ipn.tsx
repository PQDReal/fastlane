'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export function AutoIpnTrigger() {
  const params = useSearchParams()
  
  useEffect(() => {
    if (params.size > 0) {
      // Tự động giả lập gọi IPN Webhook ở dưới background khi đang ở môi trường Dev
      // Điều này giúp bạn không cần phải gửi mail cấu hình IPN cho VNPAY mỗi khi link Railway thay đổi
      fetch(`/api/v1/payments/vnpay/ipn?${params.toString()}`).catch(() => {})
    }
  }, [params])

  return null
}
