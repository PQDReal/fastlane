'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, CarFront, ChevronRight, User } from 'lucide-react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { createTestDriveRequest } from '@/lib/api/test-drive-client'
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
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null)
  const hasVehicles = vehicles.length > 0
  const cars = vehicles.filter((vehicle) => vehicle.category === 'Ô tô điện')
  const bikes = vehicles.filter((vehicle) => vehicle.category === 'Xe máy điện')
  const minimumTestDriveDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const formData = new FormData(event.currentTarget)

    try {
      const reservation = await createTestDriveRequest({
        productId: formData.get('vehicleId'),
        testDriveDate: formData.get('testDriveDate'),
        testDriveTime: formData.get('testDriveTime'),
        fullName: formData.get('fullName'),
        phoneNumber: formData.get('phoneNumber'),
        email: formData.get('email'),
        note: formData.get('note'),
        privacyConsent: formData.get('privacyConsent') === 'on',
        licenceAcknowledged: formData.get('licenceAcknowledged') === 'on',
        marketingConsent: formData.get('marketingConsent') === 'on',
      })

      setReferenceNumber(reservation.referenceNumber)
      setStep(2)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo yêu cầu lái thử')
    } finally {
      setSubmitting(false)
    }
  }

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
          <form className="space-y-12" onSubmit={handleSubmit}>
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
                      <input type="date" name="testDriveDate" min={minimumTestDriveDate} className="h-12 w-full rounded-xl border border-muted bg-background px-4 text-sm focus:border-brand-500 focus:outline-none" required />
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
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">Ghi chú (Không bắt buộc)</label>
                      <textarea name="note" maxLength={500} rows={3} className="w-full rounded-xl border border-muted bg-background px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
                    </div>
                  </div>
                </section>

                <section className="space-y-3 text-sm text-muted-foreground">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="licenceAcknowledged" required className="mt-1" />
                    <span>Tôi xác nhận người lái sẽ mang theo giấy phép lái xe hợp lệ.</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="privacyConsent" required className="mt-1" />
                    <span>Tôi đồng ý cho Fastlane xử lý thông tin để liên hệ và xác nhận lịch lái thử.</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="marketingConsent" className="mt-1" />
                    <span>Tôi đồng ý nhận thông tin ưu đãi từ Fastlane (không bắt buộc).</span>
                  </label>
                </section>

                {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

                <Button type="submit" disabled={!hasVehicles || submitting} className="h-14 w-full rounded-xl bg-foreground text-base font-bold text-background hover:bg-foreground/90">
                  {submitting ? 'Đang gửi yêu cầu...' : 'Xác nhận đặt lịch'}
                </Button>
              </>
            ) : (
              <div className="space-y-6 py-12 text-center">
                <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-500"><Calendar size={40} /></div>
                <h2 className="text-3xl font-bold text-foreground">Đặt lịch thành công!</h2>
                <p className="mx-auto max-w-sm text-muted-foreground">
                  Cảm ơn bạn đã đăng ký. Chuyên viên của Fastlane sẽ liên hệ với bạn trong thời gian sớm nhất để xác nhận lịch hẹn.
                </p>
                {referenceNumber && <p className="font-semibold text-foreground">Mã yêu cầu: {referenceNumber}</p>}
                <div className="pt-8">
                  <Button asChild variant="outline" className="h-12 rounded-full px-8 font-bold">
                    <Link href="/">Về trang chủ</Link>
                  </Button>
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