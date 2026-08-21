'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  PhoneCall,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { AfterSalesData } from '@/lib/api/after-sales-types'
import type { ManualModel } from '@/lib/api/manuals-server'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { AfterSalesHero } from './after-sales-hero'
import { CarWarrantyContent } from './car-warranty-content'
import { MaintenanceContent } from './maintenance-content'
import { MotorbikeWarrantyContent } from './motorbike-warranty-content'
import { RepairContent } from './repair-content'
import { RescueContent } from './rescue-content'
import { ServiceBookingModal } from './service-booking-modal'

interface AfterSalesClientProps {
  initialData: AfterSalesData
  manualModels: ManualModel[]
}

type SupportedVehicleType = 'car' | 'motorbike'

const VEHICLE_CATEGORIES: { type: SupportedVehicleType; label: string; icon: string }[] = [
  { type: 'car', label: 'Ô tô', icon: '/images/vf8.png' },
  { type: 'motorbike', label: 'Xe máy điện', icon: '/images/vento.png' },
]

const TABS = [
  { id: 'warranty', label: 'Chính sách bảo hành', icon: ShieldCheck },
  { id: 'maintenance', label: 'Dịch vụ bảo dưỡng', icon: Wrench },
  { id: 'repair', label: 'Dịch vụ sửa chữa', icon: Sparkles },
  { id: 'rescue', label: 'Thông tin cứu hộ 24/7', icon: PhoneCall, carOnly: true },
  { id: 'manual', label: 'Hướng dẫn sử dụng xe', icon: BookOpen },
  { id: 'workshop', label: 'Tra cứu xưởng dịch vụ', icon: MapPin },
]

const SECTION_NAV = {
  car: {
    warranty: [
      { id: 'warranty-scope', label: 'Phạm vi bảo hành' },
      { id: 'warranty-term', label: 'Thời hạn bảo hành Ô tô' },
      { id: 'limited-new-parts', label: 'Phụ tùng xe mới bảo hành giới hạn' },
      { id: 'replacement-parts', label: 'Bảo hành phụ tùng' },
      { id: 'accessory-warranty', label: 'Bảo hành phụ kiện' },
      { id: 'warranty-exclusions', label: 'Các hạng mục không bảo hành' },
      { id: 'warranty-faq', label: 'Câu hỏi thường gặp' },
      { id: 'warranty-support', label: 'Thông tin hỗ trợ' },
    ],
    maintenance: [
      { id: 'maintenance-schedule', label: 'Lịch trình & Hạng mục bảo dưỡng' },
      { id: 'maintenance-benefits', label: 'Ưu điểm bảo dưỡng chính hãng' },
      { id: 'maintenance-process', label: 'Quy trình dịch vụ bảo dưỡng' },
      { id: 'maintenance-support', label: 'Thông tin hỗ trợ' },
    ],
    repair: [
      { id: 'repair-process', label: 'Quy trình dịch vụ sửa chữa' },
      { id: 'repair-types', label: 'Phân loại dịch vụ sửa chữa' },
      { id: 'repair-commitment', label: 'Cam kết thời gian sửa chữa' },
      { id: 'repair-parts', label: 'Phụ tùng chính hãng' },
      { id: 'repair-support', label: 'Thông tin hỗ trợ' },
    ],
    rescue: [
      { id: 'rescue-information', label: 'Thông tin cứu hộ 24/7' },
      { id: 'rescue-ecall', label: 'Hỗ trợ khẩn cấp eCall' },
      { id: 'rescue-guide', label: 'Hướng dẫn ứng phó khẩn cấp' },
      { id: 'rescue-support', label: 'Thông tin hỗ trợ' },
    ],
  },
  motorbike: {
    warranty: [
      { id: 'warranty-scope', label: 'Phạm vi bảo hành' },
      { id: 'warranty-term', label: 'Thời hạn bảo hành' },
      { id: 'limited-new-parts', label: 'Các chi tiết bảo hành giới hạn' },
      { id: 'replacement-parts', label: 'Bảo hành phụ tùng' },
      { id: 'warranty-exclusions', label: 'Các hạng mục không bảo hành' },
      { id: 'warranty-faq', label: 'Câu hỏi thường gặp' },
      { id: 'warranty-support', label: 'Thông tin hỗ trợ' },
    ],
    maintenance: [
      { id: 'maintenance-schedule', label: 'Danh mục bảo dưỡng' },
      { id: 'maintenance-benefits', label: 'Ưu điểm bảo dưỡng chính hãng' },
      { id: 'maintenance-support', label: 'Thông tin hỗ trợ' },
    ],
    repair: [
      { id: 'repair-types', label: 'Dịch vụ sửa chữa VinFast' },
      { id: 'repair-commitment', label: 'Cam kết thời gian sửa chữa' },
      { id: 'repair-support', label: 'Thông tin hỗ trợ' },
    ],
  },
} as const

