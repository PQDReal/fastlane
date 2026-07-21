import { ArrowRight } from 'lucide-react'
import { Header } from '../components/header'
import { Button } from '../components/ui/button'
import { CategoryCard } from '../components/category-card'
import { ProductCard } from '../components/product-card'
import { Footer } from '../components/footer'

const products = [
    { name: 'VinFast VF9', desc: 'SUV cỡ lớn sang trọng với không gian rộng rãi và công nghệ thông minh.', price: '1.491.000.000', image: '/images/vf9.png', hot: true },
    { name: 'VinFast VF8', desc: 'SUV cỡ trung mạnh mẽ, thiết kế đậm chất thể thao, trải nghiệm lái khác biệt.', price: '1.090.000.000', image: '/images/vf8.png' },
    { name: 'Vento S', desc: 'Xe máy điện cao cấp, vận hành êm ái, thiết kế thanh lịch chuẩn phong cách.', price: '50.000.000', image: '/images/vento.png' }]

export default function Home() {
    return <main><Header />
        <section className="relative flex min-h-[680px] items-start justify-center overflow-hidden bg-[#e8e6e6] text-center lg:min-h-[805px]">
            <img src="/images/maxresdefault.jpg" alt="Xe điện trên cung đường đô thị" className="absolute inset-0 h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white/65" />
            <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col items-center px-5 pt-16 sm:pt-20 lg:pt-20">
                <h1 className="hero-sunlight text-[40px] font-bold leading-[1.12] tracking-wide sm:text-5xl lg:text-[58px]">
                    <span className="hero-copy">
                        <span>Khởi nguồn</span>
                        <span>Tương lai di chuyển.</span>
                    </span>
                    <span className="hero-light" aria-hidden="true">
                        <span>Khởi nguồn</span>
                        <span>Tương lai di chuyển.</span>
                    </span>
                </h1>
                <div className="mt-[330px] lg:mt-[365px]"><span className="rounded-full bg-white/75 px-4 py-2 text-xs font-bold shadow-sm">Trải Nghiệm Đẳng Cấp</span>
                    <p className="mx-auto mt-4 max-w-xl text-base text-slate-700 sm:text-xl">Tuyệt tác công nghệ VinFast VF9. Sẵn sàng đồng hành cùng bạn trên mọi hành trình.</p>
                    <div className="mt-6 flex justify-center gap-3"><Button variant="gold">Đặt cọc ngay <ArrowRight className="ml-1" size={15} /></Button><Button variant="outline">Tìm hiểu thêm</Button></div></div>
            </div><p className="absolute bottom-6 left-1/2 w-full -translate-x-1/2 px-4 text-[10px] text-white/80">Images and videos shown contain pre-production level vehicles. Actual production vehicles may differ slightly.</p>
        </section>
        <section className="px-4 py-16 sm:px-6 lg:py-20"><div className="mx-auto max-w-[1200px]"><h2 className="text-3xl font-bold">Danh mục sản phẩm</h2><p className="mt-2 text-sm text-slate-600">Khám phá hệ sinh thái xe điện thông minh.</p><div className="mt-10 grid gap-6 md:grid-cols-3"><CategoryCard className="md:col-span-2" title="Ô tô điện" subtitle="Đỉnh cao công nghệ di chuyển" image="/images/maxresdefault.jpg" /><CategoryCard title="Xe máy điện" subtitle="Năng động mỗi ngày" image="/images/vento.png" /></div></div></section>
        <section className="bg-mist px-4 py-16 sm:px-6 lg:py-20"><div className="mx-auto max-w-[1200px]"><div className="flex items-end justify-between"><div><h2 className="text-3xl font-bold">Sản phẩm nổi bật</h2><p className="mt-2 text-sm text-slate-600">Những thiết kế được yêu thích nhất.</p></div><a className="hidden items-center text-sm font-semibold sm:flex" href="#products">Xem tất cả <ArrowRight className="ml-1" size={16} /></a></div><div id="products" className="no-scrollbar mt-10 flex gap-6 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">{products.map(p => <ProductCard key={p.name}{...p} />)}</div></div></section>
        <Footer />
    </main>
}
