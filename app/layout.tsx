import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthUserProvider } from '../components/auth-user-provider'
import { auth0 } from '../lib/auth0'

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'FASTLANE | Khởi nguồn tương lai di chuyển',
  description: 'Giải pháp di chuyển xanh, thông minh và đẳng cấp.',
  icons: {
    icon: '/images/favicon.ico',
    shortcut: '/images/favicon.ico',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession()
  const user = session
    ? {
        email: session.user.email,
        name: session.user.name,
      }
    : undefined
  return (
    <html lang="vi" className={`${inter.variable}`}>
      <body className="font-sans antialiased bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white">
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100/40 via-slate-50 to-slate-50 pointer-events-none" />
        <AuthUserProvider user={user}>{children}</AuthUserProvider>
      </body>
    </html>
  )
}
