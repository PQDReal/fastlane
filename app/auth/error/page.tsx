import { AlertTriangle } from 'lucide-react'

import { AuthErrorActions } from './auth-error-actions'

const errors: Record<string, { title: string; message: string }> = {
  account_inactive: {
    title: 'Tài khoản đã bị vô hiệu hóa',
    message: 'Tài khoản này hiện không được phép đăng nhập. Vui lòng liên hệ quản trị viên để được hỗ trợ.',
  },
  account_not_found: {
    title: 'Tài khoản không tồn tại',
    message: 'Tài khoản này đã bị xóa hoặc không còn tồn tại. Vui lòng đăng nhập bằng tài khoản khác.',
  },
  popup_blocked: {
    title: 'Không thể mở cửa sổ đăng nhập',
    message: 'Trình duyệt đang chặn popup. Vui lòng cho phép popup cho trang này rồi thử lại.',
  },
  callback_failed: {
    title: 'Đăng nhập không thành công',
    message: 'Không thể hoàn tất quá trình xác thực. Vui lòng thử đăng nhập lại.',
  },
  authorization_denied: {
    title: 'Bạn đã từ chối xác nhận',
    message: 'Phiên đăng nhập chưa được hoàn tất. Hãy đăng nhập lại nếu bạn muốn tiếp tục.',
  },
  email_unverified: {
    title: 'Email chưa được xác thực',
    message: 'Vui lòng xác thực email qua thư từ FASTLANE, sau \u0111\u00f3 \u0111\u0103ng nh\u1eadp l\u1ea1i \u0111\u1ec3 truy c\u1eadp trang web.',
  },
  sync_failed: {
    title: 'Không thể kiểm tra tài khoản',
    message: 'Hệ thống chưa thể kiểm tra trạng thái tài khoản. Vui lòng thử lại sau.',
  },
}

type Props = {
  searchParams: Promise<{ code?: string | string[] }>
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams
  const requestedCode = Array.isArray(params.code) ? params.code[0] : params.code
  const code = requestedCode && errors[requestedCode] ? requestedCode : 'callback_failed'
  const error = errors[code]

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl sm:p-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={32} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">{error.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{error.message}</p>
        <AuthErrorActions
          canRetry={code !== 'account_inactive'}
          retryLabel={code === 'email_unverified' || code === 'account_not_found' ? 'Đăng nhập bằng tài khoản khác' : undefined}
          forceLogin={code === 'email_unverified' || code === 'account_not_found'}
        />
      </section>
    </main>
  )
}
