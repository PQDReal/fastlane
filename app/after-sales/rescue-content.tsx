"use client";

import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Headphones,
  MapPin,
  Navigation,
  PhoneCall,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import type { RescuePolicyItem } from "@/lib/api/after-sales-types";

interface RescueContentProps {
  items: RescuePolicyItem[];
  onOpenManuals: () => void;
  onOpenWorkshops: () => void;
}

const DEFAULT_COVERAGE = [
  "Hỗ trợ trên đường đối với sự cố thuộc phạm vi dịch vụ.",
  "Kéo xe về xưởng dịch vụ ủy quyền gần nhất.",
  "Khi xe hết năng lượng, kéo tới trạm sạc hoặc địa chỉ khách hàng gần hơn.",
];

const CONTACT_METHODS = [
  {
    title: "Gọi tổng đài cứu hộ",
    text: "Liên hệ trực tiếp để cung cấp vị trí và tình trạng xe.",
    icon: PhoneCall,
  },
  {
    title: "Ứng dụng hoặc màn hình xe",
    text: "Chọn mục Cứu hộ trên kênh được hỗ trợ của dòng xe.",
    icon: Smartphone,
  },
  {
    title: "Nút SOS",
    text: "Dùng trong trường hợp khẩn cấp trên các mẫu xe có trang bị.",
    icon: ShieldAlert,
  },
];

const ECALL_TIMELINE = [
  {
    time: "Ngay lập tức",
    title: "Tiếp nhận tín hiệu SOS",
    text: "Trung tâm hỗ trợ tiếp nhận tín hiệu khẩn cấp từ xe.",
  },
  {
    time: "Trong 15 phút",
    title: "Chủ động gọi lại",
    text: "Bộ phận chăm sóc khách hàng liên hệ lại nếu cuộc gọi eCall bị nhỡ.",
  },
  {
    time: "Trong 10 phút",
    title: "Chuyển yêu cầu cứu hộ",
    text: "Yêu cầu được chuyển cho đơn vị điều phối sau khi thông tin được xác minh.",
  },
  {
    time: "Trong 15 phút",
    title: "Bắt đầu tới hiện trường",
    text: "Đơn vị cứu hộ hoặc xưởng bắt đầu di chuyển sau khi nhận yêu cầu.",
  },
];

const EMERGENCY_GUIDES = [
  "VF 3",
  "VF 5",
  "VF 6",
  "VF 7",
  "VF 8",
  "VF 9",
  "VF e34",
  "Limo Green và VF Limo",
];

function Heading({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">
        {index}
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h3>
      {description && (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {description}
        </p>
      )}
    </div>
  );
}

