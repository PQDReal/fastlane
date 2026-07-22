'use client'

import { useState } from 'react'
import { mockInventory } from '../../../lib/mock-db'
import { Search, Filter, AlertTriangle, ArrowUpDown, History } from 'lucide-react'
import { Button } from '../../../components/ui/button'

export default function AdminInventoryPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('All')

  const filteredInventory = mockInventory.filter(item => {
    const matchesSearch = item.product.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filter === 'All' || item.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tồn kho Showroom</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý kho hàng tại cửa hàng, xe đang đặt trước và tính sẵn sàng.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white text-slate-700 hover:bg-slate-50 border-slate-200">
            <History size={16} className="mr-2" /> Lịch sử
          </Button>
          <Button className="bg-slate-900 text-white hover:bg-slate-800">
            <ArrowUpDown size={16} className="mr-2" /> Điều chỉnh kho
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <ArrowUpDown size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Tổng mã SP</p>
            <p className="text-2xl font-bold text-slate-900">{mockInventory.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Sắp hết hàng</p>
            <p className="text-2xl font-bold text-slate-900">{mockInventory.filter(i => i.status === 'Low Stock').length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Hết hàng</p>
            <p className="text-2xl font-bold text-slate-900">{mockInventory.filter(i => i.status === 'Out of Stock').length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm theo Mã hoặc Tên SP..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-md px-3 h-10 text-sm font-medium text-slate-700 w-full sm:w-auto">
              <Filter size={16} className="text-slate-400"/>
              <select 
                className="bg-transparent focus:outline-none w-full"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="All">Tất cả trạng thái</option>
                <option value="In Stock">Còn hàng</option>
                <option value="Low Stock">Sắp hết</option>
                <option value="Out of Stock">Hết hàng</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Mã (SKU)</th>
                <th className="px-6 py-4">Sản phẩm</th>
                <th className="px-6 py-4 text-center">Có sẵn</th>
                <th className="px-6 py-4 text-center text-slate-400">Đã đặt trước</th>
                <th className="px-6 py-4 text-center">Tổng hiện tại</th>
                <th className="px-6 py-4 text-center text-slate-400">Tối thiểu</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInventory.map(item => (
                <tr key={item.sku} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-slate-500 font-medium">{item.sku}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{item.product}</td>
                  
                  <td className="px-6 py-4 text-center">
                    <span className={`text-lg font-bold ${item.available === 0 ? 'text-red-600' : item.available <= item.minStock ? 'text-amber-600' : 'text-slate-900'}`}>
                      {item.available}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-500 font-medium">{item.reserved}</td>
                  <td className="px-6 py-4 text-center text-slate-700 font-bold bg-slate-50/50">{item.current}</td>
                  <td className="px-6 py-4 text-center text-slate-400">{item.minStock}</td>
                  
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      item.status === 'In Stock' ? 'bg-green-100 text-green-700' : 
                      item.status === 'Low Stock' ? 'bg-amber-100 text-amber-700' : 
                      'bg-red-100 text-red-700'
                    }`}>
                      {item.status !== 'In Stock' && <AlertTriangle size={12} />}
                      {item.status === 'In Stock' ? 'Còn hàng' : item.status === 'Low Stock' ? 'Sắp hết' : 'Hết hàng'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 text-xs font-semibold border-slate-200">
                      Điều chỉnh
                    </Button>
                  </td>
                </tr>
              ))}
              
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Không có dữ liệu tồn kho.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
