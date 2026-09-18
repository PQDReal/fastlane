'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  Check,
  CheckCircle2,
  Cpu,
  Edit3,
  KeyRound,
  Layers,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai-compatible'

export type ManagedKeyInfo = {
  maskedKey: string
  isCooldown: boolean
  cooldownRemainingSec: number
  successCount: number
  errorCount: number
}

export type KeyPoolInfo = {
  providerKey: string
  totalKeys: number
  activeKeys: number
  coolingDownKeys: number
  keys: ManagedKeyInfo[]
}

export type ProviderInstance = {
  id: string
  provider: ProviderType
  displayName: string
  model: string
  baseUrl: string
  apiKeyEnv: string
  customApiKeys?: string[]
  priority: number
  timeoutMs?: number
  enabled: boolean
  isDefault: boolean
  updatedAt?: string
  keyPool?: KeyPoolInfo
}

const PROVIDER_TYPE_OPTIONS: Array<{
  value: ProviderType
  label: string
  shortName: string
  defaultBaseUrl: string
  defaultModel: string
  defaultEnv: string
  description: string
}> = [
  {
    value: 'openai',
    label: 'OpenAI (GPT-5.6 / GPT-4o)',
    shortName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-luna',
    defaultEnv: 'OPENAI_API_KEY',
    description: 'Chính xác cao, reasoning mạnh mẽ, hỗ trợ tools native.',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek (V3 / R1)',
    shortName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    defaultEnv: 'DEEPSEEK_API_KEY',
    description: 'Tốc độ phản hồi cực nhanh, chi phí tối ưu cho tải lớn.',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude (Sonnet 3.5)',
    shortName: 'Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    defaultEnv: 'ANTHROPIC_API_KEY',
    description: 'Văn phong tự nhiên, thấu hiểu ngữ cảnh bán hàng phức tạp.',
  },
  {
    value: 'gemini',
    label: 'Google Gemini (Flash 2.5)',
    shortName: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    defaultEnv: 'GEMINI_API_KEY',
    description: 'Độ trễ TTFT cực thấp, context window siêu lớn.',
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible (Local/OpenRouter/Groq)',
    shortName: 'Custom/Local',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'local-model',
    defaultEnv: 'OPENAI_COMPATIBLE_API_KEY',
    description: 'Hỗ trợ tự host Ollama, vLLM, hoặc router trung gian.',
  },
]

