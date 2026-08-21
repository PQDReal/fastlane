"use client";

import {
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  ExternalLink,
  FileText,
  Gauge,
  Headphones,
  MapPin,
  Paintbrush,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { RepairServiceItem } from "@/lib/api/after-sales-types";

interface RepairContentProps {
  vehicleType: "car" | "motorbike";
  items: RepairServiceItem[];
  onOpenManuals: () => void;
  onOpenWorkshops: () => void;
}

const CAR_PROCESS = [
  {
    number: "01",
    title: "Tiếp nhận yêu cầu sửa chữa",
    text: "Cung cấp tình trạng xe để xưởng ghi nhận và chuẩn bị tư vấn phù hợp.",
  },
  {
    number: "02",
    title: "Tiếp nhận và tư vấn",
    text: "Kỹ thuật viên ghi nhận yêu cầu, kiểm tra ban đầu và thống nhất phương án.",
  },
  {
    number: "03",
    title: "Sửa chữa",
    text: "Thực hiện theo quy trình kỹ thuật, thiết bị và tiêu chuẩn dành cho từng dòng xe.",
  },
  {
    number: "04",
    title: "Bàn giao xe",
    text: "Kiểm tra chất lượng, giải thích hạng mục và bàn giao hồ sơ dịch vụ.",
  },
  {
    number: "05",
    title: "Chăm sóc sau sửa chữa",
    text: "Theo dõi chất lượng sau bàn giao và tiếp nhận phản hồi của khách hàng.",
  },
];

const CAR_REPAIR_TYPES = [
  {
    title: "Sửa chữa chung",
    description:
      "Chẩn đoán và sửa chữa hệ thống điện, cơ khí, truyền động cùng các hạng mục vận hành của xe.",
    icon: Wrench,
    details: [
      "Chẩn đoán bằng thiết bị chuyên dụng",
      "Quản lý lịch sử xe trên hệ thống",
      "Kỹ thuật viên được đào tạo theo tiêu chuẩn hãng",
    ],
  },
  {
    title: "Sửa chữa đồng sơn",
    description:
      "Khắc phục hư hỏng thân vỏ, khung gầm và bề mặt sơn bằng quy trình kiểm soát theo từng mức độ.",
    icon: Paintbrush,
    details: [
      "Xử lý hư hỏng nhẹ và hư hỏng nặng",
      "Nắn chỉnh khung bằng thiết bị đo",
      "Quy trình sơn khép kín và kiểm soát màu",
    ],
  },
  {
    title: "Cân chỉnh góc đặt bánh xe",
    description:
      "Kiểm tra khi xe lệch lái, rung vô lăng, lốp mòn không đều hoặc sau va chạm và sửa chữa hệ thống gầm.",
    icon: CircleGauge,
    details: [
      "Đo góc đặt bánh xe",
      "Cân bằng động",
      "Khuyến nghị kiểm tra định kỳ",
    ],
  },
];

const MOTORBIKE_REPAIR_FEATURES = [
  "Chẩn đoán chính xác, ưu tiên an toàn và khả năng vận hành ổn định.",
  "Phụ tùng chính hãng, có hồ sơ dịch vụ và khả năng truy xuất.",
  "Thiết bị đáp ứng yêu cầu kỹ thuật của xe máy điện.",
  "Kỹ thuật viên được đào tạo theo quy trình của nhà sản xuất.",
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

export function RepairContent({
  vehicleType,
  items,
  onOpenManuals,
  onOpenWorkshops,
}: RepairContentProps) {
  const isCar = vehicleType === "car";

  return (
    <article className="space-y-14 animate-in fade-in duration-200 sm:space-y-16">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#836100]">
          {isCar ? "Ô tô" : "Xe máy điện"}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Dịch vụ sửa chữa
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          Dịch vụ chính hãng kết hợp kỹ thuật viên chuyên môn, thiết bị phù hợp
          và phụ tùng có khả năng truy xuất.
        </p>
      </header>

      {isCar && (
        <section
          id="repair-process"
          className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
        >
          <Heading
            index="01"
            title="Quy trình dịch vụ sửa chữa"
            description="Quy trình 5 bước từ tiếp nhận yêu cầu đến chăm sóc sau sửa chữa."
          />
          <div className="grid gap-4 md:grid-cols-5">
            {CAR_PROCESS.map((step) => (
              <div
                key={step.number}
                className="border border-slate-200 bg-white p-5"
              >
                <span className="text-xl font-semibold text-[#836100]">
                  {step.number}
                </span>
                <h4 className="mt-4 text-sm font-semibold text-slate-900">
                  {step.title}
                </h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && (
        <p className="border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Chưa có dữ liệu sửa chữa được publish cho loại xe này.
        </p>
      )}

      <section
        id="repair-types"
        className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
      >
        <Heading
          index={isCar ? "02" : "01"}
          title={
            isCar ? "Phân loại dịch vụ sửa chữa" : "Dịch vụ sửa chữa VinFast"
          }
          description={
            isCar
              ? "Các nhóm dịch vụ được tổ chức theo đúng cách tra cứu trên trang chính thức."
              : "Dịch vụ sửa chữa chung dành cho hệ thống xe máy điện."
          }
        />

        {isCar ? (
          <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 lg:grid-cols-3">
            {CAR_REPAIR_TYPES.map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.title} className="bg-white p-6">
                  <Icon size={23} className="text-[#836100]" />
                  <h4 className="mt-4 text-lg font-semibold text-slate-900">
                    {service.title}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {service.description}
                  </p>
                  <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                    {service.details.map((detail) => (
                      <li
                        key={detail}
                        className="flex gap-2 text-xs leading-5 text-slate-700"
                      >
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-[#836100]"
                        />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-5 border border-slate-200 bg-white p-6 md:grid-cols-[1fr_0.9fr] md:p-8">
            <div>
              <Settings size={24} className="text-[#836100]" />
              <h4 className="mt-4 text-xl font-semibold text-slate-900">
                Sửa chữa chung xe máy điện
              </h4>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Xưởng tiếp nhận, chẩn đoán và sửa chữa các hệ thống vận hành
                bằng quy trình dành riêng cho xe máy điện.
              </p>
            </div>
            <ul className="space-y-3 border-t border-slate-200 pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0">
              {MOTORBIKE_REPAIR_FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-3 text-sm leading-6 text-slate-700"
                >
                  <CheckCircle2
                    size={16}
                    className="mt-1 shrink-0 text-[#836100]"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-6 border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Dữ liệu dịch vụ đã publish
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 bg-white p-5"
                >
                  <span className="text-xs font-semibold text-[#836100]">
                    {item.badge}
                  </span>
                  <h4 className="mt-2 font-semibold text-slate-900">
                    {item.title}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                  {item.features.length > 0 && (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {item.features.join(" • ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section
        id="repair-commitment"
        className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
      >
        <Heading
          index={isCar ? "03" : "02"}
          title="Cam kết thời gian sửa chữa"
          description="Mốc hỗ trợ được đối chiếu theo điều kiện của chính sách tại thời điểm xưởng tiếp nhận xe."
        />
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="bg-slate-900 p-7 text-white">
            <Gauge size={24} className="text-[#e6b32e]" />
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              Hỗ trợ khi quá thời gian cam kết
            </p>
            <p className="mt-2 text-3xl font-semibold text-[#e6b32e]">
              {isCar ? "500.000 VNĐ/ngày" : "100.000 VNĐ/ngày"}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-300">
              Mức tham chiếu đã gồm VAT; quyền lợi thực tế phụ thuộc điều kiện
              áp dụng và xác nhận của xưởng.
            </p>
          </div>
          <div className="border border-slate-200 bg-white p-7">
            <ul className="space-y-4 text-sm leading-6 text-slate-700">
              {isCar ? (
                <>
                  <li className="flex gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-1 shrink-0 text-[#836100]"
                    />
                    <span>
                      Sửa chữa động cơ hoặc PDU/POD có phương án hỗ trợ di
                      chuyển theo chính sách.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-1 shrink-0 text-[#836100]"
                    />
                    <span>
                      Sửa chữa pin ưu tiên pin mượn; phương án thay thế được áp
                      dụng khi không có pin phù hợp.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-1 shrink-0 text-[#836100]"
                    />
                    <span>
                      Điều kiện cho xe kinh doanh vận tải và xe mượn được xác
                      nhận riêng khi tiếp nhận.
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-1 shrink-0 text-[#836100]"
                    />
                    <span>
                      Khi sửa chữa pin, khách hàng có thể được hỗ trợ pin mượn
                      nếu xưởng có sẵn.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-1 shrink-0 text-[#836100]"
                    />
                    <span>
                      Trường hợp hỗ trợ pin mượn không đồng thời áp dụng hỗ trợ
                      tài chính.
                    </span>
                  </li>
                </>
              )}
              <li className="flex gap-3">
                <ShieldCheck
                  size={17}
                  className="mt-1 shrink-0 text-[#836100]"
                />
                <span>
                  Không tính các ngày nghỉ lễ, Tết theo quy định hiện hành.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {isCar && (
        <section
          id="repair-parts"
          className="scroll-mt-28 border-b border-slate-200 pb-14 sm:pb-16"
        >
          <Heading index="04" title="Phụ tùng chính hãng" />
          <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-3">
            <div className="bg-white p-6">
              <ShieldCheck size={21} className="text-[#836100]" />
              <h4 className="mt-4 font-semibold text-slate-900">
                Kiểm soát chất lượng
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Linh kiện được đánh giá theo quy trình phê duyệt sản phẩm phù
                hợp với ngành ô tô.
              </p>
            </div>
            <div className="bg-white p-6">
              <Settings size={21} className="text-[#836100]" />
              <h4 className="mt-4 font-semibold text-slate-900">
                Tiêu chuẩn tương thích
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Thông số, độ bền và yêu cầu an toàn được kiểm soát trước khi đưa
                vào dịch vụ.
              </p>
            </div>
            <div className="bg-white p-6">
              <CheckCircle2 size={21} className="text-[#836100]" />
              <h4 className="mt-4 font-semibold text-slate-900">
                Đối tác ngành ô tô
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Ưu tiên hệ thống nhà cung cấp đáp ứng các chứng nhận quản lý
                chất lượng và môi trường.
              </p>
            </div>
          </div>
        </section>
      )}

      <section id="repair-support" className="scroll-mt-28">
        <Heading index={isCar ? "05" : "03"} title="Thông tin hỗ trợ" />
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
            <FileText size={21} className="text-[#836100]" />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
              Tài liệu liên quan
            </p>
            <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900 group-hover:text-[#836100]">
              Tra cứu hướng dẫn <ExternalLink size={14} />
            </p>
          </button>
        </div>
        <a
          href={
            isCar
              ? "https://vinfastauto.com/vn_vi/dich-vu-sua-chua-oto"
              : "https://vinfastauto.com/vn_vi/dich-vu-sua-chua-xe-may"
          }
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
