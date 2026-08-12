'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  BatteryCharging,
  Check,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
  Zap,
} from 'lucide-react'

import { ImageUploadDropzone } from '@/components/admin/image-upload-dropzone'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import LandingPageRenderer from '@/components/landing-page-renderer'
import { CombinationMultiSelect } from '@/components/admin/combination-multi-select'

interface ColorEntry {
  color_name: string
  image_url: string
  swatch: string
  color_type?: 'STANDARD' | 'ADVANCED'
}

interface VersionEntry {
  id?: string
  name: string
  sku: string
  price: number
  deposit_amount: number
  stock_by_color?: Record<string, number>
  compatible_colors?: string[]
}

interface FormState {
  name: string
  slug: string
  description: string
  is_active: boolean
  listing_image_url: string
  hero_image_url: string
  detail_image_urls: string[]
  specifications: {
    'Quãng đường đi được mỗi lần sạc': string
    'Công suất tối đa': string
    'Tốc độ tối đa': string
    'Thời gian sạc tiêu chuẩn': string
    'Dài x Rộng x Cao': string
    'Chiều cao yên': string
    'Khoảng sáng gầm': string
    'Thể tích cốp': string
    'Trọng lượng': string
    'Khóa xe': string
    'Loại pin/ắc quy': string
    'Đèn pha trước': string
    'Phanh trước và sau': string
    'Giảm xóc': string
    'Tiêu chuẩn chống nước động cơ': string
    'Kích thước lốp Trước - Sau': string
  }
  colors: ColorEntry[]
  advanced_color_price: number
  versions: VersionEntry[]
  landing_page_blocks: any[]
}

const initialFormState: FormState = {
  name: '',
  slug: '',
  description: '',
  is_active: true,
  listing_image_url: '',
  hero_image_url: '',
  detail_image_urls: ['', '', ''],
  specifications: {
    'Quãng đường đi được mỗi lần sạc': '',
    'Công suất tối đa': '',
    'Tốc độ tối đa': '',
    'Thời gian sạc tiêu chuẩn': '',
    'Dài x Rộng x Cao': '',
    'Chiều cao yên': '',
    'Khoảng sáng gầm': '',
    'Thể tích cốp': '',
    'Trọng lượng': '',
    'Khóa xe': '',
    'Loại pin/ắc quy': '',
    'Đèn pha trước': '',
    'Phanh trước và sau': '',
    'Giảm xóc': '',
    'Tiêu chuẩn chống nước động cơ': '',
    'Kích thước lốp Trước - Sau': '',
  },
  colors: [],
  advanced_color_price: 0,
  versions: [],
  landing_page_blocks: [],
}

