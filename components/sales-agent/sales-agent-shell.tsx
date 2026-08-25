'use client'

import { AnimatePresence, motion, useReducedMotion, useDragControls } from 'framer-motion'
import { ArrowDown, ArrowUp, Bot, CalendarDays, Car, Check, CheckCircle2, ChevronDown, ChevronRight, Loader2, Maximize2, Minimize2, RotateCcw, ShieldCheck, Sparkles, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { MarkdownMessage } from './markdown-message'
import { ProductCardBlock } from './product-card-block'
import { ComparisonCardBlock } from './comparison-card-block'
import { KnowledgeCitationBlock } from './knowledge-citation-block'
import { KnowledgeMediaBlock } from './knowledge-media-block'
import { SuggestionChips } from './suggestion-chips'
import { ActionButtons } from './action-buttons'
import { salesAgentUiEnabled, useSalesAgentStore } from '@/lib/sales-agent/store'
import { limitSalesAgentHistory, type SalesAgentMessage } from '@/lib/sales-agent/contracts/turn'
import { getVisibleSalesAgentInteractionOptions, SALES_AGENT_INTERACTION_VISIBLE_OPTIONS, type SalesAgentInteractionMetric } from '@/lib/sales-agent/contracts/interaction'
import type { AssistantBlock, SalesAgentAction, SalesAgentSuggestion, TurnViewModel } from '@/lib/sales-agent/contracts'

type InteractionOption = { optionId: string; label: string; description?: string; recommended?: boolean; field?: 'vehicleModel' | 'modelYear'; value?: string; metadata?: Record<string, unknown> }
type DisplayInteractionField = { field: 'vehicleModel' | 'modelYear'; label: string; required: boolean; dependsOn?: 'vehicleModel'; options: InteractionOption[] }
type DisplayInteraction = {
  interactionId: string
  mode: 'single' | 'multiple' | 'SINGLE' | 'MULTIPLE'
  slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage' | 'knowledge_scope' | string
  title: string
  description?: string
  minSelections: number
  maxSelections: number
  allowFreeText: boolean
  submitLabel: string
  options: InteractionOption[]
  fields?: DisplayInteractionField[]
  continuationToken: string
  expiresAt: string
  submitted?: boolean
}
type DisplayMessage = SalesAgentMessage & {
  id: string
  pending?: boolean
  error?: boolean
  statusText?: string
  interaction?: DisplayInteraction
  blocks?: AssistantBlock[]
  actions?: SalesAgentAction[]
  suggestions?: SalesAgentSuggestion[]
}
type InteractionSubmission = { selectedOptionIds: string[]; freeText?: string }
type InteractionSearchResult = DisplayInteraction
type InteractionSearchCallback = (result: InteractionSearchResult, selectedOptionIds: string[]) => void
type FloatingPosition = { left: number; top: number }
const FLOATING_BUTTON_GRID_SIZE = 32
const FLOATING_BUTTON_LEFT_PADDING = 0
const FLOATING_BUTTON_RIGHT_PADDING = 24
const FLOATING_BUTTON_VERTICAL_PADDING = 0

const SUGGESTIONS = [
  'Tư vấn mẫu xe phù hợp',
  'So sánh pin và tốc độ',
  'Giá xe hiện tại',
  'Phụ kiện nên mua',
]

function getToolStatusLabel(tool: string): string {
  switch (tool) {
    case 'thinking':
      return 'Đang phân tích câu hỏi & lập kế hoạch…'
    case 'browse_catalog':
      return 'Đang tra cứu danh mục & bảng giá xe…'
    case 'resolve_catalog_entities':
      return 'Đang tìm kiếm dòng xe trong catalog…'
    case 'get_product_details':
      return 'Đang lấy thông số kỹ thuật & giá bán…'
    case 'compare_products':
      return 'Đang đối chiếu dữ liệu pin & động cơ…'
    case 'discover_accessories':
      return 'Đang tìm phụ kiện tương thích…'
    case 'get_current_promotions':
      return 'Đang kiểm tra chương trình ưu đãi…'
    case 'search_knowledge':
      return 'Đang tra cứu sổ tay và chính sách FASTLANE…'
    case 'composing':
      return 'Đang tổng hợp thông tin câu trả lời…'
    default:
      return 'Đang xử lý dữ liệu…'
  }
}

const BOTTOM_THRESHOLD = 48
function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_THRESHOLD
}

function selectionFingerprint(optionIds: string[]) {
  return [...new Set(optionIds)].sort().join('|')
}

