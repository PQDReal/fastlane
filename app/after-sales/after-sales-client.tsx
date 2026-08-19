'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck,
  Wrench,
  Sparkles,
  PhoneCall,
  BookOpen,
  MapPin,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Search,
  Clock,
  Car,
  BatteryCharging,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import type { AfterSalesData, VehicleCategoryType } from '@/lib/api/after-sales-types'
import type { ManualModel } from '@/lib/api/manuals-server'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { ServiceBookingModal } from './service-booking-modal'
import { AfterSalesHero } from './after-sales-hero'

interface AfterSalesClientProps {
  initialData: AfterSalesData
  manualModels: ManualModel[]
}

const VEHICLE_CATEGORIES: { type: VehicleCategoryType; label: string; icon: string; desc: string }[] = [
  {
    type: 'car',
    label: 'Ô tô điện',
    icon: '/images/vf8.png',
    desc: 'VF 3, VF 5, VF 6, VF 7, VF 8, VF 9 & VF e34',
  },
  {
    type: 'motorbike',
    label: 'Xe máy điện',
    icon: '/images/vento.png',
    desc: 'Evo 200, Feliz S, Klara S, Vento S & Theon S',
  },
  {
    type: 'bus',
    label: 'Xe buýt điện',
    icon: 'https://vinfastauto.com/themes/porto/img/vcreator/vf9/vf9-banner-desktop.jpg',
    desc: 'VinBus hệ thống giao thông công cộng xanh',
  },
]

const TABS = [
  { id: 'warranty', label: 'Chính sách bảo hành', icon: ShieldCheck },
  { id: 'maintenance', label: 'Dịch vụ bảo dưỡng', icon: Wrench },
  { id: 'repair', label: 'Dịch vụ sửa chữa', icon: Sparkles },
  { id: 'rescue', label: 'Thông tin cứu hộ 24/7', icon: PhoneCall },
  { id: 'manual', label: 'Hướng dẫn sử dụng xe', icon: BookOpen },
  { id: 'workshop', label: 'Tra cứu xưởng dịch vụ', icon: MapPin },
]

