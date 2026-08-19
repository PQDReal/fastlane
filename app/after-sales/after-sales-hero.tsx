'use client'

import { Calendar, MapPin, BookOpen, Shield, Wrench, PhoneCall } from 'lucide-react'

interface AfterSalesHeroProps {
  onOpenBooking: () => void
  onSelectTab: (tab: string) => void
}

export function AfterSalesHero({ onOpenBooking, onSelectTab }: AfterSalesHeroProps) {
  return (
    <section className="relative overflow-hidden bg-slate-950 pt-[100px] pb-16 text-white sm:pt-[120px] sm:pb-20 lg:pt-[140px] lg:pb-24">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-gradient-to-b from-[#836100]/25 via-amber-600/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/60 via-slate-950 to-slate-950" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Badges & Intro */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#e6b32e] backdrop-blur-md">
            <Shield size={14} />
            Hệ sinh thái dịch vụ chính hãng FASTLANE
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Dịch vụ hậu mãi <span className="bg-gradient-to-r from-amber-200 via-[#e6b32e] to-amber-500 bg-clip-text text-transparent">toàn diện</span>
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            Đồng hành cùng quý khách trên mọi hành trình với chính sách bảo hành lên tới 10 năm, mạng lưới xưởng dịch vụ rộng khắp và cứu hộ khẩn cấp 24/7.
          </p>

          {/* Quick Metrics Bar */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <p className="text-2xl font-bold text-[#e6b32e] sm:text-3xl">10 Năm</p>
              <p className="mt-1 text-xs text-slate-400">Bảo hành xe & pin</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <p className="text-2xl font-bold text-white sm:text-3xl">24/7</p>
              <p className="mt-1 text-xs text-slate-400">Cứu hộ toàn quốc</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <p className="text-2xl font-bold text-white sm:text-3xl">100%</p>
              <p className="mt-1 text-xs text-slate-400">Phụ tùng chính hãng</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <p className="text-2xl font-bold text-[#e6b32e] sm:text-3xl">Toàn quốc</p>
              <p className="mt-1 text-xs text-slate-400">Mạng lưới xưởng & sạc</p>
            </div>
          </div>
        </div>

        {/* 3 Featured Action Cards (Inspired by VinFast UI reference) */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Đặt lịch dịch vụ */}
          <div
            onClick={onOpenBooking}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenBooking()
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-b from-slate-900 to-slate-950 p-7 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl transition-all group-hover:bg-amber-500/20" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#836100]/20 text-[#e6b32e] transition-transform duration-300 group-hover:scale-110">
              <Calendar size={24} />
            </div>
            <h2 className="mt-5 text-xl font-bold tracking-tight text-white group-hover:text-[#e6b32e] transition-colors">
              ĐẶT LỊCH DỊCH VỤ
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Chủ động hẹn lịch bảo dưỡng, sửa chữa định kỳ hoặc dịch vụ Mobile Service tiện lợi tại nhà.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#e6b32e]">
              <span>Đặt lịch ngay</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </div>
          </div>

          {/* Card 2: Tra cứu xưởng dịch vụ */}
          <div
            onClick={() => onSelectTab('workshop')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectTab('workshop')
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-7 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:shadow-2xl active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-28 w-28 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-400 transition-transform duration-300 group-hover:scale-110">
              <MapPin size={24} />
            </div>
            <h2 className="mt-5 text-xl font-bold tracking-tight text-white group-hover:text-blue-300 transition-colors">
              TRA CỨU XƯỞNG DỊCH VỤ
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Tìm kiếm showroom, trạm sạc và trung tâm dịch vụ kỹ thuật ủy quyền gần nhất trên toàn quốc.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <span>Tìm xưởng gần bạn</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </div>
          </div>

          {/* Card 3: Tra cứu tài liệu hướng dẫn (Merged User Manual) */}
          <div
            onClick={() => onSelectTab('manual')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectTab('manual')
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-7 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:shadow-2xl active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:col-span-2 lg:col-span-1"
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 transition-transform duration-300 group-hover:scale-110">
              <BookOpen size={24} />
            </div>
            <h2 className="mt-5 text-xl font-bold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
              TRA CỨU HƯỚNG DẪN SỬ DỤNG
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Xem sổ tay hướng dẫn vận hành xe, tính năng thông minh, sạc pin an toàn và xử lý sự cố trực quan.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <span>Tra cứu cẩm nang xe</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
