'use client'

import { useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Headphones,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { MaintenanceServiceItem } from '@/lib/api/after-sales-types'

interface MaintenanceContentProps {
  vehicleType: 'car' | 'motorbike'
  items: MaintenanceServiceItem[]
  onBook: () => void
  onOpenManuals: () => void
  onOpenWorkshops: () => void
}

const CAR_MODELS = [
  'VF 3',
  'VF e34',
  'VF 5',
  'VF 6',
  'VF 7',
  'VF 8',
  'VF 9',
  'VF MPV 7',
  'Lạc Hồng 900 LX',
  'Fadil',
  'Lux A2.0',
  'Lux SA2.0',
  'President',
  'Minio Green',
  'Herio Green',
  'Nerio Green',
  'EC Van',
  'Limo Green',
]

const MOTORBIKE_MODELS = [
  'Theon',
  'Theon S',
  'Vento',
  'Vento S',
  'Vento Neo',
  'Klara A1',
  'Klara A2',
  'Klara Neo',
  'Klara S',
  'Feliz',
  'Feliz Neo',
  'Feliz S',
  'Impes',
  'Ludo',
  'Tempest',
  'Motio',
  'Evo 200',
  'Evo Neo',
  'Evo Lite Neo',
]

const BIKE_PERIODIC_CHECKS = [
  'Kiểm tra tổng thể hệ thống điện.',
  'Kiểm tra dung lượng và khả năng sạc – xả của pin hoặc ắc quy.',
  'Kiểm tra bộ điều khiển, tay ga và các công tắc.',
  'Kiểm tra phanh trước – sau và hệ thống giảm xóc.',
  'Kiểm tra tình trạng lốp và áp suất lốp.',
  'Vệ sinh xe và các bộ phận quan trọng.',
]

const BENEFITS = [
  {
    title: 'Quy trình chính hãng',
    text: 'Quy trình bảo dưỡng đồng bộ giúp xe vận hành an toàn và duy trì giá trị lâu dài.',
  },
  { title: 'Kỹ thuật viên chuyên môn', text: 'Đội ngũ được đào tạo theo tiêu chuẩn kỹ thuật dành cho từng dòng xe.' },
  { title: 'Chi phí minh bạch', text: 'Hạng mục được kiểm tra, tư vấn và xác nhận trước khi thực hiện.' },
  {
    title: 'Phụ tùng tương thích',
    text: 'Sử dụng phụ tùng chính hãng để bảo đảm độ tương thích và điều kiện bảo hành.',
  },
]

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Nhắc bảo dưỡng & Đặt hẹn',
    text: 'Nhận thông báo đến kỳ và chủ động chọn thời gian, địa điểm phù hợp.',
  },
  {
    number: '02',
    title: 'Tiếp nhận và tư vấn',
    text: 'Kiểm tra tình trạng ban đầu, xác nhận yêu cầu và hạng mục dự kiến.',
  },
  { number: '03', title: 'Bảo dưỡng', text: 'Kỹ thuật viên thực hiện theo checklist và lịch trình của dòng xe.' },
  { number: '04', title: 'Bàn giao xe', text: 'Giải thích kết quả, công việc đã thực hiện và khuyến nghị tiếp theo.' },
  {
    number: '05',
    title: 'Chăm sóc sau bảo dưỡng',
    text: 'Theo dõi chất lượng dịch vụ và tiếp nhận phản hồi sau bàn giao.',
  },
]

function Heading({ index, title, description }: { index: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">{index}</p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h3>
      {description && <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>}
    </div>
  )
}

