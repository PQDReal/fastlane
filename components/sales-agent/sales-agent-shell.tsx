'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Bot, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { MarkdownMessage } from './markdown-message'
import { salesAgentUiEnabled, useSalesAgentStore } from '@/lib/sales-agent/store'
import type { SalesAgentMessage } from '@/lib/sales-agent/contracts/message'

type DisplayMessage = SalesAgentMessage & { id: string; pending?: boolean; error?: boolean }

const SUGGESTIONS = [
  'Tư vấn mẫu xe phù hợp',
  'So sánh pin và tốc độ',
  'Giá xe hiện tại',
  'Phụ kiện nên mua',
]

const BOTTOM_THRESHOLD = 48

function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_THRESHOLD
}

function parseSseChunk(buffer: string, onEvent: (payload: Record<string, unknown>) => void) {
  const chunks = buffer.split('\n\n')
  const remainder = chunks.pop() ?? ''
  for (const chunk of chunks) {
    const line = chunk.split('\n').find((item) => item.startsWith('data: '))
    if (!line) continue
    try {
      const payload = JSON.parse(line.slice(6)) as Record<string, unknown>
      onEvent(payload)
    } catch (error) {
      // A malformed provider event is ignored, but errors raised by onEvent
      // must bubble up so the UI can leave the pending state.
      if (error instanceof SyntaxError) continue
      throw error
    }
  }
  return remainder
}

