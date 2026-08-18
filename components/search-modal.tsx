'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, Send, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'

export function SearchModal() {
  const { searchModalOpen, setSearchModalOpen } = useAppStore()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null)
  const [searchNonce, setSearchNonce] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery('')
      setSubmittedQuery('')
      setResults([])
      setAssistantMessage(null)
    }
  }, [searchModalOpen])

  useEffect(() => {
    if (!submittedQuery) {
      setResults([])
      setAssistantMessage(null)
      setIsSearching(false)
      return
    }

    let isCurrentSearch = true
    const controller = new AbortController()
    setIsSearching(true)
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search/assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: submittedQuery, limit: 100 }),
          signal: controller.signal,
        })
        if (res.ok) {
          const payload = await res.json()
          if (isCurrentSearch) {
            setResults(payload?.data?.products ?? [])
            setAssistantMessage(payload?.data?.message ?? null)
          }
        } else if (isCurrentSearch) {
          setResults([])
          setAssistantMessage(null)
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Search error:', error)
        }
      } finally {
        if (isCurrentSearch) setIsSearching(false)
      }
    }, 0)

    return () => {
      isCurrentSearch = false
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [submittedQuery, searchNonce])

  const submitSearch = () => {
    const nextQuery = query.trim()
    if (!nextQuery || isSearching) return
    setSubmittedQuery(nextQuery)
    setSearchNonce((value) => value + 1)
  }

  if (!searchModalOpen) return null

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  }

  // Get link based on category
  const getProductLink = (product: any) => {
    if (product.category === 'Ô tô điện') return `/cars/${product.slug}`
    if (product.category === 'Xe máy điện') return `/bikes/${product.slug}`
    if (product.product_type === 'ACCESSORY' || product.category === 'Phụ kiện') return `/accessories/${product.slug}`
    return `/accessories`
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32">
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={() => setSearchModalOpen(false)}
      />
      <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all mx-4">
        <div className="border-b border-gray-100 px-4 py-4">
          <form className="relative flex items-center" onSubmit={(event) => { event.preventDefault(); submitSearch() }}>
            <Search className="h-5 w-5 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent px-4 py-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none"
              placeholder="Tìm kiếm dòng xe, phụ kiện..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tìm kiếm sản phẩm"
            />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSubmittedQuery(''); setResults([]); setAssistantMessage(null) }}
              className="mr-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
              aria-label="Xóa nội dung tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button type="submit" disabled={!query.trim() || isSearching} className="mr-1 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Send className="h-4 w-4" aria-hidden="true" />
            Gửi
          </button>
          <button
            type="button"
            onClick={() => setSearchModalOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Đóng
          </button>
          </form>
        </div>

        {submittedQuery && (
          <div className="max-h-[60vh] overflow-y-auto p-4">
            {isSearching ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : results.length > 0 ? (
              <>
                {assistantMessage && (
                  <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    {assistantMessage}
                  </div>
                )}
                <ul className="space-y-4">
                {results.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={getProductLink(product)}
                      onClick={() => setSearchModalOpen(false)}
                      className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-gray-100 p-2">
                        {product.image_urls && product.image_urls[0] && product.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? (
                          <img src={product.image_urls[0]} alt={product.name} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs text-gray-400">No img</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">{product.name}</h4>
                        <div className="mt-1 flex items-center gap-3 text-sm">
                          <span className="text-gray-500">{product.category}</span>
                          <span className="font-medium text-[#836100]">{formatPrice(product.displayed_price)}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
                </ul>
              </>
            ) : (
              <div className="py-10 text-center text-gray-500">
                {assistantMessage ? <p>{assistantMessage}</p> : <>Không tìm thấy kết quả nào cho "{submittedQuery}"</>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

