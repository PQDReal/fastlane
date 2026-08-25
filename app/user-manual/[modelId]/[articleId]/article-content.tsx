'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { normalizeManualContentHtml } from '@/lib/api/manual-content'

interface TocItem {
  id: string
  title: string
}

interface ArticleContentProps {
  contentHtml: string
  modelId: string
  modelName: string
  modelYear: string
  articleTitle: string
  searchData: { id: string, title: string }[]
}

export function ArticleContent({ contentHtml, modelId, modelName, modelYear, articleTitle, searchData }: ArticleContentProps) {
  const normalizedContentHtml = useMemo(() => normalizeManualContentHtml(contentHtml), [contentHtml])
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Dynamically classify images based on natural size
  useEffect(() => {
    const images = document.querySelectorAll('.vf-manual-content img') as NodeListOf<HTMLImageElement>;
    
    function checkImageSize(img: HTMLImageElement) {
      if (img.naturalWidth > 0 && img.naturalWidth < 120 && img.naturalHeight < 120) {
        img.classList.add('inline-icon')
        img.classList.remove('block-image')
      } else if (img.naturalWidth >= 120) {
        img.classList.add('block-image')
        img.classList.remove('inline-icon')
      }
    }

    images.forEach(img => {
      if (img.complete) {
        checkImageSize(img)
      } else {
        img.addEventListener('load', () => checkImageSize(img))
      }
    })
  }, [contentHtml])

  // Extract TOC items using regex on the client (or it could be passed from server)
  // Matching <p class="Detail-Heading" id="...">...</p>
  const tocItems = useMemo(() => {
    const items: TocItem[] = []
    // Match any tag that has class="Detail-Heading" and an id attribute
    const regex = /<[^>]+class="[^"]*Detail-Heading[^"]*"[^>]*id="([^"]+)"[^>]*>(.*?)<\/[^>]+>/gi
    let match
    while ((match = regex.exec(normalizedContentHtml)) !== null) {
      // Remove any inner HTML tags from the title
      const rawTitle = match[2].replace(/<[^>]+>/g, '')
      items.push({ id: match[1], title: rawTitle })
    }
    return items
  }, [normalizedContentHtml])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    
    const articleMatches = searchData
      .filter(item => item.title.toLowerCase().includes(query))
      .map(item => ({ ...item, type: 'article' }))
      
    const tocMatches = tocItems
      .filter(item => item.title.toLowerCase().includes(query))
      .map(item => ({ ...item, type: 'toc' }))

    return [...tocMatches, ...articleMatches].slice(0, 10)
  }, [searchQuery, searchData, tocItems])

  return (
    <div className="w-full relative">
      {/* Search Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-4 border-b border-slate-200 gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#836100]">{modelName}</p>
            <span className="bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              Phiên bản {modelYear}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-slate-800">{articleTitle}</h1>
        </div>
        
        <div className="relative w-full md:w-72 z-20">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm hướng dẫn sử dụng"
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => {
                // Delay hiding dropdown so click can register
                setTimeout(() => setShowDropdown(false), 200)
              }}
            />
          </div>
          
          {/* Search Dropdown */}
          {showDropdown && searchQuery && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden max-h-60 overflow-y-auto">
              {searchResults.length > 0 ? (
                <ul className="py-1">
                  {searchResults.map((item) => (
                    <li key={`${item.type}-${item.id}`}>
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault() // Prevent input blur
                          if (item.type === 'toc') {
                            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          } else {
                            router.push(`/user-manual/${encodeURIComponent(modelId)}/${encodeURIComponent(item.id)}`)
                          }
                          setSearchQuery('')
                          setShowDropdown(false)
                        }}
                      >
                        {item.type === 'toc' ? (
                          <span className="text-[#836100] mr-2 font-medium">Mục lục:</span>
                        ) : null}
                        {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-sm text-slate-500 text-center">
                  Không tìm thấy kết quả.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table of Contents */}
      {tocItems.length > 0 && (
        <div className="mb-8">
          <ul className="list-disc pl-5 space-y-2">
            {tocItems.map(item => (
              <li key={item.id}>
                <a 
                  href={`#${item.id}`} 
                  className="text-blue-600 hover:underline text-[15px]"
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actual Content */}
      <div 
        dangerouslySetInnerHTML={{ __html: normalizedContentHtml }}
      />
    </div>
  )
}
