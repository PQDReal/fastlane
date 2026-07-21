export function Footer() {
    return <footer className="bg-[#002766] px-5 py-16 text-white">
        <div className="mx-auto grid max-w-[1200px] gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
            <div>
                <h2 className="text-3xl font-black">FASTLANE</h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
                    Mang đến giải pháp di chuyển xanh, thông minh và đẳng cấp. Trải nghiệm tương lai cùng chúng tôi ngay hôm nay.
                </p>
            </div>
            <div className="space-y-4 text-sm font-semibold">
                <p>Chính sách bảo mật</p>
                <p>Điều khoản sử dụng</p>
            </div>
            <div className="space-y-4 text-sm font-semibold">
                <p>Liên hệ</p>
                <p>Hệ thống showroom</p>
            </div>
        </div>
        <div className="mx-auto mt-16 max-w-[1200px] border-t border-white/10 pt-7 text-center text-xs text-white/40">
            © 2024 FASTLANE VinFast. All rights reserved.
        </div>
    </footer>
}