export default function EditMotorbikePage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params)
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initialFormState)
  const [originalForm, setOriginalForm] = useState<FormState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'basic' | 'images' | 'specs' | 'variants' | 'landing_page'>('basic')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [previewColorIndex, setPreviewColorIndex] = useState(0)

  const STORAGE_KEY = `FASTLANE_MOTORBIKE_EDIT_DRAFT_${productId}`

  // Toast notify helper
  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4000)
  }, [])

  // Load product from database
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/v1/admin/motorbikes/${productId}`, { cache: 'no-store' })
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || 'Không thể tải dữ liệu xe máy điện.')
        }
        const payload = await res.json()
        const dbState = payload.data as FormState

        // Check if there is an autosaved edit draft in localStorage
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (parsed.name && parsed.name !== dbState.name) {
              setShowRestorePrompt(true)
            }
          } catch (e) {
            console.error('Failed to parse draft', e)
          }
        }

        setForm(dbState)
        setOriginalForm(dbState)
      } catch (e: any) {
        notify('error', 'Tải sản phẩm thất bại', e.message)
      } finally {
        setIsLoading(false)
      }
    }
    void fetchProduct()
  }, [productId, notify, STORAGE_KEY])

  // Save edit draft to localStorage on form changes (only after loading is complete)
  useEffect(() => {
    if (!isLoading && form !== initialFormState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    }
  }, [form, isLoading, STORAGE_KEY])

  // Restore draft
  const handleRestoreDraft = () => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as FormState
        setForm(parsed)
        notify('success', 'Đã khôi phục bản nháp chỉnh sửa')
      } catch (e) {
        notify('error', 'Khôi phục bản nháp thất bại')
      }
    }
    setShowRestorePrompt(false)
  }

  // Discard draft
  const handleDiscardDraft = () => {
    localStorage.removeItem(STORAGE_KEY)
    setShowRestorePrompt(false)
    notify('warning', 'Bỏ qua bản nháp chỉnh sửa', 'Tiếp tục dùng dữ liệu từ cơ sở dữ liệu.')
  }

  // Cancel action (Ask confirmation via warning toast if draft exists and form is modified)
  const handleCancel = () => {
    const isFormDirty = originalForm ? JSON.stringify(form) !== JSON.stringify(originalForm) : false
    if (!isFormDirty) {
      localStorage.removeItem(STORAGE_KEY)
      router.push('/admin/products')
      return
    }

    const toastId = Date.now() + Math.random()
    setToasts((items) => [
      ...items,
      {
        id: toastId,
        kind: 'warning',
        title: 'Xác nhận hủy chỉnh sửa?',
        message: 'Bản nháp chỉnh sửa tạm thời sẽ bị xóa vĩnh viễn và không thể khôi phục.',
        action: {
          label: 'Xóa và hủy',
          variant: 'danger',
          onClick: () => {
            setToasts((current) => current.filter((item) => item.id !== toastId))
            localStorage.removeItem(STORAGE_KEY)
            notify('success', 'Đã hủy chỉnh sửa', 'Bản nháp chỉnh sửa tạm thời đã được dọn sạch.')
            setTimeout(() => {
              router.push('/admin/products')
            }, 800)
          },
        },
        secondaryAction: {
          label: 'Quay lại',
          onClick: () => {
            setToasts((current) => current.filter((item) => item.id !== toastId))
          },
        },
      },
    ])
  }

  // Auto fill slug from name
  const handleNameChange = (val: string) => {
    const slugified = val
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
    setForm((current) => ({
      ...current,
      name: val,
      slug: slugified,
    }))
  }

  const handleUpdateSpec = (key: keyof FormState['specifications'], val: string) => {
    setForm((current) => ({
      ...current,
      specifications: {
        ...current.specifications,
        [key]: val,
      },
    }))
  }

  // Add/Remove colors
  const addColor = () => {
    setForm((current) => ({
      ...current,
      colors: [...current.colors, { color_name: 'Màu mới', image_url: '', swatch: '', color_type: 'STANDARD' }],
      versions: current.versions.map((version) => ({
        ...version,
        compatible_colors: [...(version.compatible_colors ?? current.colors.map((color) => color.color_name)), 'Màu mới'],
      })),
    }))
  }

  const removeColor = (index: number) => {
    if (form.colors.length <= 1) {
      notify('warning', 'Không thể xóa', 'Sản phẩm cần tối thiểu một màu sắc.')
      return
    }
    setForm((current) => {
      const removedName = current.colors[index].color_name
      return {
        ...current,
        colors: current.colors.filter((_, idx) => idx !== index),
        versions: current.versions.map((version) => {
          const stockByColor = { ...(version.stock_by_color ?? {}) }
          delete stockByColor[removedName]
          return {
            ...version,
            compatible_colors: (version.compatible_colors ?? current.colors.map((color) => color.color_name)).filter((name) => name !== removedName),
            stock_by_color: stockByColor,
          }
        }),
      }
    })
  }

  const updateColor = (index: number, fields: Partial<ColorEntry>) => {
    setForm((current) => {
      const previousName = current.colors[index].color_name
      const nextName = fields.color_name ?? previousName
      return {
        ...current,
        colors: current.colors.map((c, idx) => (idx === index ? { ...c, ...fields } : c)),
        versions: previousName !== nextName ? current.versions.map((version) => {
          const stockByColor = { ...(version.stock_by_color ?? {}) }
          if (Object.prototype.hasOwnProperty.call(stockByColor, previousName)) {
            stockByColor[nextName] = stockByColor[previousName]
            delete stockByColor[previousName]
          }
          return {
            ...version,
            compatible_colors: (version.compatible_colors ?? current.colors.map((color) => color.color_name))
              .map((name) => name === previousName ? nextName : name),
            stock_by_color: stockByColor,
          }
        }) : current.versions,
      }
    })
  }

  // Add/Remove versions
  const addVersion = () => {
    setForm((current) => ({
      ...current,
      versions: [
        ...current.versions,
        {
          name: 'Phiên bản mới',
          sku: `VINFAST-NEW-${Date.now().toString().slice(-4)}`,
          price: 20000000,
          deposit_amount: 2000000,
          compatible_colors: current.colors.map((color) => color.color_name),
          stock_by_color: {},
        },
      ],
    }))
  }

  const removeVersion = (index: number) => {
    if (form.versions.length <= 1) {
      notify('warning', 'Không thể xóa', 'Sản phẩm cần tối thiểu một phiên bản để định giá.')
      return
    }
    setForm((current) => ({
      ...current,
      versions: current.versions.filter((_, idx) => idx !== index),
    }))
  }

  const updateVersion = (index: number, fields: Partial<VersionEntry>) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((v, idx) => (idx === index ? { ...v, ...fields } : v)),
    }))
  }

  const selectedColorsFor = (version: VersionEntry) =>
    version.compatible_colors ?? form.colors.map((color) => color.color_name)

  const updateCompatibleColors = (versionIndex: number, colors: string[]) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((version, index) => index === versionIndex
        ? { ...version, compatible_colors: Array.from(new Set(colors)) }
        : version),
    }))
  }

  const updateVariantStock = (versionIndex: number, colorName: string, value: number) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((version, index) => index === versionIndex
        ? { ...version, stock_by_color: { ...(version.stock_by_color ?? {}), [colorName]: Math.max(0, value || 0) } }
        : version),
    }))
  }

  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null)

  const addBlock = (type: string) => {
    const id = `block-${Date.now()}`
    let data: any = {}
    if (type === 'HERO_BANNER') {
      data = { title: 'Tiêu đề Banner', subtitle: 'Phụ đề ngắn', backgroundImage: '', ctaLabel: 'Đặt mua', ctaLink: '#deposit', textColor: 'light' }
    } else if (type === 'TEXT_IMAGE_SPLIT') {
      data = { title: 'Tiêu đề khối', description: 'Mô tả chi tiết', image: '', imagePosition: 'right', backgroundColor: '#ffffff' }
    } else if (type === 'HIGHLIGHT_GRID') {
      data = { title: 'Thông số nổi bật', items: [
        { label: 'Quãng đường', value: '198 km', description: 'Mỗi lần sạc đầy pin LFP thế hệ mới' },
        { label: 'Tốc độ tối đa', value: '78 km/h', description: 'Vận hành mạnh mẽ' },
        { label: 'Thời gian sạc', value: '6 giờ', description: 'Sạc tiêu chuẩn' }
      ] }
    } else if (type === 'IMAGE_GALLERY') {
      data = { title: 'Bộ sưu tập hình ảnh', images: [] }
    } else if (type === 'VIDEO_EMBED') {
      data = { title: 'Khám phá qua video', videoUrl: '' }
    }

    setForm((current) => ({
      ...current,
      landing_page_blocks: [...current.landing_page_blocks, { id, type, data }]
    }))
    setExpandedBlockId(id)
  }

  const deleteBlock = (id: string) => {
    setForm((current) => ({
      ...current,
      landing_page_blocks: current.landing_page_blocks.filter((b) => b.id !== id)
    }))
    if (expandedBlockId === id) setExpandedBlockId(null)
  }

  const updateBlockData = (id: string, key: string, val: any) => {
    setForm((current) => ({
      ...current,
      landing_page_blocks: current.landing_page_blocks.map((b) => {
        if (b.id !== id) return b
        return { ...b, data: { ...b.data, [key]: val } }
      })
    }))
  }

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const blocks = [...form.landing_page_blocks]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= blocks.length) return
    const temp = blocks[index]
    blocks[index] = blocks[targetIndex]
    blocks[targetIndex] = temp
    setForm((current) => ({
      ...current,
      landing_page_blocks: blocks
    }))
  }

  // Validate form fields
  const validateForm = () => {
    if (!form.name.trim()) return 'Tên xe không được để trống'
    if (!form.slug.trim()) return 'Slug không được để trống'
    if (!form.listing_image_url) return 'Hình ảnh thumbnail không được để trống (Tab 2)'
    if (!form.hero_image_url) return 'Hình ảnh landing page không được để trống (Tab 2)'
    if (form.colors.some((c) => !c.color_name.trim() || !c.image_url || !c.swatch)) {
      return 'Tất cả các màu phải có đầy đủ tên màu, hình xe và hình swatch (Tab 4)'
    }
    if (form.versions.some((v) => !v.name.trim() || !v.sku.trim() || v.price <= 0 || v.deposit_amount <= 0)) {
      return 'Vui lòng nhập đầy đủ thông tin tên, SKU, giá và tiền cọc cho tất cả phiên bản (Tab 4)'
    }
    if (form.versions.some((version) => selectedColorsFor(version).length === 0)) {
      return 'Mỗi phiên bản phải áp dụng cho ít nhất một màu xe (Tab 4)'
    }
    return null
  }

  // Submit PATCH to API
  const handleSaveProduct = async () => {
    const errorMsg = validateForm()
    if (errorMsg) {
      notify('error', 'Dữ liệu không hợp lệ', errorMsg)
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/v1/admin/motorbikes/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Lỗi không xác định khi cập nhật.')
      }

      notify('success', 'Cập nhật sản phẩm thành công', 'Thông tin xe máy điện đã được lưu lại.')
      localStorage.removeItem(STORAGE_KEY)
      setTimeout(() => {
        router.push('/admin/products')
      }, 1000)
    } catch (e: any) {
      notify('error', 'Cập nhật thất bại', e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500 font-medium">Đang tải thông tin xe máy điện...</p>
      </div>
    )
  }

  const isDirty = originalForm ? JSON.stringify(form) !== JSON.stringify(originalForm) : false

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 pb-24">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/products')}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
            aria-label="Quay lại"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Chỉnh sửa xe máy điện</h1>
            <p className="text-xs text-slate-500 mt-1">Cập nhật thông số, màu sắc, phiên bản và hình ảnh của xe {form.name}.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPreviewOpen(true)}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
          >
            <Eye size={16} className="mr-2 text-brand-600" /> Xem trước
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel} className="hover:bg-slate-50 font-semibold text-slate-700">
            Hủy
          </Button>
          <Button
            type="button"
            disabled={isSaving || !isDirty}
            onClick={() => void handleSaveProduct()}
            className="bg-slate-950 text-white hover:bg-slate-900 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Lưu thay đổi
          </Button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: 'basic', label: 'Thông tin chung', icon: FileText },
          { id: 'images', label: 'Hình ảnh sản phẩm', icon: ImageIcon },
          { id: 'specs', label: 'Thông số kỹ thuật', icon: Layers },
          { id: 'variants', label: 'Màu sắc & Phiên bản', icon: Palette },
          { id: 'landing_page', label: 'Thiết kế Landing Page', icon: LayoutGrid },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                isActive
                  ? 'border-slate-950 text-slate-950'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Form Content Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {activeTab === 'basic' && (
          <div className="space-y-6 max-w-3xl">
            <h3 className="text-base font-bold text-slate-900">Thông tin cơ bản</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Tên xe máy điện *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Evo 200, Feliz S"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Slug (Đường dẫn tĩnh) *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: evo-200, feliz-s"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Mô tả ngắn *</label>
              <textarea
                rows={4}
                placeholder="Nhập mô tả giới thiệu xe máy điện..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 accent-slate-900 rounded focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="is_active" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                Kích hoạt hiển thị sản phẩm ngay
              </label>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-8">
            {/* Thumbnail Image */}
            <div className="max-w-2xl">
              <h4 className="text-sm font-bold text-slate-900">Hình ảnh Thumbnail sản phẩm (Listing Image) *</h4>
              <p className="text-xs text-slate-500 mt-1 mb-3">Hình ảnh hiển thị ở danh mục sản phẩm. Nền trắng hoặc trong suốt.</p>
              {form.listing_image_url ? (
                <div className="relative w-48 h-32 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden group">
                  <img src={form.listing_image_url} alt="Thumbnail preview" className="max-w-full max-h-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, listing_image_url: '' })}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : (
                <div className="w-64">
                  <ImageUploadDropzone onUploadSuccess={(urls) => setForm({ ...form, listing_image_url: urls[0] })} />
                </div>
              )}
            </div>

            {/* Landing Page Hero Image */}
            <div className="max-w-2xl border-t border-slate-100 pt-6">
              <h4 className="text-sm font-bold text-slate-900">Hình ảnh Banner chính (Hero Banner) *</h4>
              <p className="text-xs text-slate-500 mt-1 mb-3">Hình ảnh nền khổ lớn trên cùng của trang chi tiết sản phẩm.</p>
              {form.hero_image_url ? (
                <div className="relative w-96 h-48 rounded-lg border bg-slate-950 overflow-hidden group">
                  <img src={form.hero_image_url} alt="Hero banner preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, hero_image_url: '' })}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ) : (
                <div className="w-96">
                  <ImageUploadDropzone onUploadSuccess={(urls) => setForm({ ...form, hero_image_url: urls[0] })} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Thông số kỹ thuật của xe</h3>
              <p className="text-xs text-slate-500 mt-1">Các thông số này sẽ hiển thị trong bảng so sánh chi tiết.</p>
            </div>

            {/* Core Specs Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 bg-slate-50 rounded-xl p-5 border border-slate-100">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                  <BatteryCharging size={14} className="text-brand-600" /> Quãng đường/Sạc
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Khoảng 198 km"
                  value={form.specifications['Quãng đường đi được mỗi lần sạc']}
                  onChange={(e) => handleUpdateSpec('Quãng đường đi được mỗi lần sạc', e.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                  <Zap size={14} className="text-brand-600" /> Công suất tối đa
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 3000 W"
                  value={form.specifications['Công suất tối đa']}
                  onChange={(e) => handleUpdateSpec('Công suất tối đa', e.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                  <Gauge size={14} className="text-brand-600" /> Tốc độ tối đa
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 78 km/h"
                  value={form.specifications['Tốc độ tối đa']}
                  onChange={(e) => handleUpdateSpec('Tốc độ tối đa', e.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                  <Clock size={14} className="text-brand-600" /> Thời gian sạc
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Khoảng 6 giờ"
                  value={form.specifications['Thời gian sạc tiêu chuẩn']}
                  onChange={(e) => handleUpdateSpec('Thời gian sạc tiêu chuẩn', e.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500"
                />
              </div>
            </div>

            {/* General Specs Grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 pt-6">
              {[
                { label: 'Kích thước Dài x Rộng x Cao', key: 'Dài x Rộng x Cao', placeholder: 'Ví dụ: 1850 x 705 x 1130 mm' },
                { label: 'Chiều cao yên', key: 'Chiều cao yên', placeholder: 'Ví dụ: 780 mm' },
                { label: 'Khoảng sáng gầm', key: 'Khoảng sáng gầm', placeholder: 'Ví dụ: 145 mm' },
                { label: 'Thể tích cốp', key: 'Thể tích cốp', placeholder: 'Ví dụ: 25 Lít' },
                { label: 'Trọng lượng', key: 'Trọng lượng', placeholder: 'Ví dụ: 110 kg' },
                { label: 'Khóa xe', key: 'Khóa xe', placeholder: 'Ví dụ: Smartkey' },
                { label: 'Loại pin/ắc quy', key: 'Loại pin/ắc quy', placeholder: 'Ví dụ: Pin LFP' },
                { label: 'Đèn pha trước', key: 'Đèn pha trước', placeholder: 'Ví dụ: Đèn LED' },
                { label: 'Phanh trước và sau', key: 'Phanh trước và sau', placeholder: 'Ví dụ: Phanh đĩa Trước / Phanh cơ Sau' },
                { label: 'Hệ thống giảm xóc', key: 'Giảm xóc', placeholder: 'Ví dụ: Giảm chấn thủy lực' },
                { label: 'Chuẩn chống nước động cơ', key: 'Tiêu chuẩn chống nước động cơ', placeholder: 'Ví dụ: IP67' },
                { label: 'Kích thước lốp Trước - Sau', key: 'Kích thước lốp Trước - Sau', placeholder: 'Ví dụ: 90/90-12 Trước & Sau' },
              ].map((spec) => (
                <div key={spec.key}>
                  <label className="block text-xs font-semibold text-slate-600">{spec.label}</label>
                  <input
                    type="text"
                    placeholder={spec.placeholder}
                    value={form.specifications[spec.key as keyof FormState['specifications']]}
                    onChange={(e) => handleUpdateSpec(spec.key as any, e.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'variants' && (
          <div className="space-y-8">
            {/* Color section */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">1. Màu sắc xe</h3>
                  <p className="text-xs text-slate-500 mt-1">Cập nhật các tùy chọn màu sắc, hình xe và swatch màu.</p>
                </div>
                <button
                  type="button"
                  onClick={addColor}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition"
                >
                  <Plus size={14} /> Thêm màu
                </button>
              </div>

              <div className="space-y-4">
                {form.colors.map((color, idx) => (
                  <div
                    key={idx}
                    className="grid gap-4 sm:grid-cols-12 items-center rounded-lg border border-slate-200 p-4 bg-slate-50/50"
                  >
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tên màu</label>
                      <input
                        type="text"
                        value={color.color_name}
                        onChange={(e) => updateColor(idx, { color_name: e.target.value })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh xe (Color Image)</label>
                      {color.image_url ? (
                        <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                          <img src={color.image_url} alt="Car color" className="w-10 h-7 object-contain" />
                          <button
                            type="button"
                            onClick={() => updateColor(idx, { image_url: '' })}
                            className="text-red-500 hover:bg-red-50 rounded p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <ImageUploadDropzone compact label="Tải hình xe" onUploadSuccess={(urls) => updateColor(idx, { image_url: urls[0] })} />
                      )}
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình Swatch màu</label>
                      {color.swatch ? (
                        <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                          <img src={color.swatch} alt="Color swatch" className="w-8 h-6 object-contain" />
                          <button
                            type="button"
                            onClick={() => updateColor(idx, { swatch: '' })}
                            className="text-red-500 hover:bg-red-50 rounded p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <ImageUploadDropzone compact label="Tải swatch" onUploadSuccess={(urls) => updateColor(idx, { swatch: urls[0] })} />
                      )}
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeColor(idx)}
                        className="rounded-lg p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        aria-label="Xóa màu"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Nhóm màu</label>
                      <select value={color.color_type ?? 'STANDARD'} onChange={(e) => updateColor(idx, { color_type: e.target.value as ColorEntry['color_type'] })} className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500">
                        <option value="STANDARD">Màu tiêu chuẩn</option>
                        <option value="ADVANCED">Màu nâng cao</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Version section */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">2. Các phiên bản & Giá bán</h3>
                  <p className="text-xs text-slate-500 mt-1">Cập nhật giá bán gốc, tiền đặt cọc và SKU cho mỗi phiên bản.</p>
                </div>
                <button
                  type="button"
                  onClick={addVersion}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition"
                >
                  <Plus size={14} /> Thêm phiên bản
                </button>
              </div>

              <div className="space-y-4">
                {form.versions.map((ver, idx) => (
                  <div
                    key={idx}
                    className="grid gap-4 sm:grid-cols-12 items-center rounded-lg border border-slate-200 p-4 bg-slate-50/50"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tên phiên bản</label>
                      <input
                        type="text"
                        value={ver.name}
                        onChange={(e) => updateVersion(idx, { name: e.target.value })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-600 uppercase">SKU gốc</label>
                      <input
                        type="text"
                        value={ver.sku}
                        onChange={(e) => updateVersion(idx, { sku: e.target.value })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Giá bán (VND)</label>
                      <input
                        type="number"
                        value={ver.price}
                        onChange={(e) => updateVersion(idx, { price: Number(e.target.value) })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tiền cọc (VND)</label>
                      <input
                        type="number"
                        value={ver.deposit_amount}
                        onChange={(e) => updateVersion(idx, { deposit_amount: Number(e.target.value) })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeVersion(idx)}
                        className="rounded-lg p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        aria-label="Xóa phiên bản"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="sm:col-span-12 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-600">Màu áp dụng</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Chỉ các cặp được chọn mới được lưu và theo dõi tồn kho.</p>
                      </div>
                      <CombinationMultiSelect
                        label={`Màu áp dụng cho ${ver.name}`}
                        options={form.colors.map((color) => color.color_name)}
                        selected={selectedColorsFor(ver)}
                        onChange={(colors) => updateCompatibleColors(idx, colors)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {form.colors.some((color) => color.color_type === 'ADVANCED') && (
                <label className="mt-4 block max-w-xs text-xs font-bold uppercase text-slate-600">
                  Phụ thu chung cho màu nâng cao (VND)
                  <input type="number" min="0" value={form.advanced_color_price} onChange={(event) => setForm((current) => ({ ...current, advanced_color_price: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500" />
                </label>
              )}
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-base font-bold text-slate-900">3. Tồn kho của các tổ hợp hợp lệ</h3>
              <p className="mt-1 text-xs text-slate-500">Chỉ những cặp phiên bản–màu đã áp dụng ở trên được lưu thành biến thể bán hàng.</p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-600">
                    <tr><th className="px-4 py-3">Phiên bản</th><th className="px-4 py-3">Màu ngoại thất</th><th className="px-4 py-3">Số lượng tồn</th></tr>
                  </thead>
                  <tbody>
                    {form.versions.flatMap((version, versionIndex) => selectedColorsFor(version).map((colorName) => (
                      <tr key={`${versionIndex}-${version.sku}-${colorName}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-800">{version.name || 'Phiên bản chưa đặt tên'}</td>
                        <td className="px-4 py-3 text-slate-700">{colorName}</td>
                        <td className="px-4 py-2">
                          <input
                            aria-label={`Tồn kho ${version.name} - ${colorName}`}
                            type="number"
                            min="0"
                            step="1"
                            value={version.stock_by_color?.[colorName] ?? 0}
                            onChange={(event) => updateVariantStock(versionIndex, colorName, Number(event.target.value))}
                            className="h-9 w-28 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500"
                          />
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'landing_page' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Thiết kế Landing Page</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sắp xếp và tùy biến các khối nội dung hiển thị trên trang chi tiết sản phẩm.
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      addBlock(e.target.value)
                      e.target.value = ''
                    }
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-brand-500"
                  defaultValue=""
                >
                  <option value="" disabled>+ Thêm khối nội dung</option>
                  <option value="HERO_BANNER">Khối Banner Chính (Hero)</option>
                  <option value="TEXT_IMAGE_SPLIT">Khối Chữ kèm Ảnh (Split)</option>
                  <option value="HIGHLIGHT_GRID">Khối Thông số nổi bật (Grid)</option>
                  <option value="IMAGE_GALLERY">Khối Thư viện ảnh (Gallery)</option>
                  <option value="VIDEO_EMBED">Khối Video nhúng (YouTube)</option>
                </select>
              </div>
            </div>

            {form.landing_page_blocks.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center text-slate-400">
                Chưa có khối nội dung nào. Vui lòng chọn một khối từ danh sách phía trên để bắt đầu thiết kế.
              </div>
            ) : (
              <div className="space-y-4">
                {form.landing_page_blocks.map((block, index) => {
                  const isExpanded = expandedBlockId === block.id
                  return (
                    <div
                      key={block.id}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition hover:border-slate-300"
                    >
                      {/* Block Header */}
                      <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
                            className="font-bold text-slate-900 text-sm hover:underline text-left"
                          >
                            {index + 1}. {block.data.title || 'Khối không tên'}
                          </button>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                            {block.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveBlock(index, 'up')}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            aria-label="Di chuyển lên"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={index === form.landing_page_blocks.length - 1}
                            onClick={() => moveBlock(index, 'down')}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            aria-label="Di chuyển xuống"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock(block.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 ml-2"
                            aria-label="Xóa khối"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Block Body (Editor form fields) */}
                      {isExpanded && (
                        <div className="p-5 space-y-4 border-t border-slate-100">
                          {block.type === 'HERO_BANNER' && (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề chính</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề phụ (Subtitle)</label>
                                <input
                                  type="text"
                                  value={block.data.subtitle || ''}
                                  onChange={(e) => updateBlockData(block.id, 'subtitle', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Ảnh nền Banner (Background Image)</label>
                                {block.data.backgroundImage && (
                                  <div className="mb-2 relative h-20 w-36 rounded overflow-hidden border border-slate-200">
                                    <img src={block.data.backgroundImage} className="h-full w-full object-cover" alt="Hero background" />
                                    <button
                                      type="button"
                                      onClick={() => updateBlockData(block.id, 'backgroundImage', '')}
                                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
                                      title="Xóa ảnh"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                                <ImageUploadDropzone
                                  compact
                                  label="Chọn ảnh nền"
                                  onUploadSuccess={(urls) => updateBlockData(block.id, 'backgroundImage', urls[0])}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Màu chữ (Text Color)</label>
                                <select
                                  value={block.data.textColor || 'light'}
                                  onChange={(e) => updateBlockData(block.id, 'textColor', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                >
                                  <option value="light">Sáng (Trắng)</option>
                                  <option value="dark">Tối (Đen)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Nhãn nút bấm (CTA Label)</label>
                                <input
                                  type="text"
                                  value={block.data.ctaLabel || 'Đặt mua ngay'}
                                  onChange={(e) => updateBlockData(block.id, 'ctaLabel', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Liên kết nút bấm (CTA Link)</label>
                                <input
                                  type="text"
                                  value={block.data.ctaLink || '#deposit'}
                                  onChange={(e) => updateBlockData(block.id, 'ctaLink', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                            </div>
                          )}

                          {block.type === 'TEXT_IMAGE_SPLIT' && (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề chính</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Nội dung mô tả</label>
                                <textarea
                                  value={block.data.description || ''}
                                  onChange={(e) => updateBlockData(block.id, 'description', e.target.value)}
                                  rows={3}
                                  className="mt-1.5 w-full rounded-md border border-slate-200 p-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh khối</label>
                                {block.data.image && (
                                  <div className="mb-2 relative h-20 w-36 rounded overflow-hidden border border-slate-200">
                                    <img src={block.data.image} className="h-full w-full object-cover" alt="Split layout block" />
                                    <button
                                      type="button"
                                      onClick={() => updateBlockData(block.id, 'image', '')}
                                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
                                      title="Xóa ảnh"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                                <ImageUploadDropzone
                                  compact
                                  label="Tải ảnh lên"
                                  onUploadSuccess={(urls) => updateBlockData(block.id, 'image', urls[0])}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Vị trí ảnh</label>
                                <select
                                  value={block.data.imagePosition || 'right'}
                                  onChange={(e) => updateBlockData(block.id, 'imagePosition', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                >
                                  <option value="right">Bên phải</option>
                                  <option value="left">Bên trái</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Màu nền khối (Background Color Hex)</label>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <input
                                    type="text"
                                    placeholder="Ví dụ: #ffffff"
                                    value={block.data.backgroundColor || '#ffffff'}
                                    onChange={(e) => updateBlockData(block.id, 'backgroundColor', e.target.value)}
                                    className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
                                  />
                                  <div className="flex gap-1.5">
                                    {[
                                      { value: '#ffffff', label: 'Trắng', bg: 'bg-white border-slate-300' },
                                      { value: '#f8fafc', label: 'Xám nhạt', bg: 'bg-slate-50 border-slate-300' },
                                      { value: '#fef08a', label: 'Vàng nhạt', bg: 'bg-yellow-100 border-yellow-200' },
                                      { value: '#f59e0b', label: 'Vàng hổ phách', bg: 'bg-amber-500 border-transparent' },
                                      { value: '#0f172a', label: 'Xanh Đen', bg: 'bg-slate-900 border-transparent' },
                                      { value: '#000000', label: 'Đen', bg: 'bg-black border-transparent' },
                                    ].map((colorOpt) => (
                                      <button
                                        key={colorOpt.value}
                                        type="button"
                                        title={colorOpt.label}
                                        onClick={() => updateBlockData(block.id, 'backgroundColor', colorOpt.value)}
                                        className={`h-7 w-7 rounded-full border ${colorOpt.bg} hover:scale-105 active:scale-95 transition shadow-sm`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {block.type === 'HIGHLIGHT_GRID' && (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề khối</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div className="border-t border-slate-100 pt-4">
                                <p className="text-xs font-bold text-slate-700 uppercase mb-3">Các chỉ số nổi bật (Tối đa 3)</p>
                                <div className="grid gap-4 sm:grid-cols-3">
                                  {(block.data.items || []).slice(0, 3).map((item: any, itemIdx: number) => (
                                    <div key={itemIdx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Tên nhãn (ví dụ: Tốc độ)</label>
                                        <input
                                          type="text"
                                          value={item.label || ''}
                                          onChange={(e) => {
                                            const newItems = [...block.data.items]
                                            newItems[itemIdx] = { ...item, label: e.target.value }
                                            updateBlockData(block.id, 'items', newItems)
                                          }}
                                          className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs bg-white"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Giá trị (ví dụ: 78 km/h)</label>
                                        <input
                                          type="text"
                                          value={item.value || ''}
                                          onChange={(e) => {
                                            const newItems = [...block.data.items]
                                            newItems[itemIdx] = { ...item, value: e.target.value }
                                            updateBlockData(block.id, 'items', newItems)
                                          }}
                                          className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs bg-white"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Mô tả chi tiết</label>
                                        <input
                                          type="text"
                                          value={item.description || ''}
                                          onChange={(e) => {
                                            const newItems = [...block.data.items]
                                            newItems[itemIdx] = { ...item, description: e.target.value }
                                            updateBlockData(block.id, 'items', newItems)
                                          }}
                                          className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-xs bg-white"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {block.type === 'IMAGE_GALLERY' && (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề khối</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Danh sách ảnh thư viện</label>
                                <div className="grid grid-cols-4 gap-2 mb-3">
                                  {(block.data.images || []).map((imgUrl: string, imgIdx: number) => (
                                    <div key={imgIdx} className="relative h-20 rounded overflow-hidden border border-slate-200">
                                      <img src={imgUrl} className="h-full w-full object-cover" alt={`Gallery item ${imgIdx}`} />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newImages = block.data.images.filter((_: any, idx: number) => idx !== imgIdx)
                                          updateBlockData(block.id, 'images', newImages)
                                        }}
                                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
                                        title="Xóa ảnh"
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <ImageUploadDropzone
                                  compact
                                  label="Tải ảnh lên thư viện"
                                  onUploadSuccess={(urls) => {
                                    const newImages = [...(block.data.images || []), ...urls]
                                    updateBlockData(block.id, 'images', newImages)
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {block.type === 'VIDEO_EMBED' && (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề khối</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-600 uppercase">Đường dẫn video YouTube</label>
                                <input
                                  type="text"
                                  placeholder="Ví dụ: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                                  value={block.data.videoUrl || ''}
                                  onChange={(e) => updateBlockData(block.id, 'videoUrl', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recover Draft Dialog overlay */}
      <AnimatePresence>
        {showRestorePrompt && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200"
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-900">Phát hiện thay đổi chưa lưu</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-500">
                  Bạn có một bản nháp thay đổi chưa được lưu lại trong bộ nhớ tạm cho xe {form.name}. Bạn có muốn tiếp tục chỉnh sửa từ bản nháp đó không?
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 bg-slate-50 px-6 py-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={handleDiscardDraft} className="text-slate-700 bg-white font-semibold">
                  Sử dụng dữ liệu gốc
                </Button>
                <Button type="button" onClick={handleRestoreDraft} className="bg-slate-900 text-white hover:bg-slate-800 font-bold">
                  Khôi phục bản nháp
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full screen Premium Product Landing Page Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            className="fixed inset-0 z-50 overflow-y-auto bg-black text-white select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Sticky Preview Banner Header */}
            <div className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 backdrop-blur">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Chế độ xem trước
              </span>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase hover:bg-white/20 transition active:scale-95"
              >
                <X size={14} /> Quay lại chỉnh sửa
              </button>
            </div>

            {/* Landing Page Content Mockup */}
            <div className="min-h-screen pb-32">
              {/* HERO Banner */}
              <section id="preview-top" className="relative flex h-[90vh] min-h-[600px] w-full flex-col justify-between overflow-hidden">
                {form.hero_image_url ? (
                  <img
                    src={form.hero_image_url}
                    alt={form.name || 'Motorbike Hero'}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 h-full w-full bg-slate-900 flex items-center justify-center text-slate-500 text-sm">
                    Chưa đăng tải banner landing page
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

                <div className="relative z-10 mt-28 flex flex-col items-center px-6 text-center">
                  <span className="text-xs font-bold uppercase tracking-[0.32em] text-white/60">Xe máy điện</span>
                  <h1 className="mt-3 text-5xl font-black uppercase tracking-[-0.04em] text-white sm:text-7xl lg:text-8xl drop-shadow">
                    {form.name || 'Tên dòng xe'}
                  </h1>
                  <p className="mt-4 rounded-full border border-white/20 bg-black/40 px-5 py-2 text-sm font-semibold text-white/95 backdrop-blur-sm">
                    Giá khởi điểm: {form.versions.length > 0 ? formatPrice(Math.min(...form.versions.map((v) => v.price))) : 'Liên hệ'}
                  </p>
                </div>

                <div className="relative z-10 flex w-full flex-col items-center pb-12">
                  <div className="mb-12 flex gap-4">
                    <button type="button" className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold uppercase tracking-widest text-black shadow-xl">
                      Trải nghiệm
                    </button>
                    <button type="button" className="flex h-12 items-center justify-center rounded-full border-2 border-white bg-transparent px-8 text-sm font-bold uppercase tracking-widest text-white shadow-xl backdrop-blur-sm">
                      Đặt cọc ngay
                    </button>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Khám phá thông số</span>
                  <span className="mt-4 h-10 w-px bg-white/20" />
                </div>
              </section>

              {/* STICKY NAV BAR */}
              <div className="sticky top-14 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
                  <h2 className="text-lg font-bold">{form.name || 'Tên xe'}</h2>
                  <nav className="flex gap-6 text-sm font-bold text-white/60">
                    <button
                      type="button"
                      onClick={() => document.getElementById('preview-top')?.scrollIntoView({ behavior: 'smooth' })}
                      className="text-white border-b-2 border-brand-500 pb-1 hover:text-white"
                    >
                      Tổng quan
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('preview-specs')?.scrollIntoView({ behavior: 'smooth' })}
                      className="hover:text-white"
                    >
                      Thông số
                    </button>
                    <button
                      type="button"
                      onClick={() => document.getElementById('preview-details')?.scrollIntoView({ behavior: 'smooth' })}
                      className="hover:text-white"
                    >
                      Chi tiết
                    </button>
                  </nav>
                </div>
              </div>

              {/* COLOR SELECTOR AND VEHICLE DISPLAY */}
              <section className="mx-auto max-w-6xl px-6 py-20">
                <div className="grid gap-12 lg:grid-cols-12 items-center">
                  <div className="lg:col-span-8 flex justify-center items-center h-96 bg-slate-900/40 border border-white/5 rounded-2xl p-6 relative">
                    {form.colors.length > 0 && form.colors[previewColorIndex]?.image_url ? (
                      <motion.img
                        key={previewColorIndex}
                        src={form.colors[previewColorIndex].image_url}
                        alt="Preview bike color"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="text-slate-500 text-sm">Chưa cập nhật hình ảnh màu xe</div>
                    )}
                    <span className="absolute bottom-4 left-6 text-xs text-white/40">Màu đang xem: {form.colors[previewColorIndex]?.color_name || 'N/A'}</span>
                  </div>

                  {/* Swatches details */}
                  <div className="lg:col-span-4 space-y-6">
                    <h3 className="text-2xl font-bold uppercase tracking-tight">Chọn màu sắc của bạn</h3>
                    <p className="text-sm text-white/60 leading-6">{form.description || 'Chưa cung cấp mô tả xe máy điện.'}</p>

                    <div className="flex flex-wrap gap-3 pt-3">
                      {form.colors.map((color, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewColorIndex(idx)}
                          className={`relative h-11 w-11 rounded-full border-2 p-0.5 transition active:scale-95 ${
                            previewColorIndex === idx ? 'border-brand-500 bg-brand-500/20' : 'border-white/20 hover:border-white/50'
                          }`}
                        >
                          {color.swatch ? (
                            <img src={color.swatch} alt={color.color_name} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <span className="block h-full w-full rounded-full bg-slate-800" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* CORE PERFORMANCE STATS */}
              <section className="bg-slate-900/50 border-y border-white/5 py-16">
                <div className="mx-auto max-w-6xl px-6">
                  <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: 'Quãng đường',
                        value: form.specifications['Quãng đường đi được mỗi lần sạc'] || 'N/A',
                        icon: BatteryCharging,
                      },
                      { label: 'Công suất tối đa', value: form.specifications['Công suất tối đa'] || 'N/A', icon: Zap },
                      { label: 'Tốc độ tối đa', value: form.specifications['Tốc độ tối đa'] || 'N/A', icon: Gauge },
                      { label: 'Thời gian sạc', value: form.specifications['Thời gian sạc tiêu chuẩn'] || 'N/A', icon: Clock },
                    ].map((stat, idx) => {
                      const Icon = stat.icon
                      return (
                        <div key={idx} className="flex flex-col items-center text-center p-6 bg-slate-950/40 rounded-xl border border-white/5">
                          <Icon className="h-8 w-8 text-brand-500 mb-3" />
                          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{stat.label}</span>
                          <span className="text-xl font-bold mt-2 text-white">{stat.value}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>

              {form.landing_page_blocks && form.landing_page_blocks.length > 0 ? (
                <div id="preview-details" className="bg-slate-950 text-white">
                  <LandingPageRenderer blocks={form.landing_page_blocks} />
                </div>
              ) : (
                <>
                  {/* DETAIL IMAGES LANDING */}
                  <section id="preview-details" className="mx-auto max-w-6xl px-6 py-20">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-black uppercase tracking-wider">Khám phá chi tiết</h3>
                  <p className="text-xs text-white/50 mt-2">Được thiết kế tinh xảo, đáp ứng đầy đủ mọi nhu cầu di chuyển.</p>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  {form.detail_image_urls.map((url, idx) => (
                    <div key={idx} className="h-64 rounded-xl border border-white/5 bg-slate-900 overflow-hidden relative group">
                      {url ? (
                        <img src={url} alt={`Detail view ${idx}`} className="w-full h-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-500 text-xs">Chưa tải ảnh chi tiết #{idx + 1}</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                        <span className="text-xs font-bold text-white/70">Hình ảnh chi tiết #{idx + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
                </>
              )}

              {/* COMPLETE SPECS GRID TABLE */}
              <section id="preview-specs" className="bg-slate-950/80 py-16">
                <div className="mx-auto max-w-3xl px-6">
                  <h3 className="text-xl font-bold text-center mb-8 border-b border-white/10 pb-4">Bảng thông số kỹ thuật chi tiết</h3>
                  <div className="divide-y divide-white/5 text-sm">
                    {Object.entries(form.specifications).map(([key, val]) => (
                      <div key={key} className="flex py-3 justify-between items-center gap-4">
                        <span className="text-white/60 font-semibold">{key}</span>
                        <span className="text-white font-bold text-right">{val || 'Chưa cập nhật'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
