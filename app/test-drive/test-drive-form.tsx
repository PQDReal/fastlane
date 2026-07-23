'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, CarFront, ChevronRight, User } from 'lucide-react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import type { TestDriveVehicleOption } from '@/lib/services/test-drive-service'

type TestDriveFormProps = {
  vehicles: TestDriveVehicleOption[]
  loadError?: boolean
  initialUser?: {
    fullName: string
    phoneNumber: string
    email: string
  } | null
}

export function TestDriveForm({
  vehicles,
  loadError = false,
  initialUser = null,
}: TestDriveFormProps) {
  const [step, setStep] = useState(1)
  const hasVehicles = vehicles.length > 0
  const cars = vehicles.filter((vehicle) => vehicle.category === 'Ô tô điện')
  const bikes = vehicles.filter((vehicle) => vehicle.category === 'Xe máy điện')

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />

      <div className="border-b border-black/5 bg-muted py-20">
        <div className="mx-auto max-w-[1440px] px-6 text-center lg:px-12">
          <div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-brand-600">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Lái thử</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Đặt lịch lái thử</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
            Trải nghiệm trực tiếp sức mạnh và công nghệ thông minh của dòng xe điện tương lai.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[800px] px-6 py-16 lg:px-12">
        <div className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-glass md:p-12">
          <form className="space-y-12" onSubmit={(event) => { event.preventDefault(); setStep(2) }}>
            {step === 1 ? (
              <>
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
                    <CarFront size={20} className="text-brand-600" /> Mẫu xe lái thử
                  </h3>
                  <div className="space-y-2">
                    <label htmlFor="test-drive-vehicle" className="text-sm font-medium text-foreground">Chọn mẫu xe</label>
                    <select
                      id="test-drive-vehicle"
                      name="vehicleId"
                      defaultValue=""
                      disabled={!hasVehicles}
                      required
                      className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="" disabled>
                        {hasVehicles ? 'Chọn mẫu xe bạn muốn lái thử' : 'Hiện chưa có mẫu xe phù hợp'}
                      </option>
                      {cars.length > 0 && (
                        <optgroup label="Ô tô điện">
                          {cars.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {bikes.length > 0 && (
                        <optgroup label="Xe máy điện">
                          {bikes.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {loadError && <p className="text-sm text-red-600">Không thể tải danh sách mẫu xe. Vui lòng thử lại sau.</p>}
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
                    <Calendar size={20} className="text-brand-600" /> Thời gian lái thử
                  </h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Ngày lái thử</label>
                      <input type="date" name="testDriveDate" className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Giờ dự kiến</label>
                      <input type="time" name="testDriveTime" className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" required />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
                    <User size={20} className="text-brand-600" /> Thông tin cá nhân
                  </h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Họ và tên</label>
                      <input type="text" name="fullName" defaultValue={initialUser?.fullName ?? ''} placeholder="Nguyễn Văn A" className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Số điện thoại</label>
                      <input type="tel" name="phoneNumber" defaultValue={initialUser?.phoneNumber ?? ''} placeholder="0912 345 678" className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" required />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">Email (Không bắt buộc)</label>
                      <input type="email" name="email" defaultValue={initialUser?.email ?? ''} placeholder="example@gmail.com" className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" />
                    </div>
                  </div>
                </section>

                <Button type="submit" disabled={!hasVehicles} className="h-14 w-full rounded-xl bg-foreground text-base font-bold text-background hover:bg-foreground/90">
                  Xác nhận đặt lịch
                </Button>
              </>
            ) : (
              <div className="space-y-6 py-12 text-center">
                <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-500"><Calendar size={40} /></div>
                <h2 className="text-3xl font-bold text-foreground">Đặt lịch thành công!</h2>
                <p className="mx-auto max-w-sm text-muted-foreground">
                  Cảm ơn bạn đã đăng ký. Chuyên viên của Fastlane sẽ liên hệ với bạn trong thời gian sớm nhất để xác nhận lịch hẹn.
                </p>
                <div className="pt-8">
                  <Button onClick={() => setStep(1)} variant="outline" className="h-12 rounded-full px-8 font-bold">Về trang chủ</Button>
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