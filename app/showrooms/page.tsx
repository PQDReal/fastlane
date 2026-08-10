import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function ShowroomsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Hệ thống Showroom</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            Trải nghiệm trực tiếp các dòng xe đẳng cấp tại hệ thống showroom rộng khắp toàn quốc.
          </p>
          <div className="grid gap-6 md:grid-cols-2 mt-8">
            <div className="border border-slate-200 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Showroom Quận 1, TP. HCM</h3>
              <p className="text-slate-600 mb-2">Tòa nhà Landmark, Số 1 Lê Thánh Tôn, Bến Nghé, Quận 1.</p>
              <p className="text-sm font-medium text-brand-600">Hotline: 090 123 4567</p>
            </div>
            <div className="border border-slate-200 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Showroom Hoàn Kiếm, Hà Nội</h3>
              <p className="text-slate-600 mb-2">Số 10 Tràng Tiền, Quận Hoàn Kiếm, TP. Hà Nội.</p>
              <p className="text-sm font-medium text-brand-600">Hotline: 091 234 5678</p>
            </div>
            <div className="border border-slate-200 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Showroom Hải Châu, Đà Nẵng</h3>
              <p className="text-slate-600 mb-2">Số 50 Bạch Đằng, Quận Hải Châu, TP. Đà Nẵng.</p>
              <p className="text-sm font-medium text-brand-600">Hotline: 092 345 6789</p>
            </div>
            <div className="border border-slate-200 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Showroom Ninh Kiều, Cần Thơ</h3>
              <p className="text-slate-600 mb-2">Số 20 Đại lộ Hòa Bình, Quận Ninh Kiều, TP. Cần Thơ.</p>
              <p className="text-sm font-medium text-brand-600">Hotline: 093 456 7890</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
