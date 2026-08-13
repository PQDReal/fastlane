'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Bot, Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { MarkdownMessage } from './markdown-message'
import { salesAgentUiEnabled, useSalesAgentStore } from '@/lib/sales-agent/store'
import { limitSalesAgentHistory, type SalesAgentMessage } from '@/lib/sales-agent/contracts/message'
import { getVisibleSalesAgentInteractionOptions, SALES_AGENT_INTERACTION_VISIBLE_OPTIONS } from '@/lib/sales-agent/contracts/interaction-view'

type InteractionOption = { optionId: string; label: string; description?: string; recommended?: boolean }
type DisplayInteraction = {
  interactionId: string
  mode: 'single' | 'multiple'
  slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage'
  title: string
  description?: string
  minSelections: number
  maxSelections: number
  allowFreeText: boolean
  submitLabel: string
  options: InteractionOption[]
  continuationToken: string
  expiresAt: string
  submitted?: boolean
}
type DisplayMessage = SalesAgentMessage & { id: string; pending?: boolean; error?: boolean; interaction?: DisplayInteraction }
type InteractionSubmission = { selectedOptionIds: string[]; freeText?: string }
type InteractionSearchResult = DisplayInteraction
type InteractionSearchCallback = (result: InteractionSearchResult, selectedOptionIds: string[]) => void

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

