'use client'

import { useState } from 'react'
import { Plus, Search, Ticket, Percent, Banknote, Calendar, CheckCircle2, XCircle } from 'lucide-react'

// Basic UI component for buttons since we don't have access to the full shadcn/ui folder
function Button({ children, className, variant = 'default', size = 'default', ...props }: any) {
  const baseStyle = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
  const variants = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-200 bg-white hover:bg-slate-100 text-slate-900",
    ghost: "hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-red-600 text-white hover:bg-red-700"
  }
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    icon: "h-10 w-10"
  }
  
  return (
    <button 
      className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${sizes[size as keyof typeof sizes]} ${className || ''}`}
      {...props}
    >
      {children}
    </button>
  )
}

const mockPromotions = [
  { id: '1', code: 'WELCOME2026', type: 'percentage', value: 5, minimumOrderAmount: 0, usageLimit: 1000, usedCount: 150, startsAt: '2026-01-01T00:00:00Z', endsAt: null, isActive: true },
  { id: '2', code: 'TET2026', type: 'fixed_amount', value: 10000000, minimumOrderAmount: 500000000, usageLimit: 500, usedCount: 450, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-02-28T23:59:59Z', isActive: false },
  { id: '3', code: 'SUMMER2026', type: 'percentage', value: 10, minimumOrderAmount: 100000000, usageLimit: 200, usedCount: 5, startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-08-31T23:59:59Z', isActive: true },
  { id: '4', code: 'FASTLANE_VIP', type: 'fixed_amount', value: 20000000, minimumOrderAmount: 1000000000, usageLimit: 50, usedCount: 12, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z', isActive: true },
]

export default function AdminPromotions() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Vĩnh viễn'
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const filteredPromotions = mockPromotions.filter(promo => {
    const matchesSearch = promo.code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'All' 
      ? true 
      : statusFilter === 'Active' ? promo.isActive : !promo.isActive

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Khuyến mãi</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý mã giảm giá, voucher và các chương trình ưu đãi.</p>
        </div>
        <Button className="bg-slate-900 text-white hover:bg-slate-800 shrink-0">
          <Plus size={16} className="mr-2" /> Thêm mã KM
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
            <Ticket size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Tổng mã KM</p>
            <p className="text-2xl font-bold text-slate-900">{mockPromotions.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Đang hoạt động</p>
            <p className="text-2xl font-bold text-slate-900">{mockPromotions.filter(p => p.isActive).length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
            <XCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Đã kết thúc</p>
            <p className="text-2xl font-bold text-slate-900">{mockPromotions.filter(p => !p.isActive).length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm theo mã KM..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="h-10 px-3 border border-slate-200 rounded-md flex items-center text-sm">
              <select 
                className="bg-transparent focus:outline-none w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Tất cả trạng thái</option>
                <option value="Active">Đang hoạt động</option>
                <option value="Inactive">Đã kết thúc/Ẩn</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Mã KM</th>
                <th className="px-6 py-4">Giảm giá</th>
                <th className="px-6 py-4">Đơn tối thiểu</th>
                <th className="px-6 py-4">Đã dùng / Giới hạn</th>
                <th className="px-6 py-4">Thời hạn</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPromotions.map((promo) => (
                <tr key={promo.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 font-mono tracking-wider">{promo.code}</div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-brand-600 flex items-center gap-1.5">
                    {promo.type === 'percentage' ? (
                      <><Percent size={14} /> {promo.value}%</>
                    ) : (
                      <><Banknote size={14} /> {formatMoney(promo.value)}</>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {promo.minimumOrderAmount > 0 ? formatMoney(promo.minimumOrderAmount) : 'Không yêu cầu'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-brand-500 rounded-full" 
                          style={{ width: `${Math.min(100, (promo.usedCount / promo.usageLimit) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {promo.usedCount} / {promo.usageLimit}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Calendar size={12} />
                      {formatDate(promo.startsAt)} - {formatDate(promo.endsAt)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      promo.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {promo.isActive ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 text-xs font-semibold border-slate-200">
                      Chỉnh sửa
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredPromotions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Không tìm thấy mã khuyến mãi nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between text-sm text-slate-500">
          <div>Hiển thị 1 đến {filteredPromotions.length} của {filteredPromotions.length} kết quả</div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Trước</Button>
            <Button variant="outline" size="sm" disabled>Sau</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
