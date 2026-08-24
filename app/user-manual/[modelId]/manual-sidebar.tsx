'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ManualArticle, ManualModel } from '@/lib/api/manuals-server'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ManualSidebarProps {
  tree: ManualArticle[]
  modelId: string
  models: ManualModel[]
}

export function ManualSidebar({ tree, modelId, models }: ManualSidebarProps) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Organize flat tree into hierarchy
  const rootItems = useMemo(() => {
    const map = new Map<string, any>()
    tree.forEach(item => {
      map.set(item.id, { ...item, children: [] })
    })

    const roots: any[] = []
    map.forEach(item => {
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id).children.push(item)
      } else {
        roots.push(item)
      }
    })

    const sortNodes = (nodes: any[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order)
      nodes.forEach(n => sortNodes(n.children))
    }
    sortNodes(roots)
    return roots
  }, [tree])

  const toggle = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderNode = (node: any) => {
    const isExpanded = !!expanded[node.id] || pathname.includes(node.id)
    const isActive = pathname === `/user-manual/${encodeURIComponent(modelId)}/${encodeURIComponent(node.id)}`
    const hasChildren = node.children && node.children.length > 0

    return (
      <li key={node.id} className="flex flex-col">
        <div 
          className={cn(
            "flex items-center py-2 px-3 rounded-md transition-colors cursor-pointer",
            isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-slate-100"
          )}
          onClick={(e) => {
            if (hasChildren) {
              setExpanded(prev => ({ ...prev, [node.id]: !isExpanded }))
            }
          }}
        >
          {hasChildren && (
            <button
              onClick={(e) => toggle(node.id, e)} 
              className="mr-1.5 p-1 rounded-sm hover:bg-slate-200 shrink-0 text-slate-500"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {!hasChildren && <div className="w-6 shrink-0" />}
          
          {hasChildren ? (
            <span className="flex-1 text-sm leading-5">
              {node.title}
            </span>
          ) : (
            <Link 
              href={`/user-manual/${encodeURIComponent(modelId)}/${encodeURIComponent(node.id)}`}
              className="flex-1 text-sm leading-5"
              onClick={(e) => e.stopPropagation()}
              data-no-global-loading="true"
            >
              {node.title}
            </Link>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <ul className="ml-5 pl-2 border-l border-slate-200 mt-1 flex flex-col gap-1">
            {node.children.map(renderNode)}
          </ul>
        )}
      </li>
    )
  }

  const manualSeriesList = useMemo(() => {
    const groups: Record<string, { name: string; category: string; years: string[]; thumbnail?: string }> = {}
    models.forEach((m) => {
      const series = m.model_series || m.name
      if (!groups[series]) {
        groups[series] = { name: series, category: m.category || '', years: [], thumbnail: m.thumbnail || undefined }
      }
      if (m.year && !groups[series].years.includes(m.year)) {
        groups[series].years.push(m.year)
      }
    })
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))
  }, [models])

  const [showChangeModal, setShowChangeModal] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedYear, setSelectedYear] = useState('')

  return (
    <>
      <aside className="w-full md:w-[320px] shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col md:sticky md:top-[74px] md:h-[calc(100vh-74px)] z-10">
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-slate-900 truncate">Mục lục</h2>
          <button onClick={() => setShowChangeModal(true)} className="text-xs text-blue-600 hover:underline">
            Đổi xe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {rootItems.map(renderNode)}
          </ul>
        </div>
      </aside>

      {showChangeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-slate-900 p-6 text-white shadow-xl relative">
            <button
              onClick={() => setShowChangeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            <span className="text-xs font-bold uppercase tracking-widest text-[#e6b32e]">
              Tra cứu theo dòng xe
            </span>
            <h4 className="mt-2 text-xl font-bold text-white">Chọn mẫu xe & năm sản xuất</h4>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  setSelectedYear('')
                }}
                className="w-full sm:flex-1 border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="">-- Chọn mẫu xe --</option>
                {manualSeriesList.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
              <select
                disabled={!selectedModel}
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full sm:flex-1 border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white focus:border-amber-400 focus:outline-none disabled:opacity-50"
              >
                <option value="">-- Năm sản xuất --</option>
                {selectedModel &&
                  manualSeriesList.find(m => m.name === selectedModel)?.years.map((year) => (
                    <option key={year} value={year}>
                      Năm {year}
                    </option>
                  ))}
              </select>
            </div>
            <button
              disabled={!selectedModel || !selectedYear}
              onClick={() => {
                window.location.href = `/user-manual/${encodeURIComponent(selectedModel)}_${encodeURIComponent(selectedYear)}`
              }}
              className="mt-4 w-full bg-[#836100] px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-[#6c4f00] disabled:opacity-50"
            >
              Xem hướng dẫn
            </button>
          </div>
        </div>
      )}
    </>
  )
}
