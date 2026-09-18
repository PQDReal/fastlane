import Link from 'next/link'

export function Footer() {
  return (
    <footer className="w-full bg-[#ffffff] border-t border-[#f1f1f1] flex flex-col min-h-auto lg:min-h-[540px] px-6 lg:px-12 pb-8 lg:pb-12 pt-[48px] lg:pt-[110px]">
      <div className="mx-auto w-full max-w-[1440px] flex-1 flex flex-col">
        {/* Main Content */}
        <div className="flex flex-col lg:flex-row lg:justify-between gap-12 lg:gap-0">
          
          {/* Cột 1 - Brand */}
          <div className="w-full lg:w-[45%]">
            <Link href="/" className="inline-block group mb-[24px]">
              <div className="font-display text-[28px] 2xl:text-[32px] font-bold tracking-[0.06em] text-[#9b7200]">
                FASTLANE
              </div>
            </Link>
            <p className="text-[#555555] text-[14px] md:text-[15px] leading-[1.6] max-w-[460px]">
              Khởi nguồn tương lai di chuyển. Trải nghiệm giải pháp ô tô điện thông minh và đẳng cấp toàn cầu ngay hôm nay.
            </p>
          </div>

          {/* Cột 2 - Pháp lý */}
          <div className="w-full lg:flex-1 lg:flex lg:justify-center">
            <div className="w-full lg:w-auto">
              <h2 className="uppercase text-[13px] tracking-[1.5px] font-semibold text-gray-500 mb-[32px]">
                Pháp lý
              </h2>
              <nav aria-label="Thông tin pháp lý" className="flex flex-col space-y-[20px]">
                <Link href="/privacy" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Chính sách bảo mật</Link>
                <Link href="/terms" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Điều khoản sử dụng</Link>
                <Link href="/payment-policy" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Chính sách thanh toán</Link>
              </nav>
            </div>
          </div>

          {/* Cột 3 - Hỗ trợ */}
          <div className="w-full lg:w-[250px] lg:flex lg:justify-end">
            <div className="w-full lg:w-auto">
              <h2 className="uppercase text-[13px] tracking-[1.5px] font-semibold text-gray-500 mb-[32px]">
                Hỗ trợ
              </h2>
              <nav aria-label="Thông tin hỗ trợ" className="flex flex-col space-y-[20px]">
                <Link href="/support" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Liên hệ CSKH</Link>
                <Link href="/showrooms" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Hệ thống showroom</Link>
                <Link href="/rescue" className="text-[14px] md:text-[15px] text-[#111111] font-medium hover:text-[#9b7200] transition-colors">Dịch vụ cứu hộ 24/7</Link>
              </nav>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="mt-[60px] lg:mt-auto flex flex-col lg:flex-row lg:items-center lg:justify-between text-[12px] md:text-[13px] text-gray-500 tracking-wide gap-4 lg:gap-0">
          <div className="text-left">
            © 2026 FASTLANE.
          </div>
          <div className="uppercase text-left lg:text-right">
            IMAGES SHOWN CONTAIN PRE-PRODUCTION LEVEL VEHICLES.
          </div>
        </div>
      </div>
    </footer>
  )
}
