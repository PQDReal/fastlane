'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ManualArticle } from '@/lib/api/manuals-server'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ManualSidebarProps {
  tree: ManualArticle[]
  modelId: string
}

export function ManualSidebar({ tree, modelId }: ManualSidebarProps) {
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

  return (
    <aside className="w-full md:w-[320px] shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col md:sticky md:top-[74px] md:h-[calc(100vh-74px)] z-10">
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-slate-900 truncate">Mục lục</h2>
        <Link href="/user-manual" className="text-xs text-blue-600 hover:underline">
          Đổi xe
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {rootItems.map(renderNode)}
        </ul>
      </div>
    </aside>
  )
}
