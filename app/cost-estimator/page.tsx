'use client'

import { AuthenticatedHeader } from '../../components/authenticated-header'
import { Footer } from '../../components/footer'
import { ChevronRight, Calculator, Info } from 'lucide-react'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Button } from '../../components/ui/button'

const vehicles = [
  { id: 'vf9', name: 'VinFast VF9', price: 1491000000 },
  { id: 'vf8', name: 'VinFast VF8', price: 1090000000 },
  { id: 'vf7', name: 'VinFast VF7', price: 850000000 },
  { id: 'ventos', name: 'Vento S', price: 50000000 },
]

const provinces = [
  { id: 'hn', name: 'Hà Nội', registrationFee: 0.12, plateFee: 20000000 },
  { id: 'hcm', name: 'TP. Hồ Chí Minh', registrationFee: 0.10, plateFee: 20000000 },
  { id: 'other', name: 'Tỉnh/Thành khác', registrationFee: 0.10, plateFee: 1000000 },
]

export default function CostEstimatorPage() {
  const [vehicleId, setVehicleId] = useState(vehicles[0].id)
  const [provinceId, setProvinceId] = useState(provinces[0].id)
  const [loanPercent, setLoanPercent] = useState(80)
  const [loanDuration, setLoanDuration] = useState(60) // months
  const [interestRate, setInterestRate] = useState(8.5) // percent per year

  const selectedVehicle = vehicles.find(v => v.id === vehicleId)!
  const selectedProvince = provinces.find(p => p.id === provinceId)!

  const calculation = useMemo(() => {
    // Electric cars in VN currently have 0% registration fee, but let's calculate based on province rules if standard, or apply EV exemption.
    // For realism, let's assume EVs have 0% registration fee right now.
    const isCar = selectedVehicle.price > 100000000
    const regFee = isCar ? 0 : selectedVehicle.price * selectedProvince.registrationFee // EV tax exemption

    const roadFee = isCar ? 1560000 : 0
    const insurance = isCar ? 500000 : 66000 // Civil liability
    const plateFee = selectedProvince.plateFee

    const totalRollingCost = selectedVehicle.price + regFee + roadFee + insurance + plateFee
    
    const loanAmount = (selectedVehicle.price * loanPercent) / 100
    const initialPayment = totalRollingCost - loanAmount

    // Monthly payment (principal + interest)
    const monthlyPrincipal = loanAmount / loanDuration
    const monthlyInterest = (loanAmount * (interestRate / 100)) / 12
    const firstMonthPayment = monthlyPrincipal + monthlyInterest

    return {
      price: selectedVehicle.price,
      regFee,
      roadFee,
      insurance,
      plateFee,
      totalRollingCost,
      loanAmount,
      initialPayment,
      firstMonthPayment
    }
  }, [selectedVehicle, selectedProvince, loanPercent, loanDuration, interestRate])

  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + ' ₫'

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <AuthenticatedHeader />
      
      <div className="bg-muted py-24 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Dự toán chi phí</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">Dự toán chi phí</h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Công cụ hỗ trợ tính toán chi phí lăn bánh và trả góp chi tiết, giúp bạn dễ dàng lên kế hoạch tài chính.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 lg:px-12 py-16 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left: Form */}
          <div className="lg:col-span-3 space-y-10">
            <section>
              <h3 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-3"><Calculator size={24} className="text-brand-600"/> 1. Chọn xe và địa phương</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Dòng xe</label>
                  <select 
                    className="w-full h-12 px-4 rounded-xl border border-muted bg-muted/50 text-foreground font-medium focus:outline-none focus:border-brand-500 transition-colors"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                  >
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Nơi đăng ký</label>
                  <select 
                    className="w-full h-12 px-4 rounded-xl border border-muted bg-muted/50 text-foreground font-medium focus:outline-none focus:border-brand-500 transition-colors"
                    value={provinceId}
                    onChange={(e) => setProvinceId(e.target.value)}
                  >
                    {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="pt-10 border-t border-muted">
              <h3 className="text-2xl font-bold text-foreground mb-6">2. Phương án vay mua xe</h3>
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <label className="text-sm font-semibold text-foreground">Tỷ lệ vay (%)</label>
                    <span className="text-sm font-bold text-brand-600">{loanPercent}%</span>
                  </div>
                  <input type="range" min="0" max="80" step="5" value={loanPercent} onChange={(e) => setLoanPercent(Number(e.target.value))} className="w-full accent-foreground" />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <label className="text-sm font-semibold text-foreground">Thời gian vay (Tháng)</label>
                    <span className="text-sm font-bold text-brand-600">{loanDuration} tháng</span>
                  </div>
                  <input type="range" min="12" max="96" step="12" value={loanDuration} onChange={(e) => setLoanDuration(Number(e.target.value))} className="w-full accent-foreground" />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <label className="text-sm font-semibold text-foreground">Lãi suất dự kiến (%/năm)</label>
                    <span className="text-sm font-bold text-brand-600">{interestRate}%</span>
                  </div>
                  <input type="range" min="5" max="15" step="0.1" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} className="w-full accent-foreground" />
                </div>
              </div>
            </section>
          </div>

          {/* Right: Summary */}
          <div className="lg:col-span-2">
            <div className="bg-foreground text-background rounded-3xl p-8 sticky top-[100px] shadow-2xl">
              <h3 className="text-xl font-bold mb-8 tracking-tight">Chi phí dự tính</h3>
              
              <div className="space-y-4 text-sm font-medium">
                <div className="flex justify-between">
                  <span className="text-white/60">Giá xe</span>
                  <span>{formatPrice(calculation.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Phí trước bạ (EV 0%)</span>
                  <span>{formatPrice(calculation.regFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Phí đăng ký biển số</span>
                  <span>{formatPrice(calculation.plateFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Phí bảo trì đường bộ</span>
                  <span>{formatPrice(calculation.roadFee)}</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-4">
                  <span className="text-white/60">Bảo hiểm TNDS</span>
                  <span>{formatPrice(calculation.insurance)}</span>
                </div>

                <div className="flex justify-between pt-2">
                  <span className="text-lg font-bold">Tổng lăn bánh</span>
                  <span className="text-xl font-bold text-brand-400">{formatPrice(calculation.totalRollingCost)}</span>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10 space-y-4 text-sm font-medium">
                <div className="flex justify-between">
                  <span className="text-white/60">Số tiền vay ({loanPercent}%)</span>
                  <span>{formatPrice(calculation.loanAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Trả trước</span>
                  <span className="text-lg font-bold">{formatPrice(calculation.initialPayment)}</span>
                </div>
                <div className="flex justify-between bg-white/5 p-4 rounded-xl mt-4">
                  <span className="text-white/80">Trả góp tháng đầu</span>
                  <span className="text-2xl font-bold text-brand-400">{formatPrice(calculation.firstMonthPayment)}</span>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <Button className="w-full bg-white text-black hover:bg-white/90 font-bold h-12 rounded-xl">Nhận tư vấn chi tiết</Button>
                <p className="text-[11px] text-white/40 text-center flex items-center justify-center gap-1"><Info size={12}/> Kết quả chỉ mang tính chất tham khảo.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
