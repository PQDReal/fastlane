'use client'

import { FormEvent, useEffect, useId, useState } from 'react'
import { Check, ChevronDown, Loader2, MapPin, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import type { ToastMessage } from '@/components/ui/toast'
import { SearchableLocationSelect, type LocationOption } from '@/components/ui/searchable-location-select'

type SavedAddress = {
  id: string
  label: string
  recipientName: string
  addressLine: string
  ward: string | null
  province: string
  phoneNumber: string
  note: string | null
  isDefault: boolean
  updatedAt: string
}

type Props = {
  profileName?: string
  profilePhone?: string
  showToast: (kind: ToastMessage['kind'], title: string, message?: string, actions?: Pick<ToastMessage, 'action' | 'secondaryAction'>) => void
}

const emptyForm = { label: 'Nhà riêng', recipientName: '', addressLine: '', ward: '', province: '', phoneNumber: '', note: '', isDefault: false }

async function responsePayload(response: Response) {
  return response.json().catch(() => ({}))
}

export function ProfileSavedAddresses({ profileName = '', profilePhone = '', showToast }: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm, recipientName: profileName, phoneNumber: profilePhone })
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [wards, setWards] = useState<LocationOption[]>([])
  const [provinceCode, setProvinceCode] = useState('')
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [wardsLoading, setWardsLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLocationsLoading(true)
    fetch('/api/v1/locations', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await responsePayload(response)
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải tỉnh/thành phố.')
        if (active) setProvinces(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (active) setLocationError(error instanceof Error ? error.message : 'Không thể tải tỉnh/thành phố.')
      })
      .finally(() => { if (active) setLocationsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!provinceCode) {
      setWards([])
      return
    }
    const controller = new AbortController()
    setWardsLoading(true)
    setLocationError(null)
    fetch(`/api/v1/locations?provinceCode=${provinceCode}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await responsePayload(response)
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải xã/phường.')
        setWards(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLocationError(error instanceof Error ? error.message : 'Không thể tải xã/phường.')
      })
      .finally(() => { if (!controller.signal.aborted) setWardsLoading(false) })
    return () => controller.abort()
  }, [provinceCode])
  useEffect(() => {
    if (!profilePhone) return
    setForm((current) => current.phoneNumber ? current : { ...current, phoneNumber: profilePhone })
  }, [profilePhone])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/v1/users/me/addresses', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await responsePayload(response)
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải địa chỉ đã lưu.')
        if (active) setAddresses(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Không thể tải địa chỉ đã lưu.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm({ ...emptyForm, recipientName: profileName, phoneNumber: profilePhone })
    setProvinceCode('')
    setWards([])
    setLocationError(null)
  }

  function startNewAddress() {
    closeForm()
    setFormOpen(true)
  }

  function startEditing(address: SavedAddress) {
    const province = provinces.find((item) => item.name === address.province)
    if (!province) {
      showToast('error', 'Không thể sửa địa chỉ', 'Không tìm thấy tỉnh/thành phố đã lưu trong danh sách hiện tại.')
      return
    }
    setEditingId(address.id)
    setForm({ label: address.label, recipientName: address.recipientName, addressLine: address.addressLine, ward: address.ward ?? '', province: address.province, phoneNumber: address.phoneNumber, note: address.note ?? '', isDefault: address.isDefault })
    setProvinceCode(String(province.code))
    setLocationError(null)
    setFormOpen(true)
  }
  async function deleteAddress(address: SavedAddress) {
    if (deletingId) return
    setDeletingId(address.id)
    try {
      const response = await fetch(`/api/v1/users/me/addresses/${address.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await responsePayload(response)
        throw new Error(payload?.error?.message || 'Không thể xóa địa chỉ.')
      }
      setAddresses((current) => {
        const remaining = current.filter((item) => item.id !== address.id)
        if (address.isDefault && remaining.length > 0) return remaining.map((item, index) => ({ ...item, isDefault: index === 0 }))
        return remaining
      })
      if (editingId === address.id) closeForm()
      showToast('success', 'Đã xóa địa chỉ')
    } catch (error) {
      showToast('error', 'Không thể xóa địa chỉ', error instanceof Error ? error.message : 'Vui lòng thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  function requestDelete(address: SavedAddress) {
    showToast('warning', 'Xóa địa chỉ đã lưu?', `Địa chỉ “${address.label}” sẽ bị xóa khỏi tài khoản.`, {
      secondaryAction: { label: 'Hủy', onClick: () => undefined },
      action: { label: 'Xóa', variant: 'danger', onClick: () => void deleteAddress(address) },
    })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch(editingId ? `/api/v1/users/me/addresses/${editingId}` : '/api/v1/users/me/addresses', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await responsePayload(response)
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể lưu địa chỉ.')
      const saved = payload.data as SavedAddress
      setAddresses((current) => {
        if (!editingId) return saved.isDefault ? [saved, ...current.map((address) => ({ ...address, isDefault: false }))] : [saved, ...current]
        const previous = current.find((address) => address.id === editingId)
        let assignedReplacement = false
        return current.map((address) => {
          if (address.id === editingId) return saved
          if (saved.isDefault) return { ...address, isDefault: false }
          if (previous?.isDefault && !assignedReplacement) {
            assignedReplacement = true
            return { ...address, isDefault: true }
          }
          return address
        })
      })
      showToast('success', editingId ? 'Đã cập nhật địa chỉ' : 'Đã thêm địa chỉ mới')
      closeForm()
    } catch (error) {
      showToast('error', editingId ? 'Không thể cập nhật địa chỉ' : 'Không thể thêm địa chỉ', error instanceof Error ? error.message : 'Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const addressLimitReached = addresses.length >= 10
  const editingAddress = editingId ? addresses.find((address) => address.id === editingId) : null
  const hasAddressChanges = editingAddress ? (
    form.label.trim() !== editingAddress.label.trim() ||
    form.recipientName.trim() !== editingAddress.recipientName.trim() ||
    form.addressLine.trim() !== editingAddress.addressLine.trim() ||
    form.ward.trim() !== (editingAddress.ward ?? '').trim() ||
    form.province.trim() !== editingAddress.province.trim() ||
    form.phoneNumber.replace(/[\s.-]/g, '') !== editingAddress.phoneNumber.replace(/[\s.-]/g, '') ||
    form.note.trim() !== (editingAddress.note ?? '').trim() ||
    form.isDefault !== editingAddress.isDefault
  ) : true
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-gray-900">Địa chỉ đã lưu</h2><p className="mt-1 text-sm text-gray-500">Dùng lại thông tin giao hàng cho những lần mua tiếp theo.</p></div>
        {!formOpen && <button type="button" onClick={startNewAddress} disabled={addressLimitReached} className="inline-flex items-center gap-2 rounded-full bg-[#836100] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6a4e00] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Thêm địa chỉ</button>}
      </div>

      {addressLimitReached && !formOpen && (
        <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Bạn đã lưu tối đa 10 địa chỉ. Vui lòng sửa hoặc xóa địa chỉ cũ trước khi thêm mới.</p>
      )}
      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.form initial={{ opacity: 0, y: -12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.99 }} transition={{ duration: 0.2 }} onSubmit={submit} className="mb-6 rounded-2xl border border-[#836100]/20 bg-[#836100]/5 p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-gray-900">{editingId ? 'Sửa địa chỉ' : 'Địa chỉ mới'}</h3><button type="button" onClick={closeForm} className="rounded-full p-2 text-gray-500 hover:bg-white hover:text-gray-900" aria-label="Đóng biểu mẫu thêm địa chỉ"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Tên gợi nhớ<input value={form.label} onChange={(event) => update('label', event.target.value)} maxLength={80} required className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal focus:border-[#836100] focus:outline-none" placeholder="Nhà riêng, Công ty..." /></label><label className="text-sm font-medium text-gray-700">Tên người nhận<input value={form.recipientName} onChange={(event) => update('recipientName', event.target.value)} maxLength={120} required autoComplete="name" className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal focus:border-[#836100] focus:outline-none" placeholder="Nguyễn Văn A" /></label>
            <label className="text-sm font-medium text-gray-700">Số điện thoại<input type="tel" inputMode="tel" autoComplete="tel" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} required className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal focus:border-[#836100] focus:outline-none" placeholder="0901234567" /></label>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">Địa chỉ chi tiết<input value={form.addressLine} onChange={(event) => update('addressLine', event.target.value)} maxLength={500} required className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal focus:border-[#836100] focus:outline-none" placeholder="Số nhà, tên đường" /></label>
            <SearchableLocationSelect label="Tỉnh/Thành phố" options={provinces} value={provinceCode} loading={locationsLoading} placeholder="Tìm và chọn tỉnh/thành phố" onChange={(selected) => { setProvinceCode(selected ? String(selected.code) : ''); update('province', selected?.name ?? ''); update('ward', '') }} />
            <SearchableLocationSelect label="Phường/Xã" options={wards} value={form.ward} loading={wardsLoading} disabled={!provinceCode} placeholder={provinceCode ? 'Tìm và chọn xã/phường' : 'Chọn tỉnh/thành phố trước'} onChange={(selected) => update('ward', selected?.name ?? '')} />
            {locationError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{locationError}</p>}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 sm:col-span-2"><input type="checkbox" checked={form.isDefault} onChange={(event) => update('isDefault', event.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[#836100]" /><span>Đặt làm địa chỉ mặc định</span></label>
            <label className="text-sm font-medium text-gray-700 sm:col-span-2">Ghi chú<textarea value={form.note} onChange={(event) => update('note', event.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal focus:border-[#836100] focus:outline-none" placeholder="Ví dụ: Giao hàng trong giờ hành chính" /></label>
          </div>
          <button type="submit" disabled={saving || (Boolean(editingId) && !hasAddressChanges)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#836100] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Đang lưu...' : editingId ? 'Cập nhật địa chỉ' : 'Lưu địa chỉ'}</button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#836100]" /></div>
      ) : loadError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
      ) : addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center"><MapPin className="mx-auto h-9 w-9 text-gray-300" /><p className="mt-3 text-sm text-gray-500">Bạn chưa lưu địa chỉ nào.</p></div>
      ) : (
        <motion.div layout className="max-h-[min(640px,70vh)] space-y-4 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]">
          <AnimatePresence initial={false}>
          {addresses.map((address) => (
            <motion.article layout key={`${address.id}-${address.updatedAt}`} initial={{ opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24, scale: 0.98 }} transition={{ duration: 0.2 }} className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between ${address.isDefault ? 'border-[#836100]/40 bg-[#836100]/5' : 'border-gray-100 bg-white'}`}>
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#836100]/10 text-[#836100]"><MapPin className="h-5 w-5" /></div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{address.label}</h3>{address.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-[#836100] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"><Star className="h-3 w-3 fill-current" />Mặc định</span>}</div><p className="mt-2 text-sm leading-6 text-gray-600">{address.addressLine}{address.ward ? `, ${address.ward}` : ''}, {address.province}</p><p className="mt-2 text-sm font-medium text-gray-700">{address.recipientName} · {address.phoneNumber}</p>{address.note && <p className="mt-2 text-xs leading-5 text-gray-500">Ghi chú: {address.note}</p>}</div>
              </div>
              <div className="flex shrink-0 gap-2"><button type="button" onClick={() => startEditing(address)} disabled={locationsLoading || deletingId === address.id} className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#836100]/40 hover:text-[#836100] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] disabled:cursor-wait disabled:opacity-50"><Pencil className="h-4 w-4" />Sửa</button><button type="button" onClick={() => requestDelete(address)} disabled={deletingId === address.id} className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-50">{deletingId === address.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Xóa</button></div>
            </motion.article>
          ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
