'use client'

import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminSettingsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cài đặt</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý thông tin và cấu hình chung của cửa hàng.</p>
        </div>
        <Button className="shrink-0 bg-brand-600 text-white hover:bg-brand-700">
          <Save size={16} className="mr-2" /> Lưu thay đổi
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/50 p-6">
          <h2 className="text-lg font-bold text-slate-900">Thông tin công ty</h2>
          <p className="text-sm text-slate-500">Cập nhật chi tiết và thông tin liên hệ của công ty.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Tên công ty</span>
            <input type="text" defaultValue="Fastlane EV Vietnam" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>Mã số thuế (MST)</span>
            <input type="text" defaultValue="0101234567" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <span>Địa chỉ showroom chính</span>
            <input type="text" defaultValue="Vincom Landmark 81, 720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </label>
        </div>
      </div>
    </div>
  )
}
