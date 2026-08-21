'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BatteryCharging,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileText,
  Headphones,
  MapPin,
  Paintbrush,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import type { WarrantyFactItem } from '@/lib/api/after-sales-types'

interface CarWarrantyContentProps {
  warranties: WarrantyFactItem[]
  onBookWarrantyCheck: () => void
  onOpenManuals: () => void
  onOpenWorkshops: () => void
}

const WARRANTY_SCOPE = [
  'Áp dụng cho hư hỏng do lỗi phần mềm, chất lượng linh kiện hoặc lỗi lắp ráp khi xe được sử dụng và bảo dưỡng đúng hướng dẫn.',
  'Phụ tùng thay thế trong bảo hành là chi tiết hoặc linh kiện chính hãng nhỏ nhất do hệ thống dịch vụ cung cấp.',
  'Bảo hành có hiệu lực trên toàn lãnh thổ Việt Nam và được thực hiện tại xưởng dịch vụ hoặc nhà phân phối ủy quyền.',
  'Công việc thuộc phạm vi bảo hành được thực hiện miễn phí theo điều khoản và điều kiện áp dụng.',
]

const LIMITED_PARTS = [
  {
    title: 'Pin cao áp',
    icon: BatteryCharging,
    summary: 'Thời hạn phụ thuộc dòng xe, điều kiện sử dụng tiêu chuẩn hoặc mục đích dịch vụ thương mại.',
    details: [
      'VF 8, VF 9 và Lạc Hồng 900 LX: 10 năm hoặc 200.000 km.',
      'Nhóm VF 3, VF 5, VF 6, VF 7, VF e34 và các dòng Green tương ứng: 8 năm hoặc 160.000 km.',
      'VF EC Van: 7 năm hoặc 160.000 km.',
      'Xe thuộc nhóm dịch vụ thương mại được áp dụng điều kiện riêng theo chính sách hiện hành.',
    ],
  },
  {
    title: 'Ắc quy 12V',
    icon: CircleDot,
    summary: 'Áp dụng giới hạn riêng cho ắc quy trang bị theo xe mới.',
    details: [
      'Ô tô xăng: 1 năm hoặc 20.000 km, tùy điều kiện nào đến trước.',
      'Ô tô điện: 1 năm, không giới hạn quãng đường sử dụng.',
    ],
  },
  {
    title: 'Gỉ sét',
    icon: ShieldCheck,
    summary: 'Bảo hành tấm kim loại bị xuyên thủng do lỗi vật liệu hoặc lắp ráp trong điều kiện vận hành bình thường.',
    details: [
      'Thời hạn tiêu chuẩn thay đổi theo nhóm xe: 10 năm, 7 năm hoặc 5 năm và không giới hạn số km.',
      'Xe dùng cho dịch vụ thương mại áp dụng điều kiện riêng theo dòng xe.',
    ],
  },
  {
    title: 'Sơn ngoại thất',
    icon: Paintbrush,
    summary: 'Áp dụng giới hạn theo nhóm xe và mục đích sử dụng.',
    details: [
      'Điều kiện tiêu chuẩn: thời hạn tương ứng 10 năm, 7 năm hoặc 5 năm theo dòng xe.',
      'Điều kiện dịch vụ thương mại: áp dụng thời hạn riêng cho các dòng xe được quy định.',
    ],
  },
  {
    title: 'Các bộ phận treo',
    icon: Wrench,
    summary: 'Bao gồm giảm xóc, thanh ổn định, tay đòn, khớp bi và các liên kết liên quan.',
    details: [
      'Sử dụng tiêu chuẩn: 5 năm hoặc 130.000 km.',
      'Sử dụng dịch vụ thương mại: 3 năm hoặc 100.000 km với các dòng xe được quy định.',
    ],
  },
  {
    title: 'Lốp xe',
    icon: CircleDot,
    summary: 'Lốp theo xe được xử lý theo chính sách riêng của nhà sản xuất lốp và điều kiện thị trường.',
    details: [
      'Ô tô xăng: 5 năm, không giới hạn quãng đường sử dụng.',
      'Ô tô điện: áp dụng chính sách bảo hành của nhà sản xuất lốp.',
      'Hao mòn tự nhiên, sử dụng sai mục đích hoặc hư hỏng do ngoại lực không thuộc phạm vi bảo hành.',
    ],
  },
]