export function SalesAgentShell() {
  const open = useSalesAgentStore((state) => state.open)
  const setOpen = useSalesAgentStore((state) => state.setOpen)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followBottomRef = useRef(true)
  const autoScrollUntilRef = useRef(0)
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  const scrollToLatest = useCallback(() => {
    const list = listRef.current
    if (!list) return
    followBottomRef.current = true
    autoScrollUntilRef.current = Date.now() + 250
    setShowScrollButton(false)
    list.scrollTop = list.scrollHeight
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (!followBottomRef.current) return
      scrollToLatest()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [open, scrollToLatest])

  useLayoutEffect(() => {
    if (!open || !followBottomRef.current) return
    scrollToLatest()
  }, [messages, open, scrollToLatest])

  if (!salesAgentUiEnabled) return null

  async function send(messageOverride?: string) {
    const message = (messageOverride ?? draft).trim()
    if (!message || sending) return
    followBottomRef.current = true
    setShowScrollButton(false)
    setDraft('')
    const assistantId = crypto.randomUUID()
    const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: message }
    const assistantMessage: DisplayMessage = { id: assistantId, role: 'assistant', content: '', pending: true }
    const history = messages.filter((item) => !item.pending).slice(-20).map(({ role, content }) => ({ role, content }))
    setMessages((items) => [...items, userMessage, assistantMessage])
    setSending(true)
    try {
      const response = await fetch('/api/v1/sales-agent/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, guestHistory: history, pageContext: { routeKey: pathname }, locale: 'vi-VN' }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? 'Agent chưa sẵn sàng.')
      }
      if (!response.body) throw new Error('Không nhận được luồng trả lời từ agent.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedText = false
      let receivedDone = false
      while (true) {
        const part = await reader.read()
        if (part.done) break
        buffer += decoder.decode(part.value, { stream: true })
        buffer = parseSseChunk(buffer, (payload) => {
          if (payload.type === 'text_delta' && typeof payload.delta === 'string') {
            receivedText = receivedText || payload.delta.length > 0
            setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: item.content + payload.delta } : item))
          }
          if (payload.type === 'done') receivedDone = true
          if (payload.type === 'error' && typeof payload.message === 'string') throw new Error(payload.message)
        })
      }
      // Flush a final UTF-8 code point and parse the last SSE event even when
      // the stream closes without an extra blank line.
      buffer += decoder.decode()
      if (buffer.trim()) {
        parseSseChunk(`${buffer}\n\n`, (payload) => {
          if (payload.type === 'text_delta' && typeof payload.delta === 'string') {
            receivedText = receivedText || payload.delta.length > 0
            setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: item.content + payload.delta } : item))
          }
          if (payload.type === 'done') receivedDone = true
          if (payload.type === 'error' && typeof payload.message === 'string') throw new Error(payload.message)
        })
      }
      if (!receivedDone || !receivedText) throw new Error('Không nhận được câu trả lời từ agent.')
      setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, pending: false } : item))
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : 'Agent tạm thời chưa thể trả lời.'
      setToasts((items) => [...items, { id: Date.now(), kind: 'error', title: 'Không thể trả lời', message: messageText }])
      setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, pending: false, error: true, content: item.content || 'Chưa thể nhận câu trả lời.' } : item))
    } finally {
      setSending(false)
    }
  }

  return <AnimatePresence>
    {open && <>
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <motion.button type="button" aria-label="Đóng Sales Agent" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[1px] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} />
      <motion.aside role="dialog" aria-label="Trợ lý mua xe FASTLANE" className="fixed inset-x-3 bottom-3 z-[61] flex h-[min(620px,calc(100dvh-24px))] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:inset-x-auto md:inset-y-auto md:right-4 md:bottom-4 md:h-[min(680px,calc(100dvh-2rem))] md:w-[380px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-2.5"><span className="rounded-lg bg-brand-500/20 p-2 text-brand-300"><Bot size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">Trợ lý mua xe</p><p className="truncate text-[11px] text-slate-400">Xe · phụ kiện · thủ tục</p></div></div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label="Đóng Sales Agent"><X size={18} /></button>
        </div>
        <div
          ref={listRef}
          className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50/70 p-3"
          style={{ overflowAnchor: showScrollButton ? 'auto' : 'none' }}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={(event) => {
            const nearBottom = isNearBottom(event.currentTarget)
            if (nearBottom) {
              followBottomRef.current = true
              setShowScrollButton(false)
              return
            }
            if (Date.now() <= autoScrollUntilRef.current) return
            followBottomRef.current = false
            setShowScrollButton(true)
          }}
          onWheel={(event) => {
            const target = event.target instanceof Element ? event.target : null
            if (target?.closest('[data-scrollable], .katex-display')) return
            if (event.deltaY >= 0) return
            if (event.currentTarget.scrollHeight - event.currentTarget.clientHeight <= 1) return
            autoScrollUntilRef.current = 0
            followBottomRef.current = false
            setShowScrollButton(true)
          }}
          onTouchMove={(event) => {
            const target = event.target instanceof Element ? event.target : null
            if (target?.closest('[data-scrollable], .katex-display')) return
            if (event.currentTarget.scrollHeight - event.currentTarget.clientHeight <= 1) return
            autoScrollUntilRef.current = 0
            followBottomRef.current = false
            setShowScrollButton(true)
          }}
        >
          <div ref={contentRef} className="min-w-0 space-y-2">
          {!messages.length && <div className="min-w-0 space-y-2.5"><div className="py-2 text-sm leading-5 text-slate-700">Xin chào! Tôi có thể giúp bạn tìm xe, so sánh thông số, xem giá và chọn phụ kiện.</div><div className="flex flex-wrap gap-1.5">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={sending} onClick={() => void send(suggestion)} className="rounded-full border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{suggestion}</button>)}</div></div>}
          {messages.map((item) => <div key={item.id} className={`flex min-w-0 ${item.role === 'user' ? 'justify-end' : 'w-full justify-start'}`}><div className={`min-w-0 max-w-full ${item.role === 'user' ? 'max-w-[84%] overflow-hidden rounded-2xl rounded-br-md bg-slate-900 px-3 py-2.5 text-white' : item.error ? 'w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5' : 'w-full py-2'}`}>{item.role === 'assistant' ? <MarkdownMessage content={item.content || 'Đang tra cứu…'} streaming={item.pending} /> : <p className="whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">{item.content}</p>}{item.pending && <Loader2 size={13} className="mt-1.5 animate-spin text-brand-600" aria-label="Đang tải" />}</div></div>)}
          </div>
        </div>
        <div className="relative">
          {showScrollButton && <button type="button" onClick={scrollToLatest} className="absolute -top-11 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Cuộn đến tin nhắn mới nhất"><ArrowDown size={15} /></button>}
          <form onSubmit={(event) => { event.preventDefault(); void send() }} className="border-t border-slate-200 p-3"><div className="flex min-w-0 items-end gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 2_000))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} disabled={sending} rows={1} placeholder={sending ? 'Đang trả lời…' : 'Nhập câu hỏi…'} className="min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1 text-sm leading-5 outline-none disabled:cursor-not-allowed disabled:opacity-60" aria-label="Câu hỏi cho Sales Agent" /><Button type="submit" size="icon" disabled={!draft.trim() || sending} className="h-9 w-9 shrink-0 bg-brand-600 text-white hover:bg-brand-700" aria-label="Gửi câu hỏi"><ArrowUp size={16} /></Button></div><p className="mt-1.5 text-[10px] text-slate-400">Không gửi CCCD, OTP, thẻ hoặc mật khẩu.</p></form>
        </div>
      </motion.aside>
    </>}
  </AnimatePresence>
}
