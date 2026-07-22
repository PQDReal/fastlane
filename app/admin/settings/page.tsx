'use client'

import { Button } from '../../../components/ui/button'
import { Save } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cài đặt</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý cấu hình cửa hàng và các biến số kinh doanh.</p>
        </div>
        <Button className="bg-brand-600 text-white hover:bg-brand-700 shrink-0">
          <Save size={16} className="mr-2" /> Lưu thay đổi
        </Button>
      </div>

      <div className="space-y-6">
        
        {/* Company Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900">Thông tin công ty</h2>
            <p className="text-sm text-slate-500">Cập nhật chi tiết và thông tin liên hệ của công ty.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Tên công ty</label>
              <input type="text" defaultValue="Fastlane EV Vietnam" className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Mã số thuế (MST)</label>
              <input type="text" defaultValue="0101234567" className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Địa chỉ Showroom chính</label>
              <input type="text" defaultValue="Vincom Landmark 81, 720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM" className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
            </div>
          </div>
        </div>

        {/* Financial Variables */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900">Biến số tính toán chi phí</h2>
            <p className="text-sm text-slate-500">Các giá trị này được sử dụng để tự động tính toán chi phí lăn bánh trên trang web.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Lệ phí trước bạ ô tô điện (%)</label>
              <div className="relative">
                <input type="number" defaultValue="0" className="w-full h-10 pl-3 pr-8 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Lệ phí trước bạ xe xăng (%)</label>
              <div className="relative">
                <input type="number" defaultValue="10" className="w-full h-10 pl-3 pr-8 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Lãi suất trả góp mặc định</label>
              <div className="relative">
                <input type="number" defaultValue="8.5" step="0.1" className="w-full h-10 pl-3 pr-14 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%/năm</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Phí cấp biển số (HN/HCM)</label>
              <div className="relative">
                <input type="number" defaultValue="20000000" className="w-full h-10 pl-3 pr-10 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">VND</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Phí bảo trì đường bộ</label>
              <div className="relative">
                <input type="number" defaultValue="1560000" className="w-full h-10 pl-3 pr-10 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">VND</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Đơn giá sạc điện (Trung bình)</label>
              <div className="relative">
                <input type="number" defaultValue="3858" className="w-full h-10 pl-3 pr-14 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">VND/kWh</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
