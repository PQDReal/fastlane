import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-background px-6 py-24 text-foreground border-t border-muted">
      <div className="mx-auto grid max-w-[1440px] gap-16 md:grid-cols-[2fr_1fr_1fr] lg:px-12">
        <div>
          <h2 className="header-brand text-4xl font-bold tracking-tight">FASTLANE</h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Khởi nguồn tương lai di chuyển. Trải nghiệm giải pháp ô tô điện thông minh và đẳng cấp toàn cầu ngay hôm nay.
          </p>
        </div>
        <div className="space-y-6 text-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-8">Pháp lý</h3>
          <Link href="/privacy" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Chính sách bảo mật</Link>
          <Link href="/terms" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Điều khoản sử dụng</Link>
          <Link href="/payment-policy" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Chính sách thanh toán</Link>
        </div>
        <div className="space-y-6 text-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-8">Hỗ trợ</h3>
          <Link href="/support" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Liên hệ CSKH</Link>
          <Link href="/showrooms" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Hệ thống showroom</Link>
          <Link href="/rescue" className="block font-medium hover:text-brand-600 transition-colors cursor-pointer">Dịch vụ cứu hộ 24/7</Link>
        </div>
      </div>
      <div className="mx-auto mt-24 max-w-[1440px] pt-8 text-center text-sm text-muted-foreground lg:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <span className="font-medium">© {new Date().getFullYear()} FASTLANE.</span>
        <span className="text-[10px] uppercase tracking-wider">Images shown contain pre-production level vehicles.</span>
      </div>
    </footer>
  )
}
