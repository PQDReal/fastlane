import './globals.css'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Inter } from 'next/font/google'
import { Auth0Provider } from '@auth0/nextjs-auth0/client'
import { NavigationLoadingIndicator } from '@/components/navigation-loading-indicator'
import { GlobalOverlays } from '@/components/global-overlays'

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'FASTLANE | Khởi nguồn tương lai di chuyển',
  description: 'Giải pháp di chuyển xanh, thông minh và đẳng cấp.',
  icons: {
    icon: '/images/favicon.ico',
    shortcut: '/images/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white" suppressHydrationWarning>
        <Auth0Provider>
          <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100/40 via-slate-50 to-slate-50 pointer-events-none" />
          {children}
          <Suspense fallback={null}>
            <NavigationLoadingIndicator />
          </Suspense>
          <GlobalOverlays />
        </Auth0Provider>
      </body>
    </html>
  )
}