function ChoiceInteraction({ interaction, conversationId, disabled, onSubmit, onSearchResult }: { interaction: DisplayInteraction; conversationId?: string; disabled: boolean; onSubmit: (selection: InteractionSubmission) => void; onSearchResult: InteractionSearchCallback }) {
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const searchSequenceRef = useRef(0)
  const interactionTokenRef = useRef(interaction.continuationToken)
  const selectedOptionIdsRef = useRef(selectedOptionIds)
  const onSearchResultRef = useRef(onSearchResult)
  interactionTokenRef.current = interaction.continuationToken
  selectedOptionIdsRef.current = selectedOptionIds
  onSearchResultRef.current = onSearchResult
  const selectionCount = selectedOptionIds.length
  const canSubmit = selectionCount >= interaction.minSelections && selectionCount <= interaction.maxSelections
  const displayOptions = getVisibleSalesAgentInteractionOptions(interaction.options, selectedOptionIds, expanded)

  useEffect(() => {
    if (interaction.slot !== 'vehicles' && interaction.slot !== 'vehicle') return
    const query = searchQuery.trim()
    if (query.length < 2 || !conversationId || interaction.submitted) return
    const sequence = searchSequenceRef.current + 1
    searchSequenceRef.current = sequence
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      void fetch('/api/v1/sales-agent/interactions/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, continuationToken: interactionTokenRef.current, query, selectedOptionIds: selectedOptionIdsRef.current }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return
        const result = await response.json() as InteractionSearchResult
        if (searchSequenceRef.current === sequence) onSearchResultRef.current(result, selectedOptionIdsRef.current)
      }).catch(() => undefined).finally(() => {
        if (searchSequenceRef.current === sequence) setSearching(false)
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [conversationId, interaction.slot, interaction.submitted, searchQuery])

  function toggle(optionId: string) {
    if (disabled || interaction.submitted) return
    if (interaction.mode === 'single') {
      setSelectedOptionIds([optionId])
      setShowValidation(false)
      return
    }
    setSelectedOptionIds((current) => current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : current.length >= interaction.maxSelections ? current : [...current, optionId])
    setShowValidation(false)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit && !interaction.allowFreeText) {
      setShowValidation(true)
      return
    }
    onSubmit({ selectedOptionIds, ...(freeText.trim() ? { freeText: freeText.trim() } : {}) })
  }

  if (interaction.submitted) {
    const selectedLabels = selectedOptionIds.map((optionId) => interaction.options.find((option) => option.optionId === optionId)?.label).filter(Boolean)
    return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5" aria-label={`${interaction.title}, đã chọn`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-emerald-900">Đã chọn: {selectedLabels.join(', ') || freeText || 'Câu trả lời riêng'}</p><Check size={15} className="shrink-0 text-emerald-600" aria-hidden="true" /></div></div>
  }

  return <form onSubmit={submit} aria-label={interaction.title} className="mt-3 rounded-xl border border-brand-200 bg-white p-3">
    <div className="flex items-start justify-between gap-2">
      <div><p className="text-sm font-semibold text-slate-800">{interaction.title}</p>{interaction.description && <p className="mt-1 text-xs leading-4 text-slate-500">{interaction.description}</p>}</div>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500" aria-label={`${selectionCount} trên ${interaction.maxSelections} lựa chọn`}>{interaction.mode === 'single' ? (selectionCount ? 'Đã chọn 1 mẫu' : 'Chọn 1 mẫu') : `${selectionCount}/${interaction.maxSelections} đã chọn`}</span>
    </div>
    <div className="mt-2 space-y-1.5" role={interaction.mode === 'multiple' ? 'group' : 'radiogroup'} aria-label={interaction.title}>
      {displayOptions.map((option) => {
        const selected = selectedOptionIds.includes(option.optionId)
        return <button key={option.optionId} type="button" role={interaction.mode === 'multiple' ? 'checkbox' : 'radio'} aria-checked={selected} disabled={disabled || interaction.submitted} onClick={() => toggle(option.optionId)} className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'}`}>
          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${interaction.mode === 'multiple' ? 'rounded-sm' : 'rounded-full'} ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent'}`} aria-hidden="true">{selected && <Check size={11} strokeWidth={3} />}</span>
          <span className="min-w-0"><span className="block text-xs font-medium text-slate-800">{option.label}{option.recommended && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Gợi ý</span>}</span>{option.description && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{option.description}</span>}</span>
        </button>
      })}
    </div>
    {interaction.allowFreeText && <input value={freeText} onChange={(event) => setFreeText(event.target.value.slice(0, 500))} disabled={disabled || interaction.submitted} placeholder="Hoặc nhập câu trả lời…" className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60" aria-label="Câu trả lời nhập thêm" />}
    {(interaction.slot === 'vehicles' || interaction.slot === 'vehicle') && <div className="mt-2"><label htmlFor={`sales-agent-interaction-search-${interaction.interactionId}`} className="sr-only">Tìm thêm mẫu xe</label><input id={`sales-agent-interaction-search-${interaction.interactionId}`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value.slice(0, 120))} disabled={disabled} placeholder="Tìm thêm mẫu xe…" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60" />{searching && <p className="mt-1 text-[10px] text-slate-500" aria-live="polite">Đang tìm mẫu xe…</p>}</div>}
    {interaction.options.length > SALES_AGENT_INTERACTION_VISIBLE_OPTIONS && <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 min-h-8 rounded-md px-1 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{expanded ? 'Thu gọn' : `Xem thêm ${interaction.options.length - SALES_AGENT_INTERACTION_VISIBLE_OPTIONS} lựa chọn`}</button>}
    {showValidation && <p className="mt-2 text-[11px] text-red-600" role="alert">Vui lòng chọn từ {interaction.minSelections} đến {interaction.maxSelections} lựa chọn.</p>}
    <button type="submit" disabled={disabled || interaction.submitted || (!canSubmit && !interaction.allowFreeText)} className="mt-2 min-h-9 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50">{interaction.submitLabel}</button>
  </form>
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
  const conversationIdRef = useRef<string | undefined>(undefined)

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

  async function send(messageOverride?: string, interactionResponse?: { interactionId: string; selectedOptionIds: string[]; freeText?: string; continuationToken: string }) {
    const message = (messageOverride ?? draft).trim()
    if (!message || sending) return
    followBottomRef.current = true
    setShowScrollButton(false)
    setDraft('')
    const assistantId = crypto.randomUUID()
    const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: message }
    const assistantMessage: DisplayMessage = { id: assistantId, role: 'assistant', content: '', pending: true }
    const history = limitSalesAgentHistory(messages.filter((item) => !item.pending).map(({ role, content }) => ({ role, content })))
    setMessages((items) => [...items, userMessage, assistantMessage])
    setSending(true)
    try {
      const response = await fetch('/api/v1/sales-agent/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId: conversationIdRef.current, guestHistory: history, interactionResponse, pageContext: { routeKey: pathname }, locale: 'vi-VN' }),
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
          if (payload.type === 'meta' && typeof payload.conversationId === 'string') conversationIdRef.current = payload.conversationId
          if (payload.type === 'interaction' && payload.interaction && typeof payload.interaction === 'object') {
            setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, interaction: payload.interaction as DisplayInteraction } : item))
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
          if (payload.type === 'meta' && typeof payload.conversationId === 'string') conversationIdRef.current = payload.conversationId
          if (payload.type === 'interaction' && payload.interaction && typeof payload.interaction === 'object') {
            setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, interaction: payload.interaction as DisplayInteraction } : item))
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

  function updateInteractionSearch(messageId: string, current: DisplayInteraction, result: InteractionSearchResult, selectedOptionIds: string[]) {
    setMessages((items) => items.map((item) => {
      if (item.id !== messageId || !item.interaction) return item
      const selectedIds = new Set(selectedOptionIds)
      const merged = [...result.options, ...current.options.filter((option) => selectedIds.has(option.optionId))]
      const unique = [...new Map(merged.map((option) => [option.optionId, option])).values()]
      const selectedOptions = unique.filter((option) => selectedIds.has(option.optionId))
      const otherOptions = unique.filter((option) => !selectedIds.has(option.optionId))
      return { ...item, interaction: { ...result, options: [...otherOptions.slice(0, Math.max(0, 8 - selectedOptions.length)), ...selectedOptions].slice(0, 8) } }
    }))
  }

  function submitInteraction(messageId: string, interaction: DisplayInteraction, selection: InteractionSubmission) {
    const labels = selection.selectedOptionIds.map((optionId) => interaction.options.find((option) => option.optionId === optionId)?.label).filter(Boolean)
    const message = selection.freeText || labels.join(', ')
    if (!message) return
    setMessages((items) => items.map((item) => item.id === messageId && item.interaction ? { ...item, interaction: { ...item.interaction, submitted: true } } : item))
    void send(message, { interactionId: interaction.interactionId, selectedOptionIds: selection.selectedOptionIds, ...(selection.freeText ? { freeText: selection.freeText } : {}), continuationToken: interaction.continuationToken })
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
          {messages.map((item) => <div key={item.id} className={`flex min-w-0 ${item.role === 'user' ? 'justify-end' : 'w-full justify-start'}`}><div className={`min-w-0 max-w-full ${item.role === 'user' ? 'max-w-[84%] overflow-hidden rounded-2xl rounded-br-md bg-slate-900 px-3 py-2.5 text-white' : item.error ? 'w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5' : 'w-full py-2'}`}>{item.role === 'assistant' ? <MarkdownMessage content={item.content || 'Đang tra cứu…'} streaming={item.pending} /> : <p className="whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">{item.content}</p>}{item.interaction && <ChoiceInteraction interaction={item.interaction} conversationId={conversationIdRef.current} disabled={sending} onSearchResult={(result, selectedOptionIds) => updateInteractionSearch(item.id, item.interaction!, result, selectedOptionIds)} onSubmit={(selection) => void submitInteraction(item.id, item.interaction!, selection)} />}{item.pending && <Loader2 size={13} className="mt-1.5 animate-spin text-brand-600" aria-label="Đang tải" />}</div></div>)}
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
