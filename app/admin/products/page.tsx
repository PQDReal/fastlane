'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Filter, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import Link from 'next/link'

export default function AdminProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/v1/admin/products')
        if (res.ok) {
          const data = await res.json()
          setProducts(data)
        }
      } catch (error) {
        console.error('Failed to fetch products:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchProducts()
  }, [])

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const formatMoney = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý xe, phụ kiện và bảng giá.</p>
        </div>
        <Button className="bg-slate-900 text-white hover:bg-slate-800 shrink-0">
          <Plus size={16} className="mr-2" /> Thêm sản phẩm
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm sản phẩm..." 
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
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="All">Tất cả danh mục</option>
                {/* Dynamically generate categories if needed, but for now hardcoded based on known values is ok, or unique from data */}
                {Array.from(new Set(products.map(p => p.category))).map(cat => (
                  <option key={cat as string} value={cat as string}>{cat as string}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Sản phẩm</th>
                <th className="px-6 py-4">Mã (SKU)</th>
                <th className="px-6 py-4">Danh mục</th>
                <th className="px-6 py-4">Giá</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="relative w-28 px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                        {product.image_urls && product.image_urls[0] && product.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? (
                          <img src={product.image_urls[0]} alt={product.name} className="w-8 h-auto object-contain" />
                        ) : (
                          <span className="text-xs text-slate-400">No img</span>
                        )}
                      </div>
                      <span className="font-semibold text-slate-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{product.sku}</td>
                  <td className="px-6 py-4 text-slate-600">{product.category}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMoney(product.displayed_price)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase ${
                      product.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {product.is_active ? 'Hoạt động' : 'Bản nháp'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(product.created_at)}</td>
                  <td className="relative w-28 px-6 py-4 text-right">
                    <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded"><Edit size={16}/></button>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                    </div>
                    <button className="absolute right-6 top-1/2 inline-block -translate-y-1/2 p-2 text-slate-400 transition-opacity group-hover:pointer-events-none group-hover:opacity-0"><MoreHorizontal size={16}/></button>
                  </td>
                </tr>
              ))}
              
              {!isLoading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Không tìm thấy sản phẩm nào.
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

