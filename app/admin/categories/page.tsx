'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { Button } from '../../../components/ui/button'

export default function AdminCategoriesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/v1/categories')
        if (res.ok) {
          const data = await res.json()
          setCategories(data)
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchCategories()
  }, [])

  const filteredCategories = categories.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Danh mục</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý các danh mục sản phẩm của hệ thống.</p>
        </div>
        <Button className="bg-slate-900 text-white hover:bg-slate-800 shrink-0">
          <Plus size={16} className="mr-2" /> Thêm danh mục
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm danh mục..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Tên danh mục</th>
                <th className="px-6 py-4">Mô tả</th>
                <th className="px-6 py-4">Loại danh mục</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.map(category => (
                <tr key={category.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 truncate max-w-xs">{category.description || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    {category.product_type === 'VEHICLE' ? 'Xe' : 'Phụ kiện'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end relative h-8 w-[72px] ml-auto">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-0">
                        <button className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="Sửa"><Edit size={16}/></button>
                        <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Xóa"><Trash2 size={16}/></button>
                      </div>
                      <button className="p-1.5 text-slate-400 transition-opacity group-hover:opacity-0 absolute right-0 top-0"><MoreHorizontal size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {!isLoading && filteredCategories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Không tìm thấy danh mục nào.
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