export function RescueContent({
  items,
  onOpenManuals,
  onOpenWorkshops,
}: RescueContentProps) {
  const policy =
    items.find(
      (item) => item.vehicleType === "car" || item.vehicleType === "all",
    ) ?? items[0];
  const coverage = policy?.coverage.length ? policy.coverage : DEFAULT_COVERAGE;

  return (
    <article className="space-y-14 animate-in fade-in duration-200 sm:space-y-16">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">
          Ô tô · Hỗ trợ khẩn cấp
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Thông tin cứu hộ
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Thông tin liên hệ, phạm vi hỗ trợ, eCall và hướng dẫn ứng phó dành cho
          xe ô tô VinFast.
        </p>
      </header>

      <section
        id="rescue-information"
        className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
      >
        <Heading
          index="01"
          title="Thông tin cứu hộ 24/7"
          description={
            policy?.description ||
            "Dịch vụ cứu hộ dành cho xe ô tô tại các thị trường có triển khai dịch vụ."
          }
        />

        <div className="grid gap-5 bg-slate-900 p-7 text-white sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-red-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />{" "}
              Hotline cứu hộ {policy?.operatingHours || "24/7"}
            </div>
            <button
              type="button"
              aria-disabled="true"
              title="Tạm thời chưa khả dụng"
              className="mt-3 block origin-left text-4xl font-semibold text-[#e6b32e] transition duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b32e] active:scale-[0.98] sm:text-5xl"
            >
              1900 xxxx
            </button>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Tạm thời chưa khả dụng
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Dịch vụ áp dụng cho chủ sở hữu hoặc người được ủy quyền sử dụng
              xe; phạm vi cụ thể được tổng đài xác nhận theo từng tình huống.
            </p>
          </div>
          <button
            type="button"
            aria-disabled="true"
            title="Tạm thời chưa khả dụng"
            className="inline-flex items-center justify-center gap-2 bg-[#836100] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white transition duration-150 hover:bg-[#6c4f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b32e] active:scale-[0.98]"
          >
            <PhoneCall size={18} /> Gọi cứu hộ ngay
          </button>
        </div>

        <div className="mt-6 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-2">
          <div className="bg-white p-6">
            <Navigation size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">
              Phạm vi hỗ trợ
            </h4>
            <ul className="mt-4 space-y-3">
              {coverage.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-slate-700"
                >
                  <CheckCircle2
                    size={16}
                    className="mt-1 shrink-0 text-[#836100]"
                  />
                  <span>{item}</span>
                </li>
              ))}
              {policy?.mobileChargingSupport && (
                <li className="flex gap-3 text-sm leading-6 text-slate-700">
                  <BatteryCharging
                    size={16}
                    className="mt-1 shrink-0 text-[#836100]"
                  />
                  <span>
                    Có hỗ trợ giải pháp năng lượng lưu động theo điều kiện vận
                    hành.
                  </span>
                </li>
              )}
            </ul>
          </div>
          <div className="bg-white p-6">
            <AlertTriangle size={22} className="text-[#836100]" />
            <h4 className="mt-4 font-semibold text-slate-900">
              Điều kiện cần lưu ý
            </h4>
            <ul className="mt-4 space-y-3">
              {(policy?.conditions.length
                ? policy.conditions
                : [
                    "Quyền lợi miễn phí được đối chiếu với thời hạn bảo hành.",
                    "Điều khoản loại trừ được xác nhận theo tình trạng thực tế.",
                  ]
              ).map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-slate-700"
                >
                  <span className="font-semibold text-[#836100]">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {CONTACT_METHODS.map((method) => {
            const Icon = method.icon;
            return (
              <div
                key={method.title}
                className="border border-slate-200 bg-white p-5"
              >
                <Icon size={20} className="text-[#836100]" />
                <h4 className="mt-4 text-sm font-semibold text-slate-900">
                  {method.title}
                </h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {method.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        id="rescue-ecall"
        className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
      >
        <Heading
          index="02"
          title="Hỗ trợ khẩn cấp (eCall)"
          description="Tính năng áp dụng trên một số dòng xe; thời gian dưới đây thể hiện cam kết xử lý sau từng mốc tiếp nhận và xác minh."
        />
        <div className="grid gap-4 md:grid-cols-4">
          {ECALL_TIMELINE.map((step, index) => (
            <div
              key={step.title}
              className="relative border border-slate-200 bg-white p-5"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-[#836100]">
                {step.time}
              </span>
              <h4 className="mt-3 text-sm font-semibold text-slate-900">
                {step.title}
              </h4>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {step.text}
              </p>
              {index < ECALL_TIMELINE.length - 1 && (
                <ChevronRight
                  size={15}
                  className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 bg-[#f8fafc] text-slate-400 md:block"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <section
        id="rescue-guide"
        className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
      >
        <Heading
          index="03"
          title="Hướng dẫn ứng phó khẩn cấp"
          description="Chọn hướng dẫn đúng mẫu xe trước khi xử lý sự cố, cứu hộ hoặc làm việc với lực lượng ứng cứu."
        />
        <div className="border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <FileText size={22} className="mt-0.5 shrink-0 text-[#836100]" />
            <div>
              <h4 className="font-semibold text-slate-900">
                Danh mục tài liệu theo dòng xe
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Các tài liệu này nằm trong nhóm hướng dẫn sử dụng, đúng với phạm
                vi tài liệu dự án đang giữ lại.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {EMERGENCY_GUIDES.map((model) => (
              <span
                key={model}
                className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {model}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenManuals}
            className="mt-6 inline-flex items-center gap-2 border border-slate-300 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:border-[#836100] hover:text-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.98]"
          >
            <FileText size={15} /> Mở thư viện hướng dẫn
          </button>
        </div>
      </section>

      <section id="rescue-support" className="scroll-mt-28">
        <Heading index="04" title="Thông tin hỗ trợ" />
        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            aria-disabled="true"
            title="Tạm thời chưa khả dụng"
            className="group w-full border border-slate-200 bg-white p-6 text-left transition duration-150 hover:-translate-y-0.5 hover:border-[#836100] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:translate-y-0 active:scale-[0.99]"
          >
            <Headphones size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
              Dịch vụ khách hàng
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 transition group-hover:text-[#836100]">
              1900 xxxx
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tạm thời chưa khả dụng
            </p>
          </button>
          <button
            type="button"
            onClick={onOpenWorkshops}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <MapPin size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
              Xưởng dịch vụ
            </p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tìm xưởng gần nhất <ChevronRight size={14} />
            </p>
          </button>
          <button
            type="button"
            onClick={onOpenManuals}
            className="group border border-slate-200 bg-white p-6 text-left transition hover:border-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] active:scale-[0.99]"
          >
            <Clock3 size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
              Chuẩn bị trước tình huống
            </p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Xem tài liệu an toàn <ExternalLink size={14} />
            </p>
          </button>
        </div>
        <a
          href="https://vinfastauto.com/vn_vi/thong-tin-cuu-ho-oto"
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#836100]"
        >
          Nguồn dịch vụ tham chiếu: website VinFast Việt Nam{" "}
          <ExternalLink size={13} />
        </a>
      </section>
    </article>
  );
}
