'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BatteryCharging,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileText,
  Headphones,
  MapPin,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import type { WarrantyFactItem } from '@/lib/api/after-sales-types'

interface MotorbikeWarrantyContentProps {
  warranties: WarrantyFactItem[]
  onBook: () => void
  onOpenManuals: () => void
  onOpenWorkshops: () => void
}

const SCOPE = [
  'Hư hỏng do lỗi phần mềm, chất lượng linh kiện hoặc lỗi lắp ráp khi xe được sử dụng và bảo dưỡng đúng cách.',
  'Phụ tùng thay thế trong bảo hành là chi tiết chính hãng nhỏ nhất do hệ thống dịch vụ cung cấp.',
  'Bảo hành có hiệu lực toàn quốc tại xưởng dịch vụ và nhà phân phối ủy quyền.',
  'Công việc thuộc phạm vi chính sách được thực hiện miễn phí theo điều khoản áp dụng.',
]

const EXCLUSIONS = [
  'Sửa chữa, điều chỉnh, đấu nối phụ kiện không chính hãng hoặc tự ý thay đổi thiết kế.',
  'Sử dụng sai chức năng, đua xe, chở quá tải hoặc bảo quản không theo hướng dẫn.',
  'Không tuân thủ lịch bảo dưỡng hoặc sửa chữa không đúng tiêu chuẩn của nhà sản xuất.',
  'Sử dụng phụ tùng, dầu mỡ, dung dịch hoặc chất phụ gia không chính hãng.',
  'Tai nạn, ngập nước, ngoại vật, hỏa hoạn, thiên tai hoặc tác động của động vật.',
  'Chai pin tự nhiên hoặc suy giảm dung lượng theo thời gian và điều kiện sử dụng.',
  'Pin hoặc ắc quy hư hỏng do nhiệt độ cao, thiết bị tiêu thụ điện ngoài hoặc bảo quản sai.',
  'Các chi tiết hao mòn như má phanh, đĩa phanh, lốp, xích, ổ bi, chi tiết cao su và cầu chì.',
  'Làm mất trạng thái nguyên bản khiến không thể xác định nguồn gốc phụ tùng.',
  'Chậm thông báo hoặc chậm đưa xe tới xưởng sau khi phát hiện hư hỏng.',
]

