import Link from 'next/link'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

type PublicInfoPageProps = {
  eyebrow?: string
  title: string
  intro: string
  children: React.ReactNode
}

export function PublicInfoPage({ eyebrow = 'FASTLANE', title, intro, children }: PublicInfoPageProps) {
  return (
    <main className="min-h-screen bg-[#f5f6f7] text-slate-900">
      <Header />
      <section className="border-b border-slate-200 bg-[#eef1f3] pt-[74px]">
        <div className="mx-auto max-w-[1440px] px-6 py-16 sm:py-20 lg:px-12 lg:py-24">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <ArrowLeft size={16} />
            Trang chủ
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{intro}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1440px] px-6 py-12 sm:py-16 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-5xl">{children}</div>
      </section>
      <Footer />
    </main>
  )
}

export function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-8 first:border-t-0 first:pt-0 sm:py-10">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-600">{children}</div>
    </section>
  )
}

export function InfoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2 font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-brand-700 hover:decoration-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {children}
      <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  )
}