const EXCLUSIONS = [
  'Sửa chữa, điều chỉnh, đấu nối phụ kiện không chính hãng hoặc tự ý thay đổi thiết kế ban đầu.',
  'Sử dụng sai chức năng, lạm dụng xe, đua xe, chở quá tải hoặc vận hành không theo hướng dẫn.',
  'Hao mòn tự nhiên, lão hóa vật liệu, bạc màu sơn hoặc các hiện tượng không ảnh hưởng tới khả năng vận hành.',
  'Hỏa hoạn, thiên tai, động vật, tai nạn, ngập nước hoặc ngoại vật tác động trong quá trình vận hành.',
  'Hư hỏng bề mặt do hóa chất, muối, nhựa cây, phân động vật, mưa axit hoặc tác nhân môi trường tương tự.',
  'Các chi tiết hao mòn và vật tư bảo dưỡng định kỳ như má phanh, gạt mưa, dầu, mỡ, dung dịch và bộ lọc.',
  'Không tuân thủ lịch bảo dưỡng định kỳ hoặc sửa chữa không đúng hướng dẫn của nhà sản xuất.',
  'Dịch vụ làm sạch, kiểm tra, điều chỉnh và các hạng mục bảo dưỡng định kỳ.',
  'Thay đổi chỉ số công-tơ-mét hoặc làm mất trạng thái nguyên bản khiến không thể xác định nguồn gốc phụ tùng.',
  'Hư hỏng kéo theo do chậm đưa xe tới xưởng kiểm tra sau khi đã phát hiện dấu hiệu bất thường.',
  'Hư hỏng phát sinh trong thời hạn bảo hành nhưng được báo cáo sau khi bảo hành hết hiệu lực.',
  'Các tổn thất gián tiếp như chi phí đi lại, ăn ở, thuê phương tiện, mất thời gian hoặc thiệt hại kinh doanh.',
]

const FAQS = [
  {
    question: 'Chính sách mới có áp dụng cho xe đã mua trước đó không?',
    answer:
      'Xe áp dụng chính sách có hiệu lực tại thời điểm mua. Chính sách mới được áp dụng cho xe mua kể từ ngày chính sách đó có hiệu lực.',
  },
  {
    question: 'Pin chai tự nhiên có được bảo hành không?',
    answer:
      'Suy giảm dung lượng tự nhiên phụ thuộc cách sạc, số chu kỳ sử dụng và nhiệt độ môi trường nên không mặc nhiên được xem là lỗi bảo hành. Mức dung lượng bảo hành cụ thể được đối chiếu theo điều kiện của từng dòng xe.',
  },
  {
    question: 'Phụ tùng mua chính hãng nhưng lắp ở xưởng ngoài có được bảo hành không?',
    answer:
      'Phụ tùng cần được thay thế tại xưởng dịch vụ hoặc nhà phân phối ủy quyền và phải có hồ sơ sửa chữa, quyết toán hoặc hóa đơn phù hợp để được áp dụng chính sách.',
  },
  {
    question: 'Xe bị ngập nước có thuộc phạm vi bảo hành không?',
    answer:
      'Hư hỏng do ngập nước, thiên tai hoặc các yếu tố nằm ngoài kiểm soát của nhà sản xuất không thuộc phạm vi bảo hành tiêu chuẩn.',
  },
]

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">{eyebrow}</p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h3>
      {description && <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>}
    </div>
  )
}

