'use client'

import { useEffect } from 'react'

type AuthCompleteMessage = {
  type: 'auth_complete'
  success: boolean
  error?: { message: string }
}

const errorMessages: Record<string, string> = {
  account_inactive: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
  authorization_denied: 'Bạn đã từ chối xác nhận. Vui lòng đăng nhập lại nếu muốn tiếp tục.',
  callback_failed: 'Đăng nhập không thành công. Vui lòng thử lại.',
  email_unverified: 'Vui l\u00f2ng x\u00e1c th\u1ef1c email tr\u01b0\u1edbc khi truy c\u1eadp trang web.',
  sync_failed: 'Không thể kiểm tra trạng thái tài khoản. Vui lòng thử lại.',
}

export default function PopupCompletePage() {
  useEffect(() => {
    const errorCode = new URLSearchParams(window.location.search).get('auth_error')
    const message: AuthCompleteMessage = errorCode
      ? {
          type: 'auth_complete',
          success: false,
          error: { message: errorMessages[errorCode] ?? 'Đăng nhập không thành công. Vui lòng thử lại.' },
        }
      : { type: 'auth_complete', success: true }

    window.opener?.postMessage(message, window.location.origin)
    window.close()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <p className="text-sm text-slate-600">Đang hoàn tất đăng nhập…</p>
    </main>
  )
}
