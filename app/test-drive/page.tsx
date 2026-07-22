'use client'

import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { ChevronRight, Calendar, MapPin, User, CarFront } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '../../components/ui/button'

const vehicles = ["VinFast VF9", "VinFast VF8", "VinFast VF7", "Vento S"]
const provinces = ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hải Phòng"]
const showrooms = ["VinFast Landmark 81", "VinFast Ocean Park", "VinFast Times City", "VinFast Thảo Điền"]

export default function TestDrivePage() {
  const [step, setStep] = useState(1)

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <div className="bg-muted py-20 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Lái thử</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Đặt lịch lái thử</h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
            Trải nghiệm trực tiếp sức mạnh và công nghệ thông minh của dòng xe điện tương lai tại showroom gần bạn nhất.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[800px] px-6 lg:px-12 py-16 w-full">
        <div className="bg-white rounded-[2rem] border border-black/5 shadow-glass p-8 md:p-12">
          
          <form className="space-y-12" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
            {step === 1 ? (
              <>
                {/* 1. Vehicle */}
                <section>
                  <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2"><CarFront size={20} className="text-brand-600"/> Mẫu xe lái thử</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {vehicles.map((v, i) => (
                      <label key={i} className="relative cursor-pointer group">
                        <input type="radio" name="vehicle" className="peer sr-only" defaultChecked={i === 0} />
                        <div className="p-4 rounded-xl border border-muted bg-muted/30 text-center font-medium transition-all peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 hover:border-brand-300">
                          {v}
                        </div>
                      </label>
                    ))}
                  </div>
                </section>

                {/* 2. Location & Time */}
                <section>
                  <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2"><MapPin size={20} className="text-brand-600"/> Thời gian & Địa điểm</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Tỉnh/Thành phố</label>
                      <select className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm">
                        {provinces.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Showroom</label>
                      <select className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm">
                        {showrooms.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Ngày lái thử</label>
                      <input type="date" className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Giờ dự kiến</label>
                      <input type="time" className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm" required />
                    </div>
                  </div>
                </section>

                {/* 3. Customer Info */}
                <section>
                  <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2"><User size={20} className="text-brand-600"/> Thông tin cá nhân</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Họ và tên</label>
                      <input type="text" placeholder="Nguyễn Văn A" className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Số điện thoại</label>
                      <input type="tel" placeholder="0912 345 678" className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm" required />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">Email (Không bắt buộc)</label>
                      <input type="email" placeholder="example@gmail.com" className="w-full h-12 px-4 rounded-xl border border-muted bg-background focus:outline-none focus:border-brand-500 text-sm" />
                    </div>
                  </div>
                </section>

                <Button type="submit" className="w-full bg-foreground text-background hover:bg-foreground/90 font-bold h-14 rounded-xl text-base">Xác nhận đặt lịch</Button>
              </>
            ) : (
              <div className="text-center py-12 space-y-6">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8">
                  <Calendar size={40} />
                </div>
                <h2 className="text-3xl font-bold text-foreground">Đặt lịch thành công!</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  Cảm ơn bạn đã đăng ký. Chuyên viên của Fastlane sẽ liên hệ với bạn trong thời gian sớm nhất để xác nhận lịch hẹn.
                </p>
                <div className="pt-8">
                  <Button onClick={() => setStep(1)} variant="outline" className="h-12 px-8 rounded-full font-bold">Về trang chủ</Button>
                </div>
              </div>
            )}
          </form>

        </div>
      </div>

      <Footer />
    </main>
  )
}