export function CarWarrantyContent({
  warranties,
  onBookWarrantyCheck,
  onOpenManuals,
  onOpenWorkshops,
}: CarWarrantyContentProps) {
  const [openFaq, setOpenFaq] = useState<number>(0)

  return (
    <article className="space-y-14 animate-in fade-in duration-200 sm:space-y-16">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">Ô tô</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Chính sách bảo hành</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Chính sách bảo hành dài hạn giúp bảo vệ quyền lợi chủ xe và duy trì sự an tâm trong suốt quá trình sử dụng.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBookWarrantyCheck}
            className="inline-flex items-center justify-center gap-2 bg-[#836100] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Calendar size={15} /> Đặt lịch kiểm tra
          </button>
          <button
            type="button"
            onClick={onOpenManuals}
            className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:border-[#836100] hover:text-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <FileText size={15} /> Hướng dẫn sử dụng ô tô
          </button>
        </div>
      </header>

      <section id="warranty-scope" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading eyebrow="01" title="Phạm vi bảo hành" />
        <div className="grid gap-3 sm:grid-cols-2">
          {WARRANTY_SCOPE.map((item) => (
            <div key={item} className="flex gap-3 border border-slate-200 bg-white p-5">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#836100]" size={19} />
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 border-l-2 border-[#836100] bg-[#836100]/5 px-5 py-4 text-sm leading-6 text-slate-700">
          Khi việc sửa chữa có thể khắc phục lỗi chất lượng, vật liệu hoặc lắp ráp, chính sách không mặc nhiên bao gồm
          việc thu hồi và đổi sang một xe khác.
        </p>
      </section>

      <section id="warranty-term" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading
          eyebrow="02"
          title="Thời hạn bảo hành Ô tô"
          description="Sổ bảo hành được quản lý điện tử. Thời hạn áp dụng theo điều kiện thời gian hoặc quãng đường đến trước và theo mục đích sử dụng của xe."
        />

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-5 py-4 font-semibold">Nhóm dòng xe</th>
                <th className="px-5 py-4 font-semibold">Mẫu xe áp dụng</th>
                <th className="px-5 py-4 font-semibold">Thời hạn xe</th>
                <th className="px-5 py-4 font-semibold">Thời hạn pin</th>
              </tr>
            </thead>
            <tbody>
              {warranties.map((item) => (
                <tr key={item.id} className="align-top transition hover:bg-[#836100]/[0.04]">
                  <td className="border-t border-slate-200 px-5 py-4 font-semibold text-slate-900">
                    {item.modelSeries}
                  </td>
                  <td className="border-t border-slate-200 px-5 py-4 leading-6 text-slate-600">
                    {item.models.join(', ')}
                  </td>
                  <td className="border-t border-slate-200 px-5 py-4 font-semibold text-[#836100]">
                    {item.warrantyTerm}
                  </td>
                  <td className="border-t border-slate-200 px-5 py-4 text-slate-700">{item.batteryWarrantyTerm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {warranties.some((item) => item.commercialWarranty) && (
          <div className="mt-5 border border-slate-200 bg-slate-50 p-5">
            <h4 className="font-semibold text-slate-900">Xe đang hoặc từng sử dụng cho dịch vụ thương mại</h4>
            <div className="mt-3 space-y-2">
              {warranties
                .filter((item) => item.commercialWarranty)
                .map((item) => (
                  <p key={`commercial-${item.id}`} className="text-sm leading-6 text-slate-600">
                    <strong className="text-slate-800">{item.modelSeries}:</strong> {item.commercialWarranty}
                  </p>
                ))}
            </div>
          </div>
        )}
      </section>

      <section id="limited-new-parts" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading
          eyebrow="03"
          title="Phụ tùng xe mới bảo hành giới hạn"
          description="Các bộ phận dưới đây có thời hạn và điều kiện riêng, tách biệt với thời hạn bảo hành tổng thể của xe."
        />
        <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-2">
          {LIMITED_PARTS.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="bg-white p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center bg-[#836100]/10 text-[#836100]">
                    <Icon size={20} />
                  </span>
                  <h4 className="text-lg font-semibold text-slate-900">{item.title}</h4>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{item.summary}</p>
                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {item.details.map((detail) => (
                    <li key={detail} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <ChevronRight className="mt-1 shrink-0 text-[#836100]" size={14} />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      <section id="replacement-parts" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading
          eyebrow="04"
          title="Bảo hành phụ tùng"
          description="Áp dụng cho phụ tùng thay thế chính hãng do khách hàng thanh toán và được lắp đặt tại hệ thống dịch vụ ủy quyền."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border border-slate-200 bg-white p-6">
            <Wrench size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Phụ tùng thông thường</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ô tô xăng: 12 tháng hoặc 20.000 km. Ô tô điện: 2 năm hoặc 40.000 km.
            </p>
          </div>
          <div className="border border-slate-200 bg-white p-6">
            <BatteryCharging size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Pin cao áp mua thay thế</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              4 năm hoặc 80.000 km kể từ ngày mua, tùy điều kiện nào đến trước.
            </p>
          </div>
          <div className="border border-slate-200 bg-white p-6">
            <CircleDot size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">Ắc quy 12V</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ô tô xăng: 1 năm hoặc 20.000 km. Ô tô điện: 1 năm, không giới hạn km.
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">
          Khách hàng cần lưu giữ lệnh sửa chữa, quyết toán và hóa đơn. Phụ tùng mua nhưng không được thay tại xưởng hoặc
          nhà phân phối ủy quyền có thể không đủ điều kiện áp dụng chính sách.
        </p>
      </section>

      <section id="accessory-warranty" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading eyebrow="05" title="Bảo hành phụ kiện" />
        <div className="overflow-hidden border border-slate-200 bg-white">
          <div className="grid border-b border-slate-200 sm:grid-cols-[240px_1fr]">
            <p className="bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-900">
              Phụ kiện chính hãng thông thường
            </p>
            <p className="px-5 py-4 text-sm leading-6 text-slate-600">2 năm, không giới hạn số km kể từ ngày mua.</p>
          </div>
          <div className="grid border-b border-slate-200 sm:grid-cols-[240px_1fr]">
            <p className="bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-900">Nhóm phụ kiện lắp cố định</p>
            <p className="px-5 py-4 text-sm leading-6 text-slate-600">
              Điều kiện tiêu chuẩn: 5 năm; điều kiện dịch vụ thương mại: 3 năm, không giới hạn km với dòng xe áp dụng.
            </p>
          </div>
          <div className="grid sm:grid-cols-[240px_1fr]">
            <p className="bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-900">Phụ kiện không lắp cố định</p>
            <p className="px-5 py-4 text-sm leading-6 text-slate-600">
              Bộ sạc di động, bộ sửa chữa lốp, thảm sàn, rèm trần và các phụ kiện tương tự: 2 năm, không giới hạn km.
            </p>
          </div>
        </div>
      </section>

      <section id="warranty-exclusions" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading
          eyebrow="06"
          title="Các hạng mục không thuộc phạm vi bảo hành"
          description="Các trường hợp phổ biến cần được đối chiếu trước khi yêu cầu bảo hành. Quyết định cuối cùng dựa trên kiểm tra kỹ thuật và sổ bảo hành áp dụng cho xe."
        />
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
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={19} />
          <p className="text-sm leading-6 text-amber-900">
            Thông tin chi tiết và các ngoại lệ cụ thể được quy định trong sổ bảo hành đi kèm từng sản phẩm.
          </p>
        </div>
      </section>

      <section id="warranty-faq" className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16">
        <SectionHeading eyebrow="07" title="Câu hỏi thường gặp" />
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
                      transition={{ duration: 0.18, ease: 'easeOut' }}
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
        <SectionHeading eyebrow="08" title="Thông tin hỗ trợ" />
        <div className="grid gap-4 md:grid-cols-3">
          <a
            href="tel:1900232389"
            className="group border border-slate-200 bg-white p-6 transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <Headphones size={22} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Dịch vụ khách hàng</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 group-hover:text-[#836100]">1900 23 23 89</p>
            <p className="mt-1 text-sm text-slate-500">Nhánh 1</p>
          </a>
          <button
            type="button"
            onClick={onOpenWorkshops}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <MapPin size={22} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Hệ thống dịch vụ</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tra cứu xưởng gần nhất <ChevronRight size={15} />
            </p>
          </button>
          <button
            type="button"
            onClick={onOpenManuals}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <FileText size={22} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tài liệu liên quan</p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tra cứu tài liệu hướng dẫn <ExternalLink size={14} />
            </p>
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Car className="text-[#836100]" size={22} />
            <p className="text-sm text-slate-600">
              Cần xác nhận điều kiện cho xe cụ thể? Hãy đặt lịch để xưởng kiểm tra hồ sơ và tình trạng thực tế.
            </p>
          </div>
          <button
            type="button"
            onClick={onBookWarrantyCheck}
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-slate-900 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            Đặt lịch kiểm tra <ChevronRight size={14} />
          </button>
        </div>

        <a
          href="https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-oto"
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#836100]"
        >
          Nguồn chính sách tham chiếu: website VinFast Việt Nam <ExternalLink size={13} />
        </a>
      </section>
    </article>
  )
}
