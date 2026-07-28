'use client'

import { FormEvent, useEffect, useId, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { motion } from 'framer-motion'

type LocationOption = { code: number; name: string }

export type CheckoutSavedAddress = {
  id: string
  label: string
  recipientName: string
  addressLine: string
  ward: string | null
  province: string
  phoneNumber: string
  note: string | null
  isDefault: boolean
}

type Props = {
  initialName?: string
  initialPhone?: string
  onClose: () => void
  onSaved: (address: CheckoutSavedAddress) => void
  onError: (message: string) => void
}

const emptyForm = {
  label: 'Nhà riêng',
  recipientName: '',
  addressLine: '',
  ward: '',
  province: '',
  phoneNumber: '',
  note: '',
}

function searchable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
}

function LocationSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  loading = false,
}: {
  label: string
  options: LocationOption[]
  value: string
  onChange: (option: LocationOption | null) => void
  placeholder: string
  disabled?: boolean
  loading?: boolean
}) {
  const listId = useId()
  const selected = options.find(
    (option) => String(option.code) === value || option.name === value,
  )
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => setQuery(selected?.name ?? ''), [selected?.name])

  const normalizedQuery = searchable(query.trim())
  const filtered = options.filter(
    (option) =>
      !normalizedQuery || searchable(option.name).includes(normalizedQuery),
  )

  return (
    <div
      className="relative text-sm font-medium text-slate-700"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <label htmlFor={`${listId}-input`}>{label}</label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          disabled={disabled || loading}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (!selected || event.target.value !== selected.name) onChange(null)
          }}
          placeholder={loading ? 'Đang tải dữ liệu...' : placeholder}
          className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-10 font-normal outline-none focus:border-[#836100] disabled:bg-slate-50"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : (
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
      </div>
      <input className="sr-only" tabIndex={-1} required value={value} onChange={() => undefined} />
      {open && !disabled && !loading && (
        <div id={listId} role="listbox" className="absolute z-20 mt-2 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.length ? (
            filtered.map((option) => {
              const active = selected?.code === option.code
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option)
                    setQuery(option.name)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition active:scale-[0.99] ${
                    active ? 'bg-[#836100]/10 text-[#836100]' : 'hover:bg-slate-50'
                  }`}
                >
                  {option.name}
                  {active && <Check className="h-4 w-4" />}
                </button>
              )
            })
          ) : (
            <p className="px-3 py-5 text-center text-sm text-slate-500">
              Không tìm thấy kết quả phù hợp.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function CheckoutAddressModal({
  initialName = '',
  initialPhone = '',
  onClose,
  onSaved,
  onError,
}: Props) {
  const [form, setForm] = useState({ ...emptyForm, recipientName: initialName, phoneNumber: initialPhone })
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [wards, setWards] = useState<LocationOption[]>([])
  const [provinceCode, setProvinceCode] = useState('')
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [wardsLoading, setWardsLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/locations', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error?.message || 'Không thể tải tỉnh/thành phố.')
        }
        setProvinces(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocationError(
            error instanceof Error ? error.message : 'Không thể tải tỉnh/thành phố.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!provinceCode) {
      setWards([])
      return
    }
    const controller = new AbortController()
    setWardsLoading(true)
    setLocationError(null)
    fetch(`/api/v1/locations?provinceCode=${provinceCode}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error?.message || 'Không thể tải xã/phường.')
        }
        setWards(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocationError(
            error instanceof Error ? error.message : 'Không thể tải xã/phường.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWardsLoading(false)
      })
    return () => controller.abort()
  }, [provinceCode])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/v1/users/me/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || 'Không thể thêm địa chỉ.')
      }
      onSaved(payload.data as CheckoutSavedAddress)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Vui lòng thử lại.')
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-address-title"
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="checkout-address-title" className="text-xl font-bold text-slate-900">
              Thêm địa chỉ nhận hàng
            </h2>
            <p className="mt-1 text-sm text-slate-500">Địa chỉ này sẽ được lưu vào tài khoản của bạn.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng form thêm địa chỉ" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 active:scale-95 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Tên gợi nhớ
            <input required maxLength={80} value={form.label} onChange={(event) => update('label', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#836100]" />
          </label>          <label className="text-sm font-medium text-slate-700">
            Tên người nhận
            <input required maxLength={120} autoComplete="name" value={form.recipientName} onChange={(event) => update('recipientName', event.target.value)} placeholder="Nguyễn Văn A" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#836100]" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Số điện thoại
            <input required type="tel" inputMode="tel" autoComplete="tel" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} placeholder="0901234567" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#836100]" />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Địa chỉ chi tiết
            <input required maxLength={500} value={form.addressLine} onChange={(event) => update('addressLine', event.target.value)} placeholder="Số nhà, tên đường" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#836100]" />
          </label>
          <LocationSelect
            label="Tỉnh/Thành phố"
            options={provinces}
            value={provinceCode}
            loading={locationsLoading}
            placeholder="Tìm và chọn tỉnh/thành phố"
            onChange={(selected) => {
              setProvinceCode(selected ? String(selected.code) : '')
              update('province', selected?.name ?? '')
              update('ward', '')
            }}
          />
          <LocationSelect
            label="Phường/Xã"
            options={wards}
            value={form.ward}
            loading={wardsLoading}
            disabled={!provinceCode}
            placeholder={provinceCode ? 'Tìm và chọn xã/phường' : 'Chọn tỉnh/thành phố trước'}
            onChange={(selected) => update('ward', selected?.name ?? '')}
          />
          {locationError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{locationError}</p>}
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Ghi chú
            <textarea maxLength={500} rows={3} value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="Ví dụ: Giao hàng trong giờ hành chính" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[#836100]" />
          </label>
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={saving || locationsLoading || wardsLoading} className="inline-flex items-center gap-2 rounded-full bg-[#836100] px-6 py-3 text-sm font-bold text-white hover:bg-[#6a4e00] disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Đang lưu...' : 'Lưu địa chỉ'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
