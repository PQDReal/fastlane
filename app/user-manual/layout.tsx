import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

export const metadata = {
  title: 'Hướng dẫn sử dụng - FASTLANE',
  description: 'Hướng dẫn sử dụng xe VinFast.',
}

export default function UserManualLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pt-[74px]">
      <Header />
      <main className="flex-1 w-full max-w-[1536px] mx-auto bg-white min-h-[calc(100vh-74px)] flex">
        {children}
      </main>
      <Footer />
    </div>
  )
}
