'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

type Provider = {
  id: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai-compatible'
  displayName: string
  model: string
  baseUrl: string
  apiKeyEnv: string
  enabled: boolean
  isDefault: boolean
  updatedAt?: string
}

const labels: Record<Provider['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  'openai-compatible': 'OpenAI Compatible',
}

export function SalesAgentProviderManager() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [selected, setSelected] = useState<Provider['provider']>('openai')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const current = useMemo(() => providers.find((item) => item.provider === selected), [providers, selected])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/sales-agent/providers', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Không thể tải cấu hình provider.')
      setProviders(body.data ?? [])
    } catch (error) {
      notify('error', 'Tải cấu hình thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void load() }, [load])

  function update(patch: Partial<Provider>) {
    if (!current) return
    setProviders((items) => items.map((item) => item.provider === current.provider ? { ...item, ...patch } : item))
  }

  async function save() {
    if (!current) return
    setSaving(true)
    try {
      const response = await fetch('/api/v1/admin/sales-agent/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: current.provider, displayName: current.displayName, model: current.model, baseUrl: current.baseUrl, apiKeyEnv: current.apiKeyEnv, enabled: current.enabled, isDefault: current.isDefault }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Không thể lưu cấu hình provider.')
      setProviders((items) => items.map((item) => item.provider === current.provider ? body.data : item).map((item) => item.provider !== current.provider && current.isDefault ? { ...item, isDefault: false } : item))
      notify('success', 'Đã lưu cấu hình provider', `${labels[current.provider]} sẽ được dùng theo trạng thái mới.`)
    } catch (error) {
      notify('error', 'Lưu cấu hình thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <div className="border-b border-slate-200 bg-slate-50/50 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-700"><KeyRound size={20} /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sales Agent — Provider</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Chọn mô hình dùng cho agent. API key chỉ được đọc từ biến môi trường server; màn hình này không nhận hoặc lưu secret.</p>
          </div>
        </div>
      </div>
      {loading ? <div className="p-6 text-sm text-slate-500">Đang tải cấu hình provider…</div> : !current ? <div className="p-6 text-sm text-red-600">Chưa có cấu hình provider.</div> : (
        <div className="grid gap-6 p-6 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2" role="tablist" aria-label="Các provider AI">
            {providers.map((provider) => <button key={provider.provider} type="button" role="tab" aria-selected={provider.provider === selected} onClick={() => setSelected(provider.provider)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left text-sm transition ${provider.provider === selected ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
              <span><span className="block font-semibold">{labels[provider.provider]}</span><span className="mt-0.5 block text-xs text-slate-500">{provider.model}</span></span>
              {provider.isDefault && <Check size={16} aria-label="Provider mặc định" />}
            </button>)}
          </div>
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Tên hiển thị</span><input value={current.displayName} onChange={(event) => update({ displayName: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></label>
              <label className="space-y-2 text-sm font-semibold text-slate-700"><span>Model</span><input value={current.model} onChange={(event) => update({ model: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></label>
              <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2"><span>Base URL</span><input value={current.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></label>
              <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2"><span>Tên biến môi trường API key</span><input value={current.apiKeyEnv} onChange={(event) => update({ apiKeyEnv: event.target.value.toUpperCase() })} className="h-10 w-full rounded-md border border-slate-200 px-3 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /><span className="block text-xs font-normal text-slate-500">Ví dụ: OPENAI_API_KEY. Không nhập giá trị key vào đây.</span></label>
            </div>
            <div className="flex flex-wrap items-center gap-6 border-t border-slate-100 pt-5 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={current.enabled} onChange={(event) => update({ enabled: event.target.checked, isDefault: event.target.checked ? current.isDefault : false })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /> Cho phép sử dụng</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={current.isDefault} disabled={!current.enabled} onChange={(event) => update({ isDefault: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /> Provider mặc định</label>
              <Button onClick={() => void save()} disabled={saving} className="ml-auto bg-brand-600 text-white hover:bg-brand-700"><Save size={16} className="mr-2" />{saving ? 'Đang lưu…' : 'Lưu provider'}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