const FAQS = [
  {
    question: 'Chính sách mới có áp dụng cho xe đã mua trước đó không?',
    answer:
      'Xe áp dụng chính sách có hiệu lực tại thời điểm mua. Chính sách mới được áp dụng cho xe mua từ ngày chính sách đó có hiệu lực.',
  },
  {
    question: 'Pin chai có được bảo hành không?',
    answer:
      'Chai pin tự nhiên là hao mòn phụ thuộc cách sạc, số chu kỳ và nhiệt độ. Trường hợp cụ thể được đối chiếu với điều kiện dung lượng và sổ bảo hành của dòng xe.',
  },
  {
    question: 'Phụ tùng mua chính hãng nhưng lắp tại xưởng ngoài có được bảo hành không?',
    answer:
      'Phụ tùng cần được lắp đặt tại xưởng dịch vụ hoặc nhà phân phối ủy quyền và có hồ sơ mua, sửa chữa phù hợp.',
  },
  {
    question: 'Xe ngập nước có được bảo hành không?',
    answer:
      'Hư hỏng do ngập nước hoặc yếu tố nằm ngoài kiểm soát của nhà sản xuất không thuộc phạm vi bảo hành tiêu chuẩn.',
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

export function MotorbikeWarrantyContent({
  warranties,
  onBook,
  onOpenManuals,
  onOpenWorkshops,
}: MotorbikeWarrantyContentProps) {
  const [openFaq, setOpenFaq] = useState(0)

  return (
    <article className="space-y-14 animate-in fade-in duration-200 sm:space-y-16">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">Xe máy điện</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Chính sách bảo hành</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Thông tin bảo hành dành cho xe máy điện, pin trang bị theo xe, ắc quy và phụ tùng thay thế chính hãng.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBook}
            className="inline-flex items-center justify-center gap-2 bg-[#836100] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] active:scale-[0.98]"
          >
            <Calendar size={15} /> Đặt lịch kiểm tra
          </button>
          <button
            type="button"
            onClick={onOpenManuals}
            className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:border-[#836100] hover:text-[#836100] active:scale-[0.98]"
          >
            <FileText size={15} /> Hướng dẫn sử dụng
          </button>
        </div>
      </header>

      <section id="warranty-scope" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading index="01" title="Phạm vi bảo hành" />
        <div className="grid gap-3 sm:grid-cols-2">
          {SCOPE.map((item) => (
            <div key={item} className="flex gap-3 border border-slate-200 bg-white p-5">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#836100]" />
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="warranty-term" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading
          index="02"
          title="Thời hạn bảo hành"
          description="Thời hạn thay đổi theo công nghệ pin và điều kiện kích hoạt bảo hành của xe."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {warranties.map((item) => (
            <div key={item.id} className="border border-slate-200 bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.modelSeries}</p>
              <p className="mt-3 text-xl font-semibold text-[#836100]">{item.warrantyTerm}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Bảo hành pin: {item.batteryWarrantyTerm}</p>
              {item.conditions.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {item.conditions.map((condition) => (
                    <li key={condition} className="flex gap-2 text-sm leading-6 text-slate-600">
                      <ChevronRight size={14} className="mt-1 shrink-0 text-[#836100]" />
                      {condition}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Xe dùng pin LFP</p>
            <p className="mt-2 font-semibold text-slate-900">Xe 6 năm · Pin tới 8 năm</p>
            <p className="mt-1 text-xs text-slate-500">Không giới hạn quãng đường theo điều kiện chính sách.</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Các dòng xe còn lại</p>
            <p className="mt-2 font-semibold text-slate-900">3 năm</p>
            <p className="mt-1 text-xs text-slate-500">Không giới hạn quãng đường.</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs font-bold uppercase text-slate-500">Pin LFP đổi pin</p>
            <p className="mt-2 font-semibold text-slate-900">8 năm</p>
            <p className="mt-1 text-xs text-slate-500">Không giới hạn quãng đường.</p>
          </div>
        </div>
      </section>

      <section id="limited-new-parts" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading index="03" title="Các chi tiết bảo hành giới hạn" />
        <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-3">
          <div className="bg-white p-6">
            <BatteryCharging size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Pin LFP theo xe mới</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              8 năm từ ngày kích hoạt bảo hành, không giới hạn quãng đường.
            </p>
          </div>
          <div className="bg-white p-6">
            <BatteryCharging size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Pin không phải LFP</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              3 năm từ ngày kích hoạt bảo hành, không giới hạn quãng đường.
            </p>
          </div>
          <div className="bg-white p-6">
            <CircleDot size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Ắc quy 12V</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              1 năm từ ngày kích hoạt bảo hành, không giới hạn quãng đường.
            </p>
          </div>
        </div>
      </section>

      <section id="replacement-parts" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading
          index="04"
          title="Bảo hành phụ tùng"
          description="Áp dụng cho phụ tùng chính hãng do khách hàng thanh toán và được thay tại hệ thống dịch vụ ủy quyền."
        />
        <div className="overflow-hidden border border-slate-200 bg-white">
          {[
            ['Phụ tùng thông thường', '1 năm, không giới hạn quãng đường.'],
            ['Pin LFP', '8 năm, không giới hạn quãng đường.'],
            ['Pin khác', '3 năm, không giới hạn quãng đường.'],
            ['Ắc quy 12V', '1 năm, không giới hạn quãng đường.'],
          ].map(([name, term]) => (
            <div key={name} className="grid border-b border-slate-200 last:border-b-0 sm:grid-cols-[220px_1fr]">
              <p className="bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-900">{name}</p>
              <p className="px-5 py-4 text-sm text-slate-600">{term}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="warranty-exclusions" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading index="05" title="Các hạng mục không thuộc phạm vi bảo hành" />
        <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2">
          {EXCLUSIONS.map((item, index) => (
            <div key={item} className="flex gap-3 bg-white p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-amber-50 text-xs font-bold text-[#836100]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-3 border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <p className="text-sm leading-6 text-amber-900">
            Sổ bảo hành đi kèm xe là tài liệu quyết định đối với điều kiện và ngoại lệ cụ thể.
          </p>
        </div>
      </section>

      <section id="warranty-faq" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <Heading index="06" title="Câu hỏi thường gặp" />
        <div className="border-t border-slate-200">
          {FAQS.map((faq, index) => {
            const isOpen = openFaq === index
            return (
              <div key={faq.question} className="border-b border-slate-200">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-5 py-5 text-left font-semibold text-slate-900 transition hover:text-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#836100] active:bg-[#836100]/5"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    size={19}
                    className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#836100]' : 'text-slate-400'}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-3xl pb-5 text-sm leading-7 text-slate-600">{faq.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </section>

      <section id="warranty-support" className="scroll-mt-28">
        <Heading index="07" title="Thông tin hỗ trợ" />
        <div className="grid gap-4 md:grid-cols-3">
          <a
            href="tel:1900232389"
            className="group border border-slate-200 bg-white p-6 transition hover:border-[#836100]"
          >
            <Headphones size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Dịch vụ khách hàng</p>
            <p className="mt-2 font-semibold text-slate-900 group-hover:text-[#836100]">1900 23 23 89 · Nhánh 1</p>
          </a>
          <button
            type="button"
            onClick={onOpenWorkshops}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100]"
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
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100]"
          >
            <FileText size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tài liệu liên quan</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tra cứu hướng dẫn <ExternalLink size={14} />
            </p>
          </button>
        </div>
        <button
          type="button"
          onClick={onBook}
          className="mt-5 inline-flex items-center justify-center gap-2 bg-slate-900 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Wrench size={14} /> Đặt lịch kiểm tra
        </button>
        <a
          href="https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-xe-may"
          target="_blank"
          rel="noreferrer"
          className="mt-6 block text-xs font-semibold text-slate-500 transition hover:text-[#836100]"
        >
          Nguồn chính sách tham chiếu: website VinFast Việt Nam <ExternalLink size={13} className="ml-1 inline" />
        </a>
      </section>
    </article>
  )
}