function emitInteractionMetric(metric: SalesAgentInteractionMetric) {
  void fetch('/api/v1/sales-agent/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metric),
    keepalive: true,
  }).catch(() => undefined)
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
  const freeTextMetricSentRef = useRef(false)
  const submittedMetricRef = useRef(Boolean(interaction.submitted))
  const abandonmentTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  interactionTokenRef.current = interaction.continuationToken
  selectedOptionIdsRef.current = selectedOptionIds
  onSearchResultRef.current = onSearchResult
  submittedMetricRef.current = Boolean(interaction.submitted)
  const isMultipleMode = interaction.mode.toLowerCase() === 'multiple'
  const selectionCount = selectedOptionIds.length
  const canSubmit = selectionCount >= interaction.minSelections && selectionCount <= interaction.maxSelections
  const displayOptions = getVisibleSalesAgentInteractionOptions(interaction.options, selectedOptionIds, expanded)

  useEffect(() => {
    if (abandonmentTimerRef.current) clearTimeout(abandonmentTimerRef.current)
    emitInteractionMetric({ event: 'interaction_viewed', slot: interaction.slot, mode: interaction.mode, resultCount: interaction.options.length })
    return () => {
      abandonmentTimerRef.current = setTimeout(() => {
        if (!submittedMetricRef.current) emitInteractionMetric({ event: 'interaction_abandoned', slot: interaction.slot, mode: interaction.mode })
      }, 0)
    }
  }, [interaction.interactionId])

  useEffect(() => {
    if (interaction.slot !== 'vehicles' && interaction.slot !== 'vehicle') return
    const query = searchQuery.trim()
    if (query.length < 2 || !conversationId || interaction.submitted) return
    const sequence = searchSequenceRef.current + 1
    searchSequenceRef.current = sequence
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const requestSelectedOptionIds = selectedOptionIdsRef.current
      const requestSelectionFingerprint = selectionFingerprint(requestSelectedOptionIds)
      setSearching(true)
      emitInteractionMetric({ event: 'interaction_search', slot: interaction.slot, mode: interaction.mode })
      void fetch('/api/v1/sales-agent/interactions/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, continuationToken: interactionTokenRef.current, query, selectedOptionIds: requestSelectedOptionIds }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return
        const result = await response.json() as InteractionSearchResult
        if (searchSequenceRef.current === sequence && selectionFingerprint(selectedOptionIdsRef.current) === requestSelectionFingerprint) {
          onSearchResultRef.current(result, requestSelectedOptionIds)
        }
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
    if (!isMultipleMode) {
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
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500" aria-label={`${selectionCount} trên ${interaction.maxSelections} lựa chọn`}>{!isMultipleMode ? (selectionCount ? 'Đã chọn 1 mẫu' : 'Chọn 1 mẫu') : `${selectionCount}/${interaction.maxSelections} đã chọn`}</span>
    </div>
    <div className="mt-2 space-y-1.5" role={isMultipleMode ? 'group' : 'radiogroup'} aria-label={interaction.title}>
      {displayOptions.map((option) => {
        const selected = selectedOptionIds.includes(option.optionId)
        return <button key={option.optionId} type="button" role={isMultipleMode ? 'checkbox' : 'radio'} aria-checked={selected} disabled={disabled || interaction.submitted} onClick={() => toggle(option.optionId)} className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'}`}>
          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${isMultipleMode ? 'rounded-sm' : 'rounded-full'} ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent'}`} aria-hidden="true">{selected && <Check size={11} strokeWidth={3} />}</span>
          <span className="min-w-0"><span className="block text-xs font-medium text-slate-800">{option.label}{option.recommended && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Gợi ý</span>}</span>{option.description && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{option.description}</span>}</span>
        </button>
      })}
    </div>
    {interaction.allowFreeText && <input value={freeText} onChange={(event) => { const value = event.target.value.slice(0, 500); setFreeText(value); if (value.trim() && !freeTextMetricSentRef.current) { freeTextMetricSentRef.current = true; emitInteractionMetric({ event: 'interaction_free_text', slot: interaction.slot, mode: interaction.mode }) } }} disabled={disabled || interaction.submitted} placeholder="Hoặc nhập câu trả lời…" className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60" aria-label="Câu trả lời nhập thêm" />}
    {(interaction.slot === 'vehicles' || interaction.slot === 'vehicle') && <div className="mt-2"><label htmlFor={`sales-agent-interaction-search-${interaction.interactionId}`} className="sr-only">Tìm thêm mẫu xe</label><input id={`sales-agent-interaction-search-${interaction.interactionId}`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value.slice(0, 120))} disabled={disabled} placeholder="Tìm thêm mẫu xe…" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60" />{searching && <p className="mt-1 text-[10px] text-slate-500" aria-live="polite">Đang tìm mẫu xe…</p>}</div>}
    {interaction.options.length > SALES_AGENT_INTERACTION_VISIBLE_OPTIONS && <button type="button" onClick={() => setExpanded((value) => { const next = !value; emitInteractionMetric({ event: next ? 'interaction_expanded' : 'interaction_collapsed', slot: interaction.slot, mode: interaction.mode, resultCount: interaction.options.length }); return next })} className="mt-2 min-h-8 rounded-md px-1 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{expanded ? 'Thu gọn' : `Xem thêm ${interaction.options.length - SALES_AGENT_INTERACTION_VISIBLE_OPTIONS} lựa chọn`}</button>}
    {showValidation && <p className="mt-2 text-[11px] text-red-600" role="alert">Vui lòng chọn từ {interaction.minSelections} đến {interaction.maxSelections} lựa chọn.</p>}
    <button type="submit" disabled={disabled || interaction.submitted || (!canSubmit && !interaction.allowFreeText)} className="mt-2 min-h-9 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50">{interaction.submitLabel}</button>
  </form>
}

function ScopeChoiceInteraction({ interaction, disabled, onSubmit }: { interaction: DisplayInteraction; disabled: boolean; onSubmit: (selection: InteractionSubmission) => void }) {
  const fields = interaction.fields ?? []
  const [selectedByField, setSelectedByField] = useState<Record<string, string>>({})
  const [showValidation, setShowValidation] = useState(false)
  const selectedModel = selectedByField.vehicleModel
  const selectedYear = selectedByField.modelYear
  const vehicleField = fields.find((field) => field.field === 'vehicleModel')
  const yearField = fields.find((field) => field.field === 'modelYear')
  const selectedModelOption = vehicleField?.options.find((option) => option.optionId === selectedModel)
  const selectedModelValue = selectedModelOption?.value || selectedModelOption?.label || selectedModel

  const yearOptions = useMemo(() => {
    if (!yearField || !selectedModelValue) return []
    const filtered = yearField.options.filter((option) => {
      const model = option.metadata?.vehicleModel
      return !model || String(model) === String(selectedModelValue)
    })
    return filtered.length > 0 ? filtered : yearField.options
  }, [selectedModelValue, yearField])

  const selectedYearOption = yearOptions.find((option) => option.optionId === selectedYear)
  const asksForYear = Boolean(selectedModel && yearField && yearOptions.length > 1)
  const autoSelectedYear = selectedModel && yearOptions.length === 1 ? yearOptions[0] : undefined
  const yearLabel = (option?: InteractionOption) => option?.value || option?.label || ''

  useEffect(() => {
    if (vehicleField?.options.length === 1) {
      const singleton = vehicleField.options[0].optionId
      setSelectedByField((current) => current.vehicleModel === singleton
        ? current
        : { ...current, vehicleModel: singleton })
    }
  }, [vehicleField])

  useEffect(() => {
    if (!selectedModel || !yearField) return
    if (yearOptions.length === 1 && selectedYear !== yearOptions[0].optionId) {
      setSelectedByField((current) => ({ ...current, modelYear: yearOptions[0].optionId }))
    } else if (selectedYear && !yearOptions.some((option) => option.optionId === selectedYear)) {
      setSelectedByField((current) => ({ ...current, modelYear: '' }))
    }
  }, [selectedModel, selectedYear, yearField, yearOptions])

  const requiredFields = fields.filter((field) => field.required)
  const canSubmit = requiredFields.every((field) => Boolean(selectedByField[field.field]))
  const selectedIds = fields.map((field) => selectedByField[field.field]).filter(Boolean)
  const optionLabel = (field: DisplayInteractionField, optionId: string) => field.options.find((option) => option.optionId === optionId)?.label

  if (interaction.submitted) {
    const labels = fields.map((field) => optionLabel(field, selectedByField[field.field])).filter(Boolean)
    return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5" aria-label={`${interaction.title}, đã chọn`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-emerald-900">Đã chọn: {labels.join(' · ')}</p><Check size={15} className="shrink-0 text-emerald-600" aria-hidden="true" /></div></div>
  }

  return <form onSubmit={(event) => { event.preventDefault(); if (!canSubmit) { setShowValidation(true); return }; onSubmit({ selectedOptionIds: selectedIds }) }} aria-label={interaction.title} className="mt-3 rounded-xl border border-brand-200 bg-white p-3 shadow-sm">
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true"><Car size={16} /></span>
      <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{interaction.title}</p>{interaction.description && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{interaction.description}</p>}</div>
    </div>

    <div className={`mt-3 grid gap-2 ${asksForYear ? 'grid-cols-1 min-[420px]:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)]' : 'grid-cols-1'}`}>
      {vehicleField && <label htmlFor={`${interaction.interactionId}-vehicle-model`} className="min-w-0">
        <span className="mb-1 block text-[11px] font-semibold text-slate-600">{vehicleField.label}</span>
        <span className="relative block">
          <Car className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <select id={`${interaction.interactionId}-vehicle-model`} value={selectedModel || ''} disabled={disabled} onChange={(event) => { setSelectedByField((current) => ({ ...current, vehicleModel: event.target.value, modelYear: '' })); setShowValidation(false) }} aria-invalid={showValidation && !selectedModel} className="h-10 w-full appearance-none truncate rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs font-medium text-slate-800 outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">Chọn dòng xe</option>
            {vehicleField.options.map((option) => <option key={option.optionId} value={option.optionId}>{option.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </span>
      </label>}

      <AnimatePresence initial={false}>
        {asksForYear && <motion.label key="scope-year" htmlFor={`${interaction.interactionId}-model-year`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }} className="min-w-0">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{yearField?.label}</span>
          <span className="relative block">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <select id={`${interaction.interactionId}-model-year`} value={selectedYear || ''} disabled={disabled} onChange={(event) => { setSelectedByField((current) => ({ ...current, modelYear: event.target.value })); setShowValidation(false) }} aria-invalid={showValidation && !selectedYear} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs font-medium text-slate-800 outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">Chọn năm</option>
              {yearOptions.map((option) => <option key={option.optionId} value={option.optionId}>{yearLabel(option)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          </span>
        </motion.label>}
      </AnimatePresence>
    </div>

    {autoSelectedYear && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><CalendarDays size={13} className="text-brand-600" aria-hidden="true" />Năm áp dụng: <span className="font-semibold text-slate-700">{yearLabel(autoSelectedYear)}</span></p>}
    {selectedModelOption && selectedYearOption && !autoSelectedYear && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 size={13} aria-hidden="true" /><span className="truncate">{selectedModelOption.label} · {yearLabel(selectedYearOption)}</span></p>}
    {showValidation && <p className="mt-2 text-[11px] text-red-600" role="alert">Vui lòng chọn đủ dòng xe và năm áp dụng.</p>}
    <button type="submit" disabled={disabled || !canSubmit} className="mt-3 min-h-10 w-full rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50">{interaction.submitLabel}</button>
  </form>
}

function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function SalesAgentShell() {
  const open = useSalesAgentStore((state) => state.open)
  const setOpen = useSalesAgentStore((state) => state.setOpen)
  const position = useSalesAgentStore((state) => state.position)
  const setPosition = useSalesAgentStore((state) => state.setPosition)

  const handleDragEnd = (event: any, info: any) => {
    setPosition({
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    })
  }
  const dragControls = useDragControls()
  const [isExpanded, setIsExpanded] = useState(false)
  

  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const followBottomRef = useRef(true)
  const autoScrollUntilRef = useRef(0)
  const pathname = usePathname()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Calculate bounds to prevent chat window from going completely off-screen
  let chatX = isMounted && !isExpanded ? position.x : 0
  let chatY = isMounted && !isExpanded ? position.y : 0
  let dragConstraints = { top: 0, bottom: 0, left: 0, right: 0 }
  if (typeof window !== 'undefined' && !isExpanded && isMounted) {
    const isDesktop = window.innerWidth >= 768
    const paddingX = isDesktop ? 16 : 12
    const paddingY = isDesktop ? 16 : 12
    const chatWidth = isDesktop ? 420 : window.innerWidth - (paddingX * 2)
    const chatHeight = isDesktop ? Math.min(680, window.innerHeight - 32) : Math.min(620, window.innerHeight - 24)

    const minY = Math.min(0, -(window.innerHeight - chatHeight - paddingY * 2))
    const maxY = 0
    const minX = Math.min(0, -(window.innerWidth - chatWidth - paddingX * 2))
    const maxX = 0

    dragConstraints = { top: minY, bottom: maxY, left: minX, right: maxX }

    if (chatY < minY) chatY = minY
    if (chatY > maxY) chatY = maxY
    
    if (chatX < minX) chatX = minX
    if (chatX > maxX) chatX = maxX
  }
  const reduceMotion = useReducedMotion()
  const conversationIdRef = useRef<string | undefined>(undefined)
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition | null>(null)
  const [isFloatingDragging, setIsFloatingDragging] = useState(false)
  const latestFloatingPositionRef = useRef<FloatingPosition | null>(null)
  const floatingButtonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressFloatingClickRef = useRef(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('fastlane-sales-agent-position')
      if (saved) {
        const position = JSON.parse(saved) as FloatingPosition
        setFloatingPosition(position)
        latestFloatingPositionRef.current = position
      }
    } catch {
      // Ignore unavailable or malformed local storage values.
    }
  }, [])

  useLayoutEffect(() => {
    const button = floatingButtonRef.current
    if (!button || !floatingPosition) return
    const width = button.offsetWidth
    const height = button.offsetHeight
    const clampedPosition = {
      left: Math.max(FLOATING_BUTTON_LEFT_PADDING, Math.min(window.innerWidth - width - FLOATING_BUTTON_RIGHT_PADDING, floatingPosition.left)),
      top: Math.max(FLOATING_BUTTON_VERTICAL_PADDING, Math.min(window.innerHeight - height - FLOATING_BUTTON_VERTICAL_PADDING, floatingPosition.top)),
    }
    if (clampedPosition.left === floatingPosition.left && clampedPosition.top === floatingPosition.top) return
    latestFloatingPositionRef.current = clampedPosition
    setFloatingPosition(clampedPosition)
    window.localStorage.setItem('fastlane-sales-agent-position', JSON.stringify(clampedPosition))
  }, [floatingPosition])

  const handleFloatingPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    }
    setIsFloatingDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handleFloatingPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.hypot(deltaX, deltaY) < 4) return
    drag.moved = true
    const width = event.currentTarget.offsetWidth
    const height = event.currentTarget.offsetHeight
    const left = Math.max(FLOATING_BUTTON_LEFT_PADDING, Math.min(window.innerWidth - width - FLOATING_BUTTON_RIGHT_PADDING, drag.left + deltaX))
    const top = Math.max(FLOATING_BUTTON_VERTICAL_PADDING, Math.min(window.innerHeight - height - FLOATING_BUTTON_VERTICAL_PADDING, drag.top + deltaY))
    const nextPosition = { left, top }
    latestFloatingPositionRef.current = nextPosition
    setFloatingPosition(nextPosition)
  }, [])

  const handleFloatingPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const latestPosition = latestFloatingPositionRef.current || floatingPosition
    if (drag.moved && latestPosition) {
      const width = event.currentTarget.offsetWidth
      const height = event.currentTarget.offsetHeight
      const snappedPosition = {
        left: Math.max(FLOATING_BUTTON_LEFT_PADDING, Math.min(window.innerWidth - width - FLOATING_BUTTON_RIGHT_PADDING, Math.round(latestPosition.left / FLOATING_BUTTON_GRID_SIZE) * FLOATING_BUTTON_GRID_SIZE)),
        top: Math.max(FLOATING_BUTTON_VERTICAL_PADDING, Math.min(window.innerHeight - height - FLOATING_BUTTON_VERTICAL_PADDING, Math.round(latestPosition.top / FLOATING_BUTTON_GRID_SIZE) * FLOATING_BUTTON_GRID_SIZE)),
      }
      latestFloatingPositionRef.current = snappedPosition
      setFloatingPosition(snappedPosition)
      window.localStorage.setItem('fastlane-sales-agent-position', JSON.stringify(snappedPosition))
      suppressFloatingClickRef.current = true
      window.setTimeout(() => { suppressFloatingClickRef.current = false }, 0)
    }
    dragRef.current = null
    setIsFloatingDragging(false)
  }, [floatingPosition])

  /* free-float mode removed */
  /*
    const toggleFreeFloatMode = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (floatingClickTimerRef.current !== null) {
      window.clearTimeout(floatingClickTimerRef.current)
      floatingClickTimerRef.current = null
    }
    const nextMode = !isFreeFloatMode
    if (nextMode) {
      const rect = event.currentTarget.getBoundingClientRect()
      const position = { left: rect.left, top: rect.top }
      latestFloatingPositionRef.current = position
      setFloatingPosition(position)
      floatVelocityRef.current = { x: 0, y: 0 }
      setFloatRotation(0)
      setIsFloatReleased(true)
    } else {
      floatVelocityRef.current = { x: 0, y: 0 }
      setIsFloatReleased(false)
      setFloatRotation(0)
    }
    setIsFreeFloatMode(nextMode)
    setToasts((items) => [...items, {
      id: Date.now(),
      kind: nextMode ? 'success' : 'warning',
      title: `Chế độ thả trôi: ${nextMode ? 'Bật' : 'Tắt'}`,
      message: nextMode ? 'Chatbot sẽ trôi và bật lại khi chạm cạnh màn hình.' : 'Chatbot đã trở về chế độ kéo thả bình thường.',
    }])
  }, [isFreeFloatMode])

  useEffect(() => {
    if (!isFreeFloatMode || !isFloatReleased || reduceMotion) return
    let frame = 0
    let previousTime = performance.now()
    const tick = (now: number) => {
      const position = latestFloatingPositionRef.current
      const button = floatingButtonRef.current
      if (!position || !button) {
        frame = requestAnimationFrame(tick)
        return
      }
      const delta = Math.min(32, now - previousTime)
      previousTime = now
      const width = button.offsetWidth
      const height = button.offsetHeight
      const velocity = floatVelocityRef.current
      velocity.y += 0.0008 * delta
      let left = position.left + velocity.x * delta
      let top = position.top + velocity.y * delta
      const minLeft = FLOATING_BUTTON_LEFT_PADDING
      const maxLeft = Math.max(minLeft, window.innerWidth - width - FLOATING_BUTTON_RIGHT_PADDING)
      const minTop = FLOATING_BUTTON_VERTICAL_PADDING
      const maxTop = Math.max(minTop, window.innerHeight - height - FLOATING_BUTTON_VERTICAL_PADDING)
      if (left <= minLeft || left >= maxLeft) {
        left = Math.max(minLeft, Math.min(maxLeft, left))
        velocity.x *= -0.58
      }
      if (top <= minTop) {
        top = minTop
        velocity.y = Math.abs(velocity.y) * 0.62
      } else if (top >= maxTop) {
        top = maxTop
        velocity.y *= -0.62
      }
      // Stronger horizontal friction keeps the ball from rolling too far.
      velocity.x *= 0.94
      setFloatRotation((rotation) => rotation + velocity.x * delta * 0.75)
      latestFloatingPositionRef.current = { left, top }
      setFloatingPosition({ left, top })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isFreeFloatMode, isFloatReleased, reduceMotion])
  */

  const SESSION_STORAGE_KEY = 'fastlane_sales_agent_session'
  const SESSION_EXPIRY_MS = 5 * 60 * 1000

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (Date.now() - data.lastActiveAt < SESSION_EXPIRY_MS) {
          setMessages(data.messages)
          conversationIdRef.current = data.conversationId
        } else {
          sessionStorage.removeItem(SESSION_STORAGE_KEY)
        }
      }
    } catch (e) {
      console.warn('Failed to load chat session', e)
    }
  }, [])

  // Save session when messages update
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        messages,
        conversationId: conversationIdRef.current,
        lastActiveAt: Date.now()
      }))
    }
  }, [messages])

  // Auto-expand textarea smoothly up to 5 lines
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '38px'
    if (draft) {
      const scrollH = textarea.scrollHeight
      if (scrollH > 38) {
        textarea.style.height = `${Math.min(scrollH, 120)}px`
      }
    }
  }, [draft])

  const scrollToLatest = useCallback(() => {
    const list = listRef.current
    if (!list) return
    followBottomRef.current = true
    autoScrollUntilRef.current = Date.now() + 250
    setShowScrollButton(false)
    list.scrollTop = list.scrollHeight
  }, [])

  const handleResetChat = useCallback(() => {
    setSending(false)
    setMessages([])
    setDraft('')
    setShowScrollButton(false)
    conversationIdRef.current = undefined
    sessionStorage.removeItem('fastlane_sales_agent_session')
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

  if (!salesAgentUiEnabled || pathname?.startsWith('/admin')) return null

  async function send(messageOverride?: string, interactionResponse?: { interactionId: string; selectedOptionIds: string[]; freeText?: string; continuationToken: string }, suggestionSelection?: SalesAgentSuggestion) {
    const message = (messageOverride ?? draft).trim()
    if (!message || sending) return
    followBottomRef.current = true
    setShowScrollButton(false)
    setDraft('')
    const assistantId = safeRandomUUID()
    const userMessage: DisplayMessage = { id: safeRandomUUID(), role: 'user', content: message }
    const assistantMessage: DisplayMessage = { id: assistantId, role: 'assistant', content: '', pending: true }
    const history = limitSalesAgentHistory(messages.filter((item) => !item.pending).map(({ role, content }) => ({ role, content })))
    setMessages((items) => [...items, userMessage, assistantMessage])
    setSending(true)
    try {
      const response = await fetch('/api/v1/sales-agent/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationId: conversationIdRef.current,
          guestHistory: history,
          interactionResponse,
          suggestionSelection: suggestionSelection ? {
            suggestionId: suggestionSelection.suggestionId,
            entityIds: suggestionSelection.entityIds,
            catalogVersion: suggestionSelection.catalogVersion,
          } : undefined,
          locale: 'vi-VN',
        }),
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
      const handleStreamPayload = (payload: Record<string, unknown>) => {
        if (payload.type === 'tool_status' && typeof payload.tool === 'string') {
          const label = getToolStatusLabel(payload.tool)
          setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, statusText: label } : item))
        }
        if (payload.type === 'text_delta' && typeof payload.delta === 'string') {
          receivedText = receivedText || payload.delta.length > 0
          setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: item.content + payload.delta } : item))
        }
        if (payload.type === 'text_reset') {
          receivedText = false
          setMessages((items) => items.map((item) => item.id === assistantId ? {
            ...item,
            content: '',
            blocks: undefined,
            actions: undefined,
            suggestions: undefined,
          } : item))
        }
        if (payload.type === 'view_delta') {
          const blocks = Array.isArray(payload.blocks) ? payload.blocks as AssistantBlock[] : undefined
          const actions = Array.isArray(payload.actions) ? payload.actions as SalesAgentAction[] : undefined
          const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions as SalesAgentSuggestion[] : undefined
          const interaction = payload.interaction && typeof payload.interaction === 'object'
            ? payload.interaction as DisplayInteraction
            : undefined
          setMessages((items) => items.map((item) => item.id === assistantId ? {
            ...item,
            ...(blocks !== undefined ? { blocks } : {}),
            ...(actions !== undefined ? { actions } : {}),
            ...(suggestions !== undefined ? { suggestions } : {}),
            ...(interaction ? { interaction } : {}),
          } : item))
        }
        if (payload.type === 'turn_view' && payload.viewModel && typeof payload.viewModel === 'object') {
          const vm = payload.viewModel as TurnViewModel
          receivedText = receivedText || Boolean(vm.answer?.markdown)
          setMessages((items) => items.map((item) => item.id === assistantId ? {
            ...item,
            content: vm.answer?.markdown || item.content,
            blocks: vm.blocks,
            actions: vm.actions,
            suggestions: vm.suggestions,
            interaction: vm.interaction as DisplayInteraction | undefined,
          } : item))
        }
        if (payload.type === 'meta' && typeof payload.conversationId === 'string') conversationIdRef.current = payload.conversationId
        if (payload.type === 'interaction' && payload.interaction && typeof payload.interaction === 'object') {
          setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, interaction: payload.interaction as DisplayInteraction } : item))
        }
        if (payload.type === 'done') receivedDone = true
        if (payload.type === 'error' && typeof payload.message === 'string') throw new Error(payload.message)
      }
      while (true) {
        const part = await reader.read()
        if (part.done) break
        buffer += decoder.decode(part.value, { stream: true })
        buffer = parseSseChunk(buffer, handleStreamPayload)
      }
      // Flush a final UTF-8 code point and parse the last SSE event even when
      // the stream closes without an extra blank line.
      buffer += decoder.decode()
      if (buffer.trim()) {
        parseSseChunk(`${buffer}\n\n`, handleStreamPayload)
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
    const allOptions = [
      ...interaction.options,
      ...(interaction.fields?.flatMap((field) => field.options) ?? []),
    ]
    const labels = selection.selectedOptionIds.map((optionId) => allOptions.find((option) => option.optionId === optionId)?.label).filter(Boolean)
    const message = selection.freeText || labels.join(', ')
    if (!message) return
    emitInteractionMetric({ event: 'interaction_submitted', slot: interaction.slot, mode: interaction.mode, resultCount: selection.selectedOptionIds.length })
    setMessages((items) => items.map((item) => item.id === messageId && item.interaction ? { ...item, interaction: { ...item.interaction, submitted: true } } : item))
    void send(message, { interactionId: interaction.interactionId, selectedOptionIds: selection.selectedOptionIds, ...(selection.freeText ? { freeText: selection.freeText } : {}), continuationToken: interaction.continuationToken })
  }

  // Extract latest products and comparison for the intelligence side panel in expanded mode
  const latestProducts = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const block = messages[i].blocks?.find((b) => b.kind === 'PRODUCT_LIST')
      if (block && 'items' in block && Array.isArray((block as any).items) && (block as any).items.length > 0) {
        return (block as any).items
      }
    }
    return []
  }, [messages])

  const latestComparison = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const block = messages[i].blocks?.find((b) => b.kind === 'COMPARISON_TABLE')
      if (block && 'products' in block && Array.isArray((block as any).products) && (block as any).products.length > 0) {
        return block as { kind: 'COMPARISON_TABLE'; criteria: string[]; products: any[] }
      }
    }
    return null
  }, [messages])

  return (
    <>
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {/* Main Dialog & Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="sales-agent-backdrop"
            role="presentation"
            aria-label="Đóng Sales Agent"
            onClick={() => {
              if (isExpanded) setIsExpanded(false)
              else setOpen(false)
            }}
            className={`fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 ${
              isExpanded ? 'opacity-100' : 'opacity-100 md:hidden'
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          />
        )}

        {open && (
          <motion.aside
            key="sales-agent-dialog"
            layout
            role="dialog"
            aria-label="Trợ lý mua xe FASTLANE"
        className={
          isExpanded
            ? 'fixed inset-2 sm:inset-0 m-auto z-[61] flex flex-col overflow-hidden bg-white shadow-2xl border border-slate-200/90 w-[calc(100vw-16px)] sm:w-[min(94vw,1152px)] h-[calc(100dvh-16px)] sm:h-[min(88vh,860px)] rounded-2xl sm:rounded-3xl'
            : 'fixed inset-x-3 bottom-3 z-[61] flex h-[min(620px,calc(100dvh-24px))] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:inset-x-auto md:inset-y-auto md:right-4 md:bottom-4 md:h-[min(680px,calc(100dvh-2rem))] md:w-[420px]'
        }
        style={{ transformOrigin: isExpanded ? 'center' : 'calc(100% - 32px) calc(100% - 32px)' }}
        initial={{ opacity: 0, scale: 0.85, x: chatX, y: chatY + 20 }}
        animate={{ opacity: 1, scale: 1, x: chatX, y: chatY }}
        exit={{ opacity: 0, scale: 0.85, x: chatX, y: chatY + 20 }}
        transition={{ 
          default: { duration: reduceMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] },
          layout: { type: 'spring', bounce: 0, duration: 0.25 }
        }}
        drag={!isExpanded}
        dragConstraints={dragConstraints}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
      >
        {/* Header Bar */}
        <div 
          className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 text-white shrink-0 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-400/30 bg-slate-900 shadow-xs">
              <img
                src="/sales-agent-bot.gif"
                alt="Trợ lý AI FASTLANE"
                className="h-full w-full object-cover"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Trợ lý mua xe FASTLANE</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleResetChat}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              title="Làm mới cuộc trò chuyện"
              aria-label="Làm mới cuộc trò chuyện"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="hidden sm:flex rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              title={isExpanded ? 'Thu nhỏ cửa sổ' : 'Mở rộng toàn màn hình'}
              aria-label={isExpanded ? 'Thu nhỏ cửa sổ' : 'Mở rộng toàn màn hình'}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              aria-label="Đóng Sales Agent"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Content Area: Split 2 columns in Expanded Mode */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          
          {/* Left Column: Chat Conversation */}
          <motion.div layout className={`flex flex-col h-full min-w-0 overflow-hidden ${isExpanded ? 'w-full lg:w-[58%] border-r border-slate-200/90' : 'w-full'}`}>
            <div
              ref={listRef}
              className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50/70 p-3 custom-scrollbar"
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
              <div ref={contentRef} className="min-w-0 space-y-3">
              {!messages.length && (
                <div className="min-w-0 space-y-3 rounded-2xl border border-brand-100 bg-linear-to-b from-brand-50/60 to-white p-3.5">
                  <div className="flex items-center gap-2 text-brand-900 font-semibold text-xs">
                    <Sparkles size={14} className="text-brand-600" />
                    <span>Xin chào! Tôi là Trợ lý AI FASTLANE</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Tôi sẵn sàng hỗ trợ bạn tìm dòng xe phù hợp, tra cứu giá niêm yết, dự toán chi phí trả góp và so sánh thông số kỹ thuật.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={sending}
                        onClick={() => void send(suggestion)}
                        className="rounded-full border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((item) => (
                <div key={item.id} className={`flex min-w-0 ${item.role === 'user' ? 'justify-end' : 'w-full justify-start'}`}>
                  <div className={`min-w-0 max-w-full ${item.role === 'user' ? 'max-w-[84%] overflow-hidden rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2.5 text-white shadow-xs' : item.error ? 'w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5' : 'w-full py-1'}`}>
                    {item.role === 'assistant' ? (
                      (() => {
                        const mediaBlock = item.blocks?.find(
                          (b): b is Extract<AssistantBlock, { kind: 'KNOWLEDGE_MEDIA' }> => b.kind === 'KNOWLEDGE_MEDIA'
                        )
                        const mediaItems = mediaBlock?.items

                        return (
                          <div className="space-y-2.5">
                            {item.content ? (
                              <MarkdownMessage content={item.content} mediaItems={mediaItems} streaming={item.pending} />
                            ) : item.pending ? (
                              <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 shadow-xs animate-in fade-in duration-200">
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                </span>
                                <Loader2 size={13} className="animate-spin text-amber-600 shrink-0" />
                                <span className="font-medium">{item.statusText || 'Đang phân tích câu hỏi & lập kế hoạch…'}</span>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">Không có câu trả lời.</p>
                            )}

                            {/* Rich Blocks */}
                            {item.blocks?.map((block, idx) => {
                              if (block.kind === 'PRODUCT_LIST') {
                                return (
                                  <ProductCardBlock
                                    key={`block-${idx}`}
                                    title={block.title}
                                    items={block.items}
                                  />
                                )
                              }
                              if (block.kind === 'COMPARISON_TABLE') {
                                return (
                                  <ComparisonCardBlock
                                    key={`block-${idx}`}
                                    criteria={block.criteria}
                                    products={block.products}
                                  />
                                )
                              }
                              if (block.kind === 'FACT_SUMMARY') {
                                return <KnowledgeCitationBlock key={`block-${idx}`} {...block} />
                              }
                              if (block.kind === 'KNOWLEDGE_MEDIA') {
                                if (item.pending) return null
                                const content = item.content || ''
                                const unreferencedItems = block.items.filter((media) => {
                                  if (!media.url) return true
                                  const filename = media.url.split('/').pop()?.replace(/\.png$/i, '')
                                  const isEmbedded = Boolean(media.reference && content.includes(`[${media.reference}]`))
                                    || content.includes(media.url)
                                    || Boolean(filename && content.includes(filename))
                                  return !isEmbedded
                                })

                                if (unreferencedItems.length === 0) return null
                                return <KnowledgeMediaBlock key={`block-${idx}`} kind="KNOWLEDGE_MEDIA" title={block.title} items={unreferencedItems} />
                              }
                              return null
                            })}

                        {/* Action Buttons */}
                        {item.actions && item.actions.length > 0 && (
                          <ActionButtons actions={item.actions} />
                        )}

                        {/* Suggestion Chips */}
                        {item.suggestions && item.suggestions.length > 0 && (
                          <SuggestionChips
                            suggestions={item.suggestions}
                            disabled={sending}
                            onSelect={(suggestion) => void send(suggestion.payload || suggestion.label, undefined, suggestion)}
                          />
                        )}
                      </div>
                    )
                  })()
                ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">{item.content}</p>
                    )}

                    {item.interaction && (item.interaction.fields?.length ? (
                      <ScopeChoiceInteraction
                        interaction={item.interaction}
                        disabled={sending}
                        onSubmit={(selection) => void submitInteraction(item.id, item.interaction!, selection)}
                      />
                    ) : (
                      <ChoiceInteraction
                        interaction={item.interaction}
                        conversationId={conversationIdRef.current}
                        disabled={sending}
                        onSearchResult={(result, selectedOptionIds) => updateInteractionSearch(item.id, item.interaction!, result, selectedOptionIds)}
                        onSubmit={(selection) => void submitInteraction(item.id, item.interaction!, selection)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              </div>
            </div>

            {/* Input Bar & Footer */}
            <div className="relative bg-slate-50/90 p-3 pt-1.5 pb-3 shrink-0 border-t border-slate-200/60">
              {showScrollButton && (
                <button
                  type="button"
                  onClick={scrollToLatest}
                  className="absolute -top-10 left-1/2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Cuộn đến tin nhắn mới nhất"
                >
                  <ArrowDown size={14} />
                </button>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void send()
                }}
                className="space-y-1.5"
              >
                <div className="flex items-end gap-2 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xs transition duration-200 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, 2_000))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void send()
                      }
                    }}
                    disabled={sending}
                    rows={1}
                    placeholder={sending ? 'Trợ lý AI đang trả lời…' : 'Hỏi về xe điện, giá bán, trả góp...'}
                    className="flex-1 min-h-[38px] max-h-[120px] resize-none border-0 bg-transparent px-2 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-60 leading-relaxed custom-scrollbar"
                    aria-label="Câu hỏi cho Sales Agent"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-all hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 cursor-pointer mb-0.5"
                    aria-label="Gửi câu hỏi"
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                </div>
                <p className="px-2 pt-0.5 text-center text-[10.5px] text-slate-400 font-normal select-none leading-normal">
                  Thông tin từ trợ lý AI mang tính tham khảo. Quý khách vui lòng đối chiếu thực tế hoặc liên hệ tư vấn viên FASTLANE.
                </p>
              </form>
            </div>
          </motion.div>

          {/* Right Column: Intelligence & Showcase Panel (Only shown in Expanded Mode on Desktop) */}
          <AnimatePresence>
          {isExpanded && (
            <motion.div
              layout
              initial={{ opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0 }}
              animate={{ opacity: 1, width: '42%', paddingLeft: 20, paddingRight: 20 }}
              exit={{ opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0 }}
              className="hidden lg:flex flex-col h-full overflow-y-auto bg-slate-50/90 space-y-4 custom-scrollbar"
            >
              <div className="w-full min-w-[300px] py-5 space-y-4">
              
              {/* Header Showcase */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm mb-1.5">
                  <Zap size={16} className="text-amber-500" />
                  <span>Trung Tâm Hỗ Trợ Mua Xe FASTLANE</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Trực tiếp kết nối hệ thống dữ liệu giá bán, chính sách pin và kho xe mới nhất toàn quốc.
                </p>
              </div>

              {/* Quick Vehicle Catalog Chips */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Car size={14} className="text-brand-600" />
                    <span>Dòng xe đang quan tâm</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Bấm để hỏi nhanh</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'VF 3', query: 'Tư vấn xe VinFast VF 3' },
                    { label: 'VF 5', query: 'Tư vấn xe VinFast VF 5' },
                    { label: 'VF 6', query: 'Tư vấn xe VinFast VF 6' },
                    { label: 'VF 7', query: 'Tư vấn xe VinFast VF 7' },
                    { label: 'VF 8', query: 'Tư vấn xe VinFast VF 8' },
                    { label: 'VF 9', query: 'Tư vấn xe VinFast VF 9' },
                    { label: 'Evo 200', query: 'Tư vấn xe máy điện Evo 200' },
                    { label: 'Feliz S', query: 'Tư vấn xe máy điện Feliz S' },
                  ].map((car) => (
                    <button
                      key={car.label}
                      type="button"
                      disabled={sending}
                      onClick={() => void send(car.query)}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {car.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discussed Products Preview if available */}
              {latestProducts.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-brand-600" />
                      <span>Sản phẩm vừa đề cập</span>
                    </span>
                    <span className="text-[11px] font-medium text-brand-600">{latestProducts.length} mẫu</span>
                  </div>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {latestProducts.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{p.name}</p>
                          <p className="text-[11px] font-medium text-amber-700">
                            {typeof p.price === 'number' && p.price > 0 ? `${p.price.toLocaleString('vi-VN')} VNĐ` : 'Liên hệ báo giá'}
                          </p>
                        </div>
                        {p.url && (
                          <a
                            href={p.url}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800 shrink-0"
                          >
                            <span>Xem</span>
                            <ChevronRight size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service Assurance & Hotlines */}
              <div className="mt-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  <span>Chính sách bán hàng FASTLANE</span>
                </div>
                <ul className="text-[11px] text-slate-500 space-y-1.5">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                    <span>Bảo hành chính hãng lên tới 10 năm hoặc 200.000 km</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                    <span>Hỗ trợ vay mua xe trả góp tới 80% giá trị xe</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                    <span>Cứu hộ pin 24/7 và hệ thống trạm sạc toàn quốc</span>
                  </li>
                </ul>
              </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

        </div>
      </motion.aside>
    )}
  </AnimatePresence>

  {/* Floating Trigger */}
  <AnimatePresence initial={false} mode="wait">
    {!open && (
      <motion.div
        key="sales-agent-floating-trigger"
        initial={{ opacity: 1, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85, y: 15 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        className="fixed bottom-6 right-6 z-[55] flex items-center"
        style={floatingPosition ? { left: floatingPosition.left, top: floatingPosition.top, right: 'auto', bottom: 'auto' } : undefined}
      >
        <button
          type="button"
          ref={floatingButtonRef}
          onPointerDown={handleFloatingPointerDown}
          onPointerMove={handleFloatingPointerMove}
          onPointerUp={handleFloatingPointerUp}
          onPointerCancel={handleFloatingPointerUp}
          onClick={() => {
            if (suppressFloatingClickRef.current) return
            setOpen(true)
          }}
          aria-label="Mở Trợ lý AI FASTLANE"
          className={`group relative flex select-none items-center gap-2.5 touch-none rounded-2xl border border-amber-400/40 bg-slate-950/95 p-1.5 pr-3.5 text-white shadow-2xl backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isFloatingDragging ? `border-amber-300 shadow-[0_12px_35px_rgba(245,158,11,0.35)] cursor-grabbing ${reduceMotion ? 'scale-105 rotate-1' : 'sales-agent-dragging'}` : 'cursor-grab transition-all duration-300 hover:scale-105 hover:border-amber-400 hover:bg-slate-900 active:scale-95'}`}
        >
          {/* Squircle mascot container */}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-400/50 bg-slate-900 shadow-md">
            <img
              src="/sales-agent-bot.gif"
              alt="FASTLANE AI"
              className="h-full w-full object-contain"
            />
          </span>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold tracking-tight text-white group-hover:text-amber-300 transition-colors">
              Trợ lý AI
            </p>
            <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
              FASTLANE
            </span>
          </div>
        </button>
      </motion.div>
    )}
  </AnimatePresence>
</>
)
}