export function MaintenanceContent({
  vehicleType,
  items,
  onBook,
  onOpenManuals,
  onOpenWorkshops,
}: MaintenanceContentProps) {
  const [selectedId, setSelectedId] = useState('')
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const isCar = vehicleType === 'car'
  const models = isCar ? CAR_MODELS : MOTORBIKE_MODELS

  return (
    <article className="space-y-14 animate-in fade-in duration-200 sm:space-y-16">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">{isCar ? 'Ô tô' : 'Xe máy điện'}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Dịch vụ bảo dưỡng</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Bảo dưỡng định kỳ giúp phát hiện sớm hư hỏng, duy trì trạng thái vận hành ổn định và là điều kiện quan trọng
          để bảo đảm quyền lợi bảo hành.
        </p>
        <button
          type="button"
          onClick={onBook}
          className="mt-6 inline-flex items-center justify-center gap-2 bg-[#836100] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <Calendar size={15} /> Đặt lịch bảo dưỡng
        </button>
      </header>

      <section id="maintenance-schedule" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading
          index="01"
          title={isCar ? 'Lịch trình & Hạng mục bảo dưỡng' : 'Danh mục bảo dưỡng'}
          description="Chọn lịch trình phù hợp và đối chiếu mốc quãng đường hoặc thời gian, tùy điều kiện nào đến trước."
        />

        <div className="border border-slate-200 bg-white p-5 sm:p-6">
          <div className="grid gap-5 border-b border-slate-200 pb-5 md:grid-cols-[1fr_320px] md:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Dòng xe thuộc danh mục chính thức</p>
              <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {models.map((model) => (
                  <span key={model} className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                    {model}
                  </span>
                ))}
              </div>
            </div>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Lịch trình đã publish
              </span>
              <select
                value={selected?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800 focus:border-[#836100] focus:outline-none focus:ring-1 focus:ring-[#836100]"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected && (
            <>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-4 py-4 font-semibold">Mốc bảo dưỡng</th>
                      <th className="px-4 py-4 font-semibold">Thời gian</th>
                      <th className="px-4 py-4 font-semibold">Cấp độ</th>
                      <th className="px-4 py-4 font-semibold">Hạng mục chính</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.intervals.map((interval) => (
                      <tr
                        key={`${selected.id}-${interval.mileageKm}-${interval.months}`}
                        className="align-top hover:bg-[#836100]/[0.04]"
                      >
                        <td className="border-t border-slate-200 px-4 py-4 font-semibold text-[#836100]">
                          {interval.mileageKm.toLocaleString()} km
                        </td>
                        <td className="border-t border-slate-200 px-4 py-4 text-slate-700">
                          {interval.months ? `${interval.months} tháng` : 'Theo khuyến nghị'}
                        </td>
                        <td className="border-t border-slate-200 px-4 py-4 font-semibold text-slate-900">
                          {interval.level}
                        </td>
                        <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-600">
                          {interval.keyItems.join(' • ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2">
                {(isCar
                  ? selected.checklist.flatMap((group) => group.items.map((item) => `${group.category}: ${item}`))
                  : BIKE_PERIODIC_CHECKS
                ).map((item) => (
                  <div key={item} className="flex gap-3 bg-white p-4 text-sm leading-6 text-slate-700">
                    <CheckCircle2 size={16} className="mt-1 shrink-0 text-[#836100]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section id="maintenance-benefits" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading index="02" title="Ưu điểm bảo dưỡng chính hãng" />
        <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="bg-white p-6">
              <ShieldCheck size={21} className="text-[#836100]" />
              <h4 className="mt-4 font-semibold text-slate-900">{benefit.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.text}</p>
            </div>
          ))}
        </div>
      </section>

      {isCar && (
        <section id="maintenance-process" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
          <Heading
            index="03"
            title="Quy trình dịch vụ bảo dưỡng"
            description="Quy trình 5 bước từ đặt hẹn đến chăm sóc sau dịch vụ."
          />
          <div className="grid gap-4 md:grid-cols-5">
            {PROCESS_STEPS.map((step) => (
              <div key={step.number} className="border border-slate-200 bg-white p-5">
                <span className="text-xl font-semibold text-[#836100]">{step.number}</span>
                <h4 className="mt-4 text-sm font-semibold text-slate-900">{step.title}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="maintenance-support" className="scroll-mt-28">
        <Heading index={isCar ? '04' : '03'} title="Thông tin hỗ trợ" />
        <div className="grid gap-4 md:grid-cols-3">
          <a
            href="tel:1900232389"
            className="group border border-slate-200 bg-white p-6 transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <Headphones size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Dịch vụ khách hàng</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-[#836100]">
              1900 23 23 89 · Nhánh 1
            </p>
          </a>
          <button
            type="button"
            onClick={onOpenWorkshops}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <MapPin size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Xưởng dịch vụ</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tìm xưởng gần nhất <ChevronRight size={14} />
            </p>
          </button>
          <button
            type="button"
            onClick={onOpenManuals}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <FileText size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tài liệu liên quan</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tra cứu hướng dẫn <ExternalLink size={14} />
            </p>
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-4 bg-slate-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {selected?.mobileServiceAvailable ? (
              <Sparkles className="mt-0.5 text-[#e6b32e]" size={20} />
            ) : (
              <Clock className="mt-0.5 text-[#e6b32e]" size={20} />
            )}
            <div>
              <p className="font-semibold">Chủ động đặt hẹn để giảm thời gian chờ</p>
              <p className="mt-1 text-sm text-slate-300">
                Xưởng sẽ tiếp nhận thông tin xe và chuẩn bị hạng mục trước khi bạn đến.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBook}
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#836100] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] active:scale-[0.98]"
          >
            <Wrench size={14} /> Đặt lịch bảo dưỡng
          </button>
        </div>
        <a
          href={
            isCar
              ? 'https://vinfastauto.com/vn_vi/dich-vu-bao-duong-oto'
              : 'https://vinfastauto.com/vn_vi/dich-vu-bao-duong-xe-may'
          }
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#836100]"
        >
          Nguồn dịch vụ tham chiếu: website VinFast Việt Nam <ExternalLink size={13} />
        </a>
      </section>
    </article>
  )
}