export function AfterSalesClient({ initialData, manualModels }: AfterSalesClientProps) {
  const router = useRouter()
  const [selectedVehicleType, setSelectedVehicleType] = useState<SupportedVehicleType>('car')
  const [activeTab, setActiveTab] = useState('warranty')
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [bookingInitialService, setBookingInitialService] = useState('Bảo dưỡng định kỳ')
  const [bookingWorkshopId, setBookingWorkshopId] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [workshopSearch, setWorkshopSearch] = useState('')
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [selectedManualModel, setSelectedManualModel] = useState('')
  const [selectedManualYear, setSelectedManualYear] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    setToasts((previous) => [...previous, { ...toast, id: Date.now() + Math.random() }])
  }

  const openBookingWithConfig = (serviceType: string, workshopId = '') => {
    setBookingInitialService(serviceType)
    setBookingWorkshopId(workshopId)
    setBookingModalOpen(true)
  }

  const selectVehicleType = (vehicleType: SupportedVehicleType) => {
    setSelectedVehicleType(vehicleType)
    if (vehicleType === 'motorbike' && activeTab === 'rescue') {
      setActiveTab('warranty')
    }
  }

  const selectTab = (tabId: string, scrollToContent = false) => {
    setActiveTab(tabId)
    if (scrollToContent) {
      document.getElementById('after-sales-content')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const visibleTabs = TABS.filter((tab) => !tab.carOnly || selectedVehicleType === 'car')
  const filteredWarranties = initialData.warranties.filter((item) => item.vehicleType === selectedVehicleType)
  const filteredMaintenances = initialData.maintenances.filter((item) => item.vehicleType === selectedVehicleType)
  const currentSectionNav =
    (SECTION_NAV[selectedVehicleType] as Partial<Record<string, readonly { id: string; label: string }[]>>)[
      activeTab
    ] ?? []

  const cities = Array.from(new Set(initialData.workshops.map((workshop) => workshop.city)))
  const filteredWorkshops = initialData.workshops.filter((workshop) => {
    const matchesVehicle = workshop.services.includes(selectedVehicleType)
    const matchesCity = selectedCity === 'all' || workshop.city === selectedCity
    const normalizedSearch = workshopSearch.trim().toLowerCase()
    const matchesSearch =
      !normalizedSearch ||
      [workshop.name, workshop.address, workshop.district].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      )
    return matchesVehicle && matchesCity && matchesSearch
  })

  const manualModelGroups = manualModels.reduce(
    (groups, model) => {
      const series = model.model_series || model.name
      if (!groups[series]) {
        groups[series] = {
          name: series,
          category: model.category || 'Ô tô điện',
          thumbnail: model.thumbnail || '',
          years: [],
        }
      }
      if (model.year && !groups[series].years.includes(model.year)) {
        groups[series].years.push(model.year)
      }
      return groups
    },
    {} as Record<string, { name: string; category: string; thumbnail: string; years: string[] }>,
  )

  const manualSeriesList = Object.values(manualModelGroups).filter((group) => {
    const category = group.category.toLowerCase()
    const matchesVehicle =
      selectedVehicleType === 'motorbike'
        ? category.includes('xe máy')
        : !category.includes('xe máy') && !category.includes('xe buýt')
    return matchesVehicle && (!manualSearchQuery || group.name.toLowerCase().includes(manualSearchQuery.toLowerCase()))
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
      <ToastViewport
        toasts={toasts}
        onClose={(id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))}
      />

      <AfterSalesHero
        onOpenBooking={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
        onSelectTab={(tabId) => selectTab(tabId, true)}
      />

      <section id="after-sales-content" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-24">
            <div className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#836100]">Dịch vụ hậu mãi</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Thông tin dịch vụ</h2>
              </div>

              <div className="border-b border-slate-200 p-3">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Chọn loại xe
                </p>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                  {VEHICLE_CATEGORIES.map((category) => {
                    const isSelected = selectedVehicleType === category.type
                    return (
                      <button
                        key={category.type}
                        type="button"
                        onClick={() => selectVehicleType(category.type)}
                        className={`flex items-center gap-2 border px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.98] ${isSelected ? 'border-[#836100] bg-[#836100]/5 text-[#836100]' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <img src={category.icon} alt="" className="h-8 w-10 object-contain mix-blend-multiply" />
                        <span>{category.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <nav aria-label="Danh mục dịch vụ hậu mãi" className="p-3">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      className={`flex w-full items-center justify-between border-b border-slate-100 px-2 py-3 text-left text-sm transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#836100] active:scale-[0.99] ${isActive ? 'font-bold text-[#836100]' : 'text-slate-600 hover:text-[#836100]'}`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={15} />
                        {tab.label}
                      </span>
                      <ChevronRight size={14} className={isActive ? 'opacity-100' : 'opacity-40'} />
                    </button>
                  )
                })}
              </nav>

              {currentSectionNav.length > 0 && (
                <nav aria-label="Mục lục nội dung dịch vụ" className="border-t border-slate-200 p-3">
                  <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Nội dung trang
                  </p>
                  {currentSectionNav.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="block border-l border-slate-200 px-3 py-2 text-xs leading-5 text-slate-600 transition hover:border-[#836100] hover:bg-[#836100]/5 hover:text-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#836100] active:translate-x-0.5"
                    >
                      {section.label}
                    </a>
                  ))}
                </nav>
              )}

              <button
                type="button"
                onClick={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
                className="m-4 inline-flex w-[calc(100%-2rem)] items-center justify-center gap-2 bg-[#836100] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <Calendar size={14} /> Đặt lịch dịch vụ
              </button>
            </div>
          </aside>

          <main className="min-w-0">
            <div className="mb-8 border-b border-slate-200 pb-5 lg:hidden">
              <label
                htmlFor="after-sales-mobile-nav"
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Danh mục dịch vụ
              </label>
              <select
                id="after-sales-mobile-nav"
                value={activeTab}
                onChange={(event) => selectTab(event.target.value)}
                className="mt-2 w-full border border-slate-300 bg-white px-3 py-3 text-sm text-slate-800 focus:border-[#836100] focus:outline-none focus:ring-1 focus:ring-[#836100]"
              >
                {visibleTabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>

            {activeTab === 'warranty' && selectedVehicleType === 'car' && (
              <CarWarrantyContent
                warranties={filteredWarranties}
                onBookWarrantyCheck={() => openBookingWithConfig('Kiểm tra bảo hành')}
                onOpenManuals={() => selectTab('manual')}
                onOpenWorkshops={() => selectTab('workshop')}
              />
            )}
            {activeTab === 'warranty' && selectedVehicleType === 'motorbike' && (
              <MotorbikeWarrantyContent
                warranties={filteredWarranties}
                onBook={() => openBookingWithConfig('Kiểm tra bảo hành')}
                onOpenManuals={() => selectTab('manual')}
                onOpenWorkshops={() => selectTab('workshop')}
              />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceContent
                vehicleType={selectedVehicleType}
                items={filteredMaintenances}
                onBook={() => openBookingWithConfig('Bảo dưỡng định kỳ')}
                onOpenManuals={() => selectTab('manual')}
                onOpenWorkshops={() => selectTab('workshop')}
              />
            )}
            {activeTab === 'repair' && (
              <RepairContent
                vehicleType={selectedVehicleType}
                items={selectedVehicleType === 'car' ? initialData.repairs : []}
                onBook={openBookingWithConfig}
                onOpenManuals={() => selectTab('manual')}
                onOpenWorkshops={() => selectTab('workshop')}
              />
            )}
            {activeTab === 'rescue' && selectedVehicleType === 'car' && (
              <RescueContent
                items={initialData.rescues}
                onOpenManuals={() => selectTab('manual')}
                onOpenWorkshops={() => selectTab('workshop')}
              />
            )}

            {activeTab === 'manual' && (
              <div className="space-y-8 animate-in fade-in duration-200">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Tra cứu tài liệu & Hướng dẫn sử dụng</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Cẩm nang vận hành, tính năng và hướng dẫn an toàn theo đúng loại xe đang chọn.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Tìm kiếm mẫu xe..."
                      value={manualSearchQuery}
                      onChange={(event) => setManualSearchQuery(event.target.value)}
                      className="w-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-[#836100] focus:outline-none"
                    />
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="bg-slate-900 p-6 text-white sm:p-8">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#e6b32e]">
                    Tra cứu nhanh theo dòng xe
                  </span>
                  <h4 className="mt-2 text-xl font-bold text-white sm:text-2xl">Chọn mẫu xe & năm sản xuất</h4>
                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <label className="relative">
                      <span className="sr-only">Mẫu xe</span>
                      <select
                        value={selectedManualModel}
                        onChange={(event) => {
                          setSelectedManualModel(event.target.value)
                          setSelectedManualYear('')
                        }}
                        className="w-full appearance-none border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="">-- Chọn mẫu xe --</option>
                        {manualSeriesList.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                      />
                    </label>
                    <label className="relative">
                      <span className="sr-only">Năm sản xuất</span>
                      <select
                        disabled={!selectedManualModel}
                        value={selectedManualYear}
                        onChange={(event) => setSelectedManualYear(event.target.value)}
                        className="w-full appearance-none border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">-- Năm sản xuất --</option>
                        {selectedManualModel &&
                          manualModelGroups[selectedManualModel]?.years.map((year) => (
                            <option key={year} value={year}>
                              Năm {year}
                            </option>
                          ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!selectedManualModel || !selectedManualYear}
                      onClick={() => handleManualNavigate(selectedManualModel, selectedManualYear)}
                      className="inline-flex items-center justify-center gap-2 bg-[#836100] px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] disabled:opacity-50 active:scale-[0.98]"
                    >
                      <BookOpen size={16} /> Xem hướng dẫn
                    </button>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {manualSeriesList.map((group) => {
                    const defaultYear = group.years[0] || '2024'
                    return (
                      <div
                        key={group.name}
                        className="group flex flex-col justify-between border border-slate-200 bg-white p-6 transition hover:border-[#836100]"
                      >
                        <div>
                          <div className="flex h-32 items-center justify-center bg-slate-50 p-4">
                            {group.thumbnail ? (
                              <img
                                src={group.thumbnail}
                                alt={group.name}
                                className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <Car size={48} className="text-slate-300" />
                            )}
                          </div>
                          <h4 className="mt-4 text-xl font-bold text-slate-900">{group.name}</h4>
                          <p className="mt-1 text-xs text-slate-500">{group.category}</p>
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {group.years.map((year) => (
                              <Link
                                key={year}
                                href={`/user-manual/${encodeURIComponent(group.name)}_${encodeURIComponent(year)}`}
                                className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-[#836100] hover:text-[#836100] active:scale-[0.98]"
                              >
                                Phiên bản {year}
                              </Link>
                            ))}
                          </div>
                        </div>
                        <Link
                          href={`/user-manual/${encodeURIComponent(group.name)}_${encodeURIComponent(defaultYear)}`}
                          className="mt-6 inline-flex items-center gap-1 border-t border-slate-100 pt-4 text-xs font-bold text-[#836100] hover:underline"
                        >
                          Đọc sổ tay hướng dẫn <ExternalLink size={13} />
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'workshop' && (
              <div className="space-y-8 animate-in fade-in duration-200">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Mạng lưới xưởng dịch vụ FASTLANE</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Chỉ hiển thị địa điểm có dịch vụ phù hợp với loại xe đang chọn.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={selectedCity}
                      onChange={(event) => setSelectedCity(event.target.value)}
                      className="border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 focus:border-[#836100] focus:outline-none"
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
                        onChange={(event) => setWorkshopSearch(event.target.value)}
                        className="w-full border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-[#836100] focus:outline-none"
                      />
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {filteredWorkshops.map((workshop) => (
                    <div
                      key={workshop.id}
                      className="flex flex-col justify-between border border-slate-200 bg-white p-6 transition hover:border-[#836100]"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{workshop.city}</span>
                          <span className="text-xs text-slate-500">{workshop.district}</span>
                        </div>
                        <h4 className="mt-4 text-lg font-bold text-slate-900">{workshop.name}</h4>
                        <div className="mt-4 space-y-2 text-xs leading-5 text-slate-600">
                          <p className="flex items-start gap-2">
                            <MapPin size={15} className="mt-0.5 shrink-0 text-[#836100]" />
                            <span>{workshop.address}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <PhoneCall size={15} className="shrink-0 text-[#836100]" />
                            <a
                              href={`tel:${workshop.phone.replace(/\s/g, '')}`}
                              className="font-semibold text-slate-800 hover:underline"
                            >
                              {workshop.phone}
                            </a>
                          </p>
                          <p className="flex items-center gap-2">
                            <Clock size={15} className="shrink-0 text-slate-400" />
                            <span>{workshop.operatingHours}</span>
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                          {workshop.services.map((service) => (
                            <span
                              key={service}
                              className="bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                            >
                              {service === 'car'
                                ? 'Ô tô'
                                : service === 'motorbike'
                                  ? 'Xe máy điện'
                                  : service === 'charging'
                                    ? 'Trạm sạc'
                                    : service === 'body_paint'
                                      ? 'Đồng sơn'
                                      : 'Bảo dưỡng nhanh'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openBookingWithConfig('Bảo dưỡng định kỳ', workshop.id)}
                        className="mt-6 w-full bg-slate-900 py-3 text-center text-xs font-bold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                      >
                        Đặt hẹn tại xưởng này
                      </button>
                    </div>
                  ))}
                </div>
                {filteredWorkshops.length === 0 && (
                  <div className="border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
                    Chưa có địa điểm phù hợp với bộ lọc hiện tại.
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </section>

      <ServiceBookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        workshops={initialData.workshops}
        onAddToast={addToast}
        initialServiceType={bookingInitialService}
        initialVehicleType={selectedVehicleType}
      />
    </div>
  )
}