function generateSlug(provider: string, model: string, displayName?: string): string {
  const base = displayName && displayName.trim()
    ? displayName
    : `${provider}-${model}`

  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove Vietnamese accents
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function SalesAgentProviderManager() {
  const [providers, setProviders] = useState<ProviderInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingCache, setRefreshingCache] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<Partial<ProviderInstance> | null>(null)
  const [autoSlug, setAutoSlug] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000)
  }, [])

  const loadProviders = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/sales-agent/providers', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Không thể tải danh sách providers.')
      setProviders(body.data ?? [])
    } catch (error) {
      notify('error', 'Tải danh sách thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  // Stats calculation
  const totalProviders = providers.length
  const activeProviders = providers.filter((p) => p.enabled).length
  const defaultProvider = providers.find((p) => p.isDefault)
  const totalActiveKeys = providers.reduce((acc, p) => acc + (p.keyPool?.activeKeys ?? 0), 0)
  const totalCooldownKeys = providers.reduce((acc, p) => acc + (p.keyPool?.coolingDownKeys ?? 0), 0)

  // Handle Refresh Cache
  const handleForceRefreshCache = async () => {
    setRefreshingCache(true)
    try {
      const res = await fetch('/api/v1/admin/sales-agent/cache', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message || 'Lỗi khi làm mới cache')
      notify('success', 'Làm mới Cache thành công', 'Toàn bộ danh mục xe, phụ kiện, tri thức CMS và Provider đã nạp lại vào RAM.')
      await loadProviders()
    } catch (error) {
      notify('error', 'Làm mới cache thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setRefreshingCache(false)
    }
  }

  // Test Ping Connection
  const handleTestConnection = async (providerConfig: ProviderInstance) => {
    setTestingId(providerConfig.id)
    try {
      const res = await fetch('/api/v1/admin/sales-agent/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerConfig),
      })
      const body = await res.json()
      if (!res.ok || !body.data?.ok) {
        throw new Error(body.data?.error || body.error || 'Kiểm tra kết nối thất bại.')
      }
      notify(
        'success',
        `Kết nối ${providerConfig.displayName} thành công!`,
        `Độ trễ phản hồi: ${body.data.latencyMs}ms. Model: "${providerConfig.model}" sẵn sàng.`,
      )
    } catch (error) {
      notify(
        'error',
        `Lỗi kết nối ${providerConfig.displayName}`,
        error instanceof Error ? error.message : 'Không nhận được phản hồi từ endpoint.',
      )
    } finally {
      setTestingId(null)
    }
  }

  // Toggle Enable
  const handleToggleEnable = async (provider: ProviderInstance) => {
    try {
      const updated = { ...provider, enabled: !provider.enabled, isDefault: !provider.enabled ? false : provider.isDefault }
      const res = await fetch('/api/v1/admin/sales-agent/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Không thể cập nhật trạng thái.')
      notify('success', 'Cập nhật trạng thái thành công', `${provider.displayName} hiện đang ${!provider.enabled ? 'BẬT' : 'TẮT'}.`)
      await loadProviders()
    } catch (error) {
      notify('error', 'Lỗi cập nhật', error instanceof Error ? error.message : undefined)
    }
  }

  // Set as Default
  const handleSetDefault = async (provider: ProviderInstance) => {
    try {
      const updated = { ...provider, enabled: true, isDefault: true }
      const res = await fetch('/api/v1/admin/sales-agent/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Không thể đặt làm mặc định.')
      notify('success', 'Đã đặt làm Provider mặc định', `${provider.displayName} sẽ là cổng chính xử lý lượt chat của khách.`)
      await loadProviders()
    } catch (error) {
      notify('error', 'Lỗi đặt mặc định', error instanceof Error ? error.message : undefined)
    }
  }

  // Open Create Modal
  const handleOpenCreate = () => {
    const defaultType = PROVIDER_TYPE_OPTIONS[0]
    const initialDisplayName = `OpenAI (${defaultType.defaultModel})`
    const initialSlug = generateSlug(defaultType.value, defaultType.defaultModel, initialDisplayName)

    setEditingProvider({
      id: initialSlug,
      provider: defaultType.value,
      displayName: initialDisplayName,
      model: defaultType.defaultModel,
      baseUrl: defaultType.defaultBaseUrl,
      apiKeyEnv: defaultType.defaultEnv,
      customApiKeys: [],
      priority: providers.length + 1,
      timeoutMs: 5000,
      enabled: true,
      isDefault: providers.length === 0,
    })
    setAutoSlug(true)
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (provider: ProviderInstance) => {
    setEditingProvider({ ...provider })
    setAutoSlug(false)
    setIsModalOpen(true)
  }

  // Change Provider Type in Modal
  const handleSelectProviderType = (type: ProviderType) => {
    const opt = PROVIDER_TYPE_OPTIONS.find((o) => o.value === type)
    if (!opt) return

    setEditingProvider((prev) => {
      const newModel = opt.defaultModel
      const newDisplayName = `${opt.shortName} (${newModel})`
      const newSlug = autoSlug ? generateSlug(type, newModel, newDisplayName) : (prev?.id || generateSlug(type, newModel))

      return {
        ...prev,
        provider: type,
        baseUrl: opt.defaultBaseUrl,
        model: newModel,
        apiKeyEnv: opt.defaultEnv,
        displayName: autoSlug ? newDisplayName : (prev?.displayName || newDisplayName),
        id: newSlug,
      }
    })
  }

  // Change Display Name
  const handleChangeDisplayName = (value: string) => {
    setEditingProvider((prev) => {
      const updated = { ...prev, displayName: value }
      if (autoSlug && prev?.provider && prev?.model) {
        updated.id = generateSlug(prev.provider, prev.model, value)
      }
      return updated
    })
  }

  // Change Model
  const handleChangeModel = (value: string) => {
    setEditingProvider((prev) => {
      const updated = { ...prev, model: value }
      if (autoSlug && prev?.provider) {
        updated.id = generateSlug(prev.provider, value, prev?.displayName)
      }
      return updated
    })
  }

  // Save Provider Modal
  const handleSaveModal = async () => {
    if (!editingProvider || !editingProvider.provider) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/admin/sales-agent/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProvider),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Lỗi lưu cấu hình provider.')
      notify('success', 'Lưu cấu hình Provider thành công!', `Đã lưu instance: ${editingProvider.displayName}.`)
      setIsModalOpen(false)
      setEditingProvider(null)
      await loadProviders()
    } catch (error) {
      notify('error', 'Lưu thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  // Delete Provider
  const handleDeleteProvider = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/sales-agent/providers?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Lỗi xóa provider.')
      notify('success', 'Đã xóa Provider', 'Cấu hình provider đã được gỡ bỏ khỏi router.')
      setDeleteConfirmId(null)
      await loadProviders()
    } catch (error) {
      notify('error', 'Xóa thất bại', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <section className="space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {/* Main Header Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/20">
              <Cpu size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">Quản Lý Router AI & Multi-Provider</h2>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200/60">
                  CLIProxy Router
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                Cấu hình nhiều Provider instances với ID riêng biệt, xoay vòng API Keys và tự động chuyển đổi dự phòng (Waterfall Failover) khi có sự cố mạng.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handleForceRefreshCache}
              disabled={refreshingCache}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={16} className={`mr-2 ${refreshingCache ? 'animate-spin text-brand-600' : ''}`} />
              {refreshingCache ? 'Đang làm mới RAM…' : 'Làm mới Cache AI'}
            </Button>
            <Button
              onClick={handleOpenCreate}
              className="bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20"
            >
              <Plus size={16} className="mr-2" />
              Thêm Provider Instance
            </Button>
          </div>
        </div>

        {/* Stats Dashboard Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Layers size={14} className="text-slate-400" />
              Tổng số Provider
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{totalProviders}</span>
              <span className="text-xs text-slate-500">({activeProviders} đang bật)</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Zap size={14} className="text-amber-500" />
              Cổng Chính (Default)
            </div>
            <div className="mt-2 truncate font-semibold text-slate-900 text-sm">
              {defaultProvider ? defaultProvider.displayName : 'Chưa thiết lập'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <KeyRound size={14} className="text-emerald-500" />
              Active Keys trong Pool
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600">{totalActiveKeys}</span>
              <span className="text-xs text-slate-500">khỏe mạnh</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ShieldAlert size={14} className="text-rose-500" />
              Keys Đang Cooldown
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${totalCooldownKeys > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                {totalCooldownKeys}
              </span>
              <span className="text-xs text-slate-500">cách ly (429/Quota)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Instances List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <ArrowDownUp size={18} className="text-brand-600" />
            Chuỗi Ưu Tiên Router (Waterfall Priority Chain)
          </h3>
          <span className="text-xs text-slate-500">
            Hệ thống sẽ thử lần lượt từ Mức #1, tự động chuyển mức tiếp theo nếu gặp lỗi
          </span>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            <RefreshCw size={20} className="mr-2 animate-spin text-brand-600" />
            Đang tải danh sách Router Providers…
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Server size={36} className="mx-auto text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Chưa có Provider Instance nào.</p>
            <p className="mt-1 text-xs text-slate-500">Bấm nút &quot;Thêm Provider Instance&quot; để thiết lập cổng AI đầu tiên.</p>
            <Button onClick={handleOpenCreate} className="mt-4 bg-brand-600 text-white hover:bg-brand-700">
              <Plus size={16} className="mr-2" /> Thêm Provider Ngay
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1">
            {providers.map((item) => {
              const isDefault = item.isDefault
              const isTesting = testingId === item.id
              const activeKeys = item.keyPool?.activeKeys ?? 0
              const coolingKeys = item.keyPool?.coolingDownKeys ?? 0

              return (
                <div
                  key={item.id}
                  className={`group relative overflow-hidden rounded-xl border transition-all duration-200 bg-white p-5 shadow-sm hover:shadow-md ${
                    isDefault
                      ? 'border-brand-300 ring-1 ring-brand-500/20'
                      : item.enabled
                        ? 'border-slate-200 hover:border-slate-300'
                        : 'border-slate-200/60 bg-slate-50/50 opacity-75'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Info */}
                    <div className="flex items-start gap-4">
                      {/* Priority Badge */}
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm shadow-sm ${
                          isDefault
                            ? 'bg-brand-600 text-white'
                            : item.enabled
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        #{item.priority ?? 1}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-base">{item.displayName}</h4>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {item.id}
                          </span>
                          {isDefault && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
                              <CheckCircle2 size={12} /> Cổng Chính
                            </span>
                          )}
                          {!item.enabled && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                              Đang tắt
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Loại:</span> {item.provider.toUpperCase()}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Model:</span>{' '}
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-brand-700">{item.model}</code>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Endpoint:</span> {item.baseUrl}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Env:</span>{' '}
                            <code className="text-slate-600">{item.apiKeyEnv}</code>
                          </span>
                        </div>

                        {/* Key Pool Health Indicator */}
                        <div className="pt-1 flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-slate-600">
                            <KeyRound size={13} className="text-slate-400" />
                            Pool Keys:
                            <span className="text-emerald-700 font-semibold">{activeKeys} Active</span>
                            {coolingKeys > 0 && (
                              <span className="text-rose-600 font-semibold">({coolingKeys} Cooldown)</span>
                            )}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">Timeout: {item.timeoutMs || 5000}ms</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                      {/* Test Ping Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(item)}
                        disabled={isTesting}
                        className="border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                        title="Kiểm tra kết nối và độ trễ phản hồi"
                      >
                        <Zap size={14} className={`mr-1.5 ${isTesting ? 'animate-spin text-amber-500' : 'text-amber-500'}`} />
                        {isTesting ? 'Đang Ping…' : 'Test Ping'}
                      </Button>

                      {/* Default Toggle Button */}
                      {!isDefault && item.enabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(item)}
                          className="border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-600"
                        >
                          Đặt làm mặc định
                        </Button>
                      )}

                      {/* Enable/Disable Toggle */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleEnable(item)}
                        className={item.enabled ? 'border-slate-200 text-slate-700' : 'border-transparent bg-slate-200 text-slate-600 hover:bg-slate-300'}
                      >
                        {item.enabled ? 'Tắt' : 'Bật'}
                      </Button>

                      {/* Edit Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(item)}
                        className="border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        Sửa
                      </Button>

                      {/* Delete Button */}
                      {deleteConfirmId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleDeleteProvider(item.id)}
                            className="bg-rose-600 text-white hover:bg-rose-700"
                          >
                            Xác nhận xóa
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfirmId(null)}
                            className="border-slate-200"
                          >
                            Hủy
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Xóa provider instance"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Add / Edit Provider Instance */}
      {isModalOpen && editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingProvider.id && providers.some((p) => p.id === editingProvider.id)
                    ? 'Chỉnh Sửa Provider Instance'
                    : 'Thêm Provider Instance Mới'}
                </h3>
                <p className="text-xs text-slate-500">Cấu hình kết nối, mô hình AI và thứ tự ưu tiên trong Router</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {/* BƯỚC 1: CHỌN LOẠI PROVIDER ADAPTER TRƯỚC (QUICK SELECT CARDS) */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-brand-700">
                  1. Chọn Loại Nhà Cung Cấp (Provider Adapter)
                </label>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {PROVIDER_TYPE_OPTIONS.map((opt) => {
                    const isSelected = editingProvider.provider === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectProviderType(opt.value)}
                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20 text-brand-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-bold text-xs">{opt.shortName}</span>
                          {isSelected && <Check size={14} className="text-brand-600" />}
                        </div>
                        <span className="mt-1 line-clamp-2 text-[11px] leading-tight text-slate-500">
                          {opt.defaultModel}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* BƯỚC 2: TÊN HIỂN THỊ & MODEL */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                  <span>Tên Hiển Thị (Gợi nhớ)</span>
                  <input
                    type="text"
                    value={editingProvider.displayName || ''}
                    onChange={(e) => handleChangeDisplayName(e.target.value)}
                    placeholder="vd: OpenAI GPT-5.6 (Chính)"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>

                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                  <span>Model ID</span>
                  <input
                    type="text"
                    value={editingProvider.model || ''}
                    onChange={(e) => handleChangeModel(e.target.value)}
                    placeholder="vd: gpt-5.6-luna, deepseek-chat, claude-3-5-sonnet"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              </div>

              {/* BƯỚC 3: ID ĐỊNH DANH (SLUG - TỰ ĐỘNG SINH THÔNG MINH) */}
              <div>
                <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                  <div className="flex items-center justify-between">
                    <span>ID Định Danh Router (Slug)</span>
                    <button
                      type="button"
                      onClick={() => setAutoSlug(!autoSlug)}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
                        autoSlug
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {autoSlug ? <Lock size={10} /> : <Unlock size={10} />}
                      {autoSlug ? 'Tự Động Sinh (Khóa)' : 'Tự Chỉnh Sửa'}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      disabled={autoSlug}
                      value={editingProvider.id || ''}
                      onChange={(e) => setEditingProvider((prev) => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') }))}
                      placeholder="vd: openai-gpt-5-6-luna"
                      className={`h-9 w-full rounded-lg border px-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                        autoSlug ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-white border-brand-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <span className="block text-[11px] font-normal text-slate-400">
                    {autoSlug
                      ? 'ID đang được tự động sinh theo Loại Provider, Tên và Model.'
                      : 'Bạn đang tùy chỉnh ID thủ công (dùng chữ cái thường, số, dấu gạch nối).'}
                  </span>
                </label>
              </div>

              {/* BƯỚC 4: BASE URL & TIMEOUT */}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1.5 text-xs font-semibold text-slate-700 sm:col-span-2">
                  <span>Base URL Endpoint</span>
                  <input
                    type="text"
                    value={editingProvider.baseUrl || ''}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>

                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                  <span>Timeout (ms)</span>
                  <input
                    type="number"
                    value={editingProvider.timeoutMs || 5000}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              </div>

              {/* BƯỚC 5: PRIORITY & ENV KEY */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                  <span>Thứ tự Ưu Tiên Fallback (Priority)</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={editingProvider.priority ?? 1}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="block text-[11px] font-normal text-slate-400">1 = Mức chính cao nhất, 2, 3 = Dự phòng</span>
                </label>

                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                  <span>Biến môi trường API Key (Server Env)</span>
                  <input
                    type="text"
                    value={editingProvider.apiKeyEnv || ''}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, apiKeyEnv: e.target.value.toUpperCase() }))}
                    placeholder="OPENAI_API_KEY"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="block text-[11px] font-normal text-slate-400">Đọc tự động từ file .env.local</span>
                </label>
              </div>

              {/* BƯỚC 6: CUSTOM MULTI-KEY POOL */}
              <label className="space-y-1.5 text-xs font-semibold text-slate-700 block">
                <div className="flex items-center justify-between">
                  <span>Danh Sách API Keys Dự Phòng (Tùy chọn - Nhập trực tiếp nhiều key)</span>
                  <span className="text-[11px] text-brand-600 font-normal">Tự động xoay vòng Round-Robin</span>
                </div>
                <textarea
                  rows={2}
                  value={(editingProvider.customApiKeys || []).join('\n')}
                  onChange={(e) =>
                    setEditingProvider((prev) => ({
                      ...prev,
                      customApiKeys: e.target.value.split('\n').map((k) => k.trim()).filter((k) => k.length > 5),
                    }))
                  }
                  placeholder="Mỗi API Key 1 dòng (nếu muốn bổ sung ngoài file .env.local)"
                  className="w-full rounded-lg border border-slate-200 p-2.5 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>

              {/* TOGGLES */}
              <div className="flex flex-wrap items-center gap-6 border-t border-slate-100 pt-4 text-xs font-medium text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.enabled ?? true}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Kích hoạt sử dụng trong Router
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.isDefault ?? false}
                    onChange={(e) => setEditingProvider((prev) => ({ ...prev, isDefault: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Đặt làm Cổng Mặc Định ban đầu
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </Button>
              <Button
                onClick={handleSaveModal}
                disabled={saving}
                className="bg-brand-600 text-white hover:bg-brand-700"
              >
                <Save size={16} className="mr-2" />
                {saving ? 'Đang lưu…' : 'Lưu Cấu Hình'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