export function AfterSalesClient({ initialData, manualModels }: AfterSalesClientProps) {
  const router = useRouter()
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleCategoryType>('car')
  const [activeTab, setActiveTab] = useState<string>('warranty')
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [bookingInitialService, setBookingInitialService] = useState<string>('Bảo dưỡng định kỳ')
  const [bookingWorkshopId, setBookingWorkshopId] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('all')
  const [workshopSearch, setWorkshopSearch] = useState<string>('')
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('')
  const [selectedManualModel, setSelectedManualModel] = useState<string>('')
  const [selectedManualYear, setSelectedManualYear] = useState<string>('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { ...toast, id }])
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const openBookingWithConfig = (serviceType: string, workshopId = '') => {
    setBookingInitialService(serviceType)
    setBookingWorkshopId(workshopId)
    setBookingModalOpen(true)
  }

  // Filtered Warranties
  const filteredWarranties = initialData.warranties.filter(
    (w) => selectedVehicleType === 'all' || w.vehicleType === selectedVehicleType,
  )

  // Filtered Maintenances
  const filteredMaintenances = initialData.maintenances.filter(
    (m) => selectedVehicleType === 'all' || m.vehicleType === selectedVehicleType,
  )

  // Filtered Workshops
  const cities = Array.from(new Set(initialData.workshops.map((w) => w.city)))
  const filteredWorkshops = initialData.workshops.filter((w) => {
    const matchCity = selectedCity === 'all' || w.city === selectedCity
    const matchSearch =
      !workshopSearch ||
      w.name.toLowerCase().includes(workshopSearch.toLowerCase()) ||
      w.address.toLowerCase().includes(workshopSearch.toLowerCase()) ||
      w.district.toLowerCase().includes(workshopSearch.toLowerCase())
    return matchCity && matchSearch
  })

  // Manual Models Grouping
  const manualModelGroups = manualModels.reduce((acc, m) => {
    const series = m.model_series || m.name
    if (!acc[series]) {
      acc[series] = {
        name: series,
        category: m.category || 'Ô tô điện',
        thumbnail: m.thumbnail || '',
        years: [],
        items: [],
      }
    }
    if (m.year && !acc[series].years.includes(m.year)) {
      acc[series].years.push(m.year)
    }
    acc[series].items.push(m)
    return acc
  }, {} as Record<string, { name: string; category: string; thumbnail: string; years: string[]; items: ManualModel[] }>)

  const manualSeriesList = Object.values(manualModelGroups).filter((group) => {
    if (!manualSearchQuery) return true
    return group.name.toLowerCase().includes(manualSearchQuery.toLowerCase())
  })

  const handleManualNavigate = (modelCode: string, year: string) => {
    if (!modelCode || !year) {
      addToast({
        kind: 'warning',
        title: 'Chưa chọn đủ thông tin',
        message: 'Vui lòng chọn mẫu xe và năm sản xuất để xem cẩm nang hướng dẫn.',
      })
      return
    }
    router.push(`/user-manual/${encodeURIComponent(modelCode)}_${encodeURIComponent(year)}`)
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Toast Notification Viewport */}
      <ToastViewport toasts={toasts} onClose={removeToast} />

      {/* Hero Header with Quick Action Cards */}
      <AfterSalesHero
        onOpenBooking={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
        onSelectTab={(tabId) => {
          setActiveTab(tabId)
          const target = document.getElementById('after-sales-content')
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' })
          }
        }}
      />

      {/* Main Interactive Hub Section */}
      <section id="after-sales-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Vehicle Category Selector Bar (VinFast UI Inspired) */}
        <div className="mb-10 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#836100]">Danh mục phương tiện</span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
                Chọn dòng xe để xem thông tin dịch vụ phù hợp
              </h2>
            </div>
            <button
              onClick={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
              className="self-start sm:self-auto inline-flex items-center gap-2 rounded-full bg-[#836100] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow transition hover:bg-[#6c4f00] active:scale-95"
            >
              <Calendar size={15} />
              Đặt lịch dịch vụ
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {VEHICLE_CATEGORIES.map((cat) => {
              const isSelected = selectedVehicleType === cat.type
              return (
                <button
                  key={cat.type}
                  type="button"
                  onClick={() => setSelectedVehicleType(cat.type)}
                  className={`group relative flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-98 ${
                    isSelected
                      ? 'border-[#836100] bg-[#836100]/5 ring-2 ring-[#836100]/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 p-1.5 overflow-hidden">
                    <img
                      src={cat.icon}
                      alt={cat.label}
                      className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-base font-bold ${isSelected ? 'text-[#836100]' : 'text-slate-900'}`}>
                        {cat.label}
                      </p>
                      {isSelected && (
                        <span className="flex h-2 w-2 rounded-full bg-[#836100]" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">{cat.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 overflow-x-auto pb-2 hide-scrollbar">
          <div className="flex items-center gap-2 min-w-max border-b border-slate-200 pb-2">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 active:scale-95 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-[#e6b32e]' : 'text-slate-400'} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab 1: CHÍNH SÁCH BẢO HÀNH */}
        {activeTab === 'warranty' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Chính sách bảo hành chính hãng</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Thời hạn bảo hành áp dụng cho các dòng xe và khối pin của FASTLANE / VinFast
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={14} className="text-emerald-600" />
                Áp dụng toàn quốc
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredWarranties.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#836100] border border-amber-200/60">
                        {item.vehicleType === 'car' ? 'Ô tô điện' : item.vehicleType === 'motorbike' ? 'Xe máy điện' : 'Xe buýt'}
                      </span>
                      {item.highlight && (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                          Nổi bật
                        </span>
                      )}
                    </div>

                    <h4 className="mt-4 text-xl font-bold text-slate-900">{item.modelSeries}</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Áp dụng: {item.models.join(', ')}
                    </p>

                    <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thời hạn bảo hành xe</p>
                        <p className="text-lg font-extrabold text-[#836100] mt-0.5">{item.warrantyTerm}</p>
                      </div>
                      <div className="border-t border-slate-200/60 pt-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bảo hành khối Pin</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{item.batteryWarrantyTerm}</p>
                      </div>
                      {item.commercialWarranty && (
                        <div className="border-t border-slate-200/60 pt-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mục đích kinh doanh vận tải</p>
                          <p className="text-xs font-medium text-slate-700 mt-0.5">{item.commercialWarranty}</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Điều kiện bảo hành</p>
                      <ul className="space-y-1.5 text-xs text-slate-600">
                        {item.conditions.map((cond, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-[#836100] font-bold">•</span>
                            <span>{cond}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => openBookingWithConfig('Kiểm tra bảo hành')}
                      className="text-xs font-bold text-[#836100] hover:underline flex items-center gap-1"
                    >
                      Đặt hẹn kiểm tra <ChevronRight size={14} />
                    </button>
                    <span className="text-[11px] text-slate-400">Chính hãng 100%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Warranty Process Callout */}
            <div className="rounded-3xl bg-slate-900 p-8 text-white sm:p-10">
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#e6b32e]">Quy trình tiếp nhận</span>
                <h4 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  Bảo hành nhanh chóng & Minh bạch
                </h4>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                    <span className="text-xl font-bold text-[#e6b32e]">01</span>
                    <p className="mt-2 font-bold text-white text-sm">Tiếp nhận & Chẩn đoán</p>
                    <p className="mt-1 text-xs text-slate-300">Đọc mã lỗi chuyên sâu bằng máy chẩn đoán chính hãng.</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                    <span className="text-xl font-bold text-[#e6b32e]">02</span>
                    <p className="mt-2 font-bold text-white text-sm">Xác nhận phạm vi</p>
                    <p className="mt-1 text-xs text-slate-300">Thông báo chi tiết và cam kết thời gian hoàn thành.</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                    <span className="text-xl font-bold text-[#e6b32e]">03</span>
                    <p className="mt-2 font-bold text-white text-sm">Bàn giao & Bảo hành</p>
                    <p className="mt-1 text-xs text-slate-300">Kiểm tra an toàn tổng quát và xuất biên bản bàn giao xe.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: DỊCH VỤ BẢO DƯỠNG */}
        {activeTab === 'maintenance' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Lịch trình & Hạng mục bảo dưỡng định kỳ</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Tối ưu hiệu suất hoạt động, kéo dài tuổi thọ pin và bảo đảm an toàn trên mọi hành trình.
                </p>
              </div>
              <button
                onClick={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
                className="inline-flex items-center gap-2 rounded-full bg-[#836100] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow transition hover:bg-[#6c4f00] active:scale-95"
              >
                <Calendar size={15} /> Đặt lịch bảo dưỡng
              </button>
            </div>

            {filteredMaintenances.map((m) => (
              <div key={m.id} className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="text-xl font-bold text-slate-900">{m.title}</h4>
                    <p className="mt-1 text-sm text-slate-600">{m.description}</p>
                  </div>
                  {m.mobileServiceAvailable && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                      <Sparkles size={13} /> Có hỗ trợ Mobile Service
                    </span>
                  )}
                </div>

                {/* Milestones Grid */}
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {m.intervals.map((inter, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-[#836100]">
                          {inter.mileageKm.toLocaleString()} KM
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <Clock size={12} /> {inter.estimatedDuration}
                        </span>
                      </div>
                      <h5 className="mt-2 text-base font-bold text-slate-900">{inter.level}</h5>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{inter.description}</p>

                      <div className="mt-4 border-t border-slate-200/70 pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Hạng mục kiểm tra:</p>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {inter.keyItems.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Checklist Categories */}
                <div className="mt-8 rounded-2xl bg-amber-50/50 border border-amber-200/60 p-6">
                  <h5 className="text-sm font-bold uppercase tracking-wider text-[#836100] mb-4">
                    Danh mục kiểm tra tiêu chuẩn EV
                  </h5>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {m.checklist.map((c, idx) => (
                      <div key={idx} className="rounded-xl bg-white p-4 shadow-2xs border border-amber-100">
                        <p className="font-bold text-slate-900 text-sm mb-2">{c.category}</p>
                        <ul className="space-y-1 text-xs text-slate-600">
                          {c.items.map((item, idxx) => (
                            <li key={idxx}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: DỊCH VỤ SỬA CHỮA */}
        {activeTab === 'repair' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Dịch vụ sửa chữa & Phụ tùng chính hãng</h3>
              <p className="mt-1 text-sm text-slate-600">
                Đội ngũ kỹ sư và kỹ thuật viên chuyên trách xe điện, thiết bị công nghệ cao và phụ tùng chuẩn gốc.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {initialData.repairs.map((repair) => (
                <div
                  key={repair.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-7 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {repair.badge}
                  </span>
                  <h4 className="mt-4 text-xl font-bold text-slate-900">{repair.title}</h4>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{repair.description}</p>

                  <div className="mt-6 space-y-2 border-t border-slate-100 pt-5">
                    {repair.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                        <CheckCircle2 size={15} className="text-[#836100] shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openBookingWithConfig(repair.title)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#836100] hover:text-[#6c4f00] active:scale-95"
                    >
                      Đặt hẹn tư vấn <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: THÔNG TIN CỨU HỘ 24/7 */}
        {activeTab === 'rescue' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Dịch vụ cứu hộ khẩn cấp 24/7</h3>
              <p className="mt-1 text-sm text-slate-600">
                Hỗ trợ kịp thời khi xe gặp sự cố kỹ thuật, sự cố pin hoặc sự cố trên đường mọi lúc mọi nơi.
              </p>
            </div>

            {/* Emergency Hotline Banner */}
            <div className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10 border border-slate-800">
              <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-400 border border-red-500/30">
                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Hotline khẩn cấp 24/7
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Tổng đài hỗ trợ cứu hộ toàn quốc
                  </p>
                  <a
                    href="tel:1900232389"
                    className="mt-2 block text-4xl font-extrabold tracking-tight text-[#e6b32e] sm:text-5xl hover:underline"
                  >
                    1900 23 23 89
                  </a>
                  <p className="mt-2 text-xs text-slate-400">Miễn phí cuộc gọi cứu hộ • Trực ban 24/7/365</p>
                </div>
                <a
                  href="tel:1900232389"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#836100] px-8 py-4 text-base font-bold text-white shadow-xl transition hover:bg-[#6c4f00] active:scale-95"
                >
                  <PhoneCall size={20} />
                  Gọi cứu hộ ngay
                </a>
              </div>
            </div>

            {/* Coverage and Guidelines */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200/90 bg-white p-7 shadow-sm">
                <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BatteryCharging className="text-[#836100]" size={20} />
                  Phạm vi hỗ trợ cứu hộ
                </h4>
                <ul className="mt-5 space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>Cứu hộ sạc pin lưu động khẩn cấp khi xe cạn năng lượng giữa hành trình.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>Hỗ trợ sự cố lốp: vá lốp tại chỗ, thay lốp dự phòng, bơm hơi lưu động.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>Kéo xe về xưởng dịch vụ ủy quyền gần nhất an toàn bằng xe sàn trượt chuyên dụng.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>Kích nguồn bình phụ 12V và mở khóa cửa trong trường hợp khẩn cấp.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-200/90 bg-white p-7 shadow-sm">
                <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="text-[#836100]" size={20} />
                  Thông tin cần chuẩn bị khi gọi
                </h4>
                <ul className="mt-5 space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-[#836100] font-bold">1.</span>
                    <span>Vị trí hiện tại (km cột mốc, tên đường, định vị GPS hoặc điểm nhận diện lân cận).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#836100] font-bold">2.</span>
                    <span>Mẫu xe, biển số xe và số điện thoại liên lạc của tài xế.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#836100] font-bold">3.</span>
                    <span>Tình trạng sự cố (hết pin, thủng lốp, báo đèn cảnh báo trên màn hình hoặc va chạm).</span>
                  </li>
                </ul>
                <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 border border-slate-100">
                  * Miễn phí kéo xe trong thời hạn bảo hành cho các lỗi phát sinh do kỹ thuật xe.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: HƯỚNG DẪN SỬ DỤNG XE (Merged User Manual) */}
        {activeTab === 'manual' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Tra cứu tài liệu & Hướng dẫn sử dụng</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Cẩm nang kỹ thuật số hướng dẫn vận hành, tính năng thông minh và bảo dưỡng xe an toàn.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Tìm kiếm mẫu xe..."
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-[#836100] focus:outline-none"
                />
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {/* Quick Picker Widget */}
            <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white">
              <span className="text-xs font-bold uppercase tracking-widest text-[#e6b32e]">Tra cứu nhanh theo dòng xe</span>
              <h4 className="mt-2 text-xl sm:text-2xl font-bold text-white">Chọn mẫu xe & năm sản xuất</h4>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="relative">
                  <select
                    value={selectedManualModel}
                    onChange={(e) => {
                      setSelectedManualModel(e.target.value)
                      setSelectedManualYear('')
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Chọn mẫu xe --</option>
                    {manualSeriesList.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>

                <div className="relative">
                  <select
                    disabled={!selectedManualModel}
                    value={selectedManualYear}
                    onChange={(e) => setSelectedManualYear(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none disabled:opacity-50 cursor-pointer"
                  >
                    <option value="">-- Năm sản xuất --</option>
                    {selectedManualModel &&
                      manualModelGroups[selectedManualModel]?.years.map((yr) => (
                        <option key={yr} value={yr}>
                          Năm {yr}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>

                <button
                  type="button"
                  disabled={!selectedManualModel || !selectedManualYear}
                  onClick={() => handleManualNavigate(selectedManualModel, selectedManualYear)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#836100] px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] disabled:opacity-50 active:scale-95"
                >
                  <BookOpen size={16} /> Xem sổ tay hướng dẫn
                </button>
              </div>
            </div>

            {/* Model Manual Cards Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {manualSeriesList.map((group) => {
                const defaultYear = group.years[0] || '2024'
                return (
                  <div
                    key={group.name}
                    className="group flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div>
                      <div className="flex h-32 w-full items-center justify-center rounded-2xl bg-slate-50 p-4">
                        {group.thumbnail ? (
                          <img
                            src={group.thumbnail}
                            alt={group.name}
                            className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <Car size={48} className="text-slate-300" />
                        )}
                      </div>
                      <h4 className="mt-4 text-xl font-bold text-slate-900">{group.name}</h4>
                      <p className="mt-1 text-xs text-slate-500">Phân loại: {group.category}</p>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {group.years.map((yr) => (
                          <Link
                            key={yr}
                            href={`/user-manual/${encodeURIComponent(group.name)}_${encodeURIComponent(yr)}`}
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-[#836100] hover:bg-[#836100]/10 hover:text-[#836100]"
                          >
                            Phiên bản {yr}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <Link
                        href={`/user-manual/${encodeURIComponent(group.name)}_${encodeURIComponent(defaultYear)}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#836100] hover:underline"
                      >
                        Đọc sổ tay hướng dẫn <ExternalLink size={13} />
                      </Link>
                      <span className="text-[11px] text-slate-400">{group.years.length} phiên bản</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab 6: TRA CỨU XƯỞNG DỊCH VỤ */}
        {activeTab === 'workshop' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Mạng lưới Xưởng dịch vụ FASTLANE</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Hệ thống xưởng dịch vụ và trạm sạc ủy quyền đạt tiêu chuẩn quốc tế trên toàn quốc.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 focus:border-[#836100] focus:outline-none"
                >
                  <option value="all">Tất cả tỉnh thành</option>
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>

                <div className="relative w-full sm:w-60">
                  <input
                    type="text"
                    placeholder="Tìm theo tên/địa chỉ..."
                    value={workshopSearch}
                    onChange={(e) => setWorkshopSearch(e.target.value)}
                    className="w-full rounded-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-[#836100] focus:outline-none"
                  />
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Workshops Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredWorkshops.map((ws) => (
                <div
                  key={ws.id}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                        {ws.city}
                      </span>
                      <span className="text-xs font-medium text-slate-500">{ws.district}</span>
                    </div>

                    <h4 className="mt-3 text-lg font-bold text-slate-900">{ws.name}</h4>

                    <div className="mt-4 space-y-2 text-xs text-slate-600">
                      <p className="flex items-start gap-2">
                        <MapPin size={15} className="text-[#836100] shrink-0 mt-0.5" />
                        <span>{ws.address}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <PhoneCall size={15} className="text-[#836100] shrink-0" />
                        <a href={`tel:${ws.phone.replace(/\s/g, '')}`} className="font-semibold text-slate-800 hover:underline">
                          {ws.phone}
                        </a>
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock size={15} className="text-slate-400 shrink-0" />
                        <span>{ws.operatingHours}</span>
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-slate-100">
                      {ws.services.map((svc) => (
                        <span
                          key={svc}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                        >
                          {svc === 'car'
                            ? 'Ô tô điện'
                            : svc === 'motorbike'
                            ? 'Xe máy điện'
                            : svc === 'charging'
                            ? 'Trạm sạc nhanh'
                            : svc === 'body_paint'
                            ? 'Đồng sơn'
                            : 'Bảo dưỡng nhanh'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openBookingWithConfig('Bảo dưỡng định kỳ', ws.id)}
                      className="w-full rounded-full bg-slate-900 py-2.5 text-center text-xs font-bold text-white transition hover:bg-slate-800 active:scale-95"
                    >
                      Đặt hẹn tại xưởng này
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Booking Appointment Modal */}
      <ServiceBookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        workshops={initialData.workshops}
        onAddToast={addToast}
        initialServiceType={bookingInitialService}
        initialVehicleType={selectedVehicleType === 'all' ? 'car' : selectedVehicleType}
      />
    </div>
  )
}
