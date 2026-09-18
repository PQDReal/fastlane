'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  BatteryCharging,
  Check,
  ChevronLeft,
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
import { formatSpecificationValue } from '@/lib/spec-formatter'

const STORAGE_KEY = 'fastlane.admin.products.cars.new.v1'

const colorMap: Record<string, string> = {
  'Solar Ruby': '#941B26',
  'Zenith Grey': '#464952',
  'Urban Mint': '#B6C4BE',
  'Infinity Blanc': '#F0F0F0',
  'Jet Black': '#0A0A0A',
  'Summer Yellow': '#FFD700',
  'Rose Pink': '#FFC0CB',
  'Sky Blue': '#87CEEB',
  'Brahminy White': '#F8F9FA',
  'Desat Silver': '#C0C0C0',
  'Neptune Grey': '#708090',
  'VinFast Blue': '#003366',
  'Crimson Red': '#DC143C',
  'Sunset Orange': '#FF4500',
  'Deep Ocean': '#000080',
  'Pebble Beige': '#D5C4A1',
  'Ivy Green': '#556B2F',
  'Xám': '#747B7D',
  'Đen': '#171717',
  'Đen nhám': '#171717',
  'Đen bóng': '#111111',
  'Đỏ tươi': '#C8202F',
  'Đỏ': '#C8202F',
  'Đỏ Đen': '#C8202F',
  'Trắng': '#F5F3EC',
  'Trắng Cam': '#F5F3EC',
  'Tím': '#6B5B95',
  'Xanh': '#607D6A',
  'Xanh Rêu': '#607D6A',
  'Xanh Oliu': '#788A57',
  'Xanh oliu': '#788A57',
  'Xanh tím than': '#26354A',
  'Đen Xám Xi Măng': '#747B7D',
  'Vàng Cát': '#C9A45C',
  'Vàng cát': '#C9A45C',
  'Xanh rêu': '#829B8B',
  'Trắng ngọc trai': '#F5F3EC'
}

interface ColorEntry {
  color_name: string
  image_url: string
  swatch: string
  images_by_version?: Record<string, string>
  color_type?: 'STANDARD' | 'ADVANCED'
}

interface InteriorEntry {
  interior_name: string
  image_url: string
  image_urls?: string[]
  swatch: string
  allowed_combinations?: string[]
}

interface VersionEntry {
  name: string
  sku: string
  price: number
  deposit_amount: number
  compatible_colors?: string[]
  interiors_by_color?: Record<string, string[]>
  stock_by_configuration?: Record<string, number>
}

const configurationKey = (exterior: string, interior: string) => JSON.stringify([exterior, interior])

interface FormState {
  name: string
  slug: string
  description: string
  is_active: boolean
  listing_image_url: string
  hero_image_url: string
  logo_image_url: string
  brochure_url: string
  detail_image_urls: string[]
  specifications: {
    'Quãng đường đi được': string
    'Công suất tối đa': string
    'Mô-men xoắn cực đại': string
    'Tốc độ tối đa': string
    'Hệ dẫn động': string
    'Dung lượng pin': string
    'Thời gian sạc nhanh': string
    'Công suất sạc DC tối đa': string
    'Dài x Rộng x Cao': string
    'Chiều dài cơ sở': string
    'Khoảng sáng gầm xe': string
    'Khối lượng / Tải trọng': string
    'Số chỗ ngồi': string
    'Đèn chiếu sáng phía trước': string
    'Kích thước la-zăng': string
    'Hệ thống giải trí': string
    'Hệ thống điều hòa': string
    'Điều chỉnh ghế lái': string
    'Hệ thống túi khí': string
    'Hệ thống ABS': string
    'Hệ thống EBD': string
  } & Record<string, string>
  hidden_specifications: string[]
  custom_specifications: { name: string; category: string }[]
  colors: ColorEntry[]
  advanced_color_price: number
  interiors: InteriorEntry[]
  versions: VersionEntry[]
  landing_page_blocks: any[]
}

const defaultLandingBlocks = [
  {
    id: 'hero-default',
    type: 'HERO_BANNER',
    data: {
      title: 'Khởi đầu kỷ nguyên xanh',
      subtitle: 'Mẫu xe ô tô điện thông minh, đẳng cấp và an toàn vượt trội.',
      backgroundImage: '',
      ctaLabel: 'Đặt cọc ngay',
      ctaLink: '#deposit',
      textColor: 'light'
    }
  },
  {
    id: 'split-default',
    type: 'TEXT_IMAGE_SPLIT',
    data: {
      title: 'Thiết kế thời thượng, khí chất dẫn đầu',
      description: 'Không gian nội thất rộng rãi kết hợp với đường nét thiết kế ngoại thất tinh tế từ các nhà thiết kế hàng đầu thế giới, mang đến vẻ đẹp cuốn hút từ mọi góc nhìn.',
      image: '',
      imagePosition: 'right',
      backgroundColor: '#ffffff'
    }
  },
  {
    id: 'grid-default',
    type: 'HIGHLIGHT_GRID',
    data: {
      title: 'Hiệu năng bứt phá',
      items: [
        { label: 'Quãng đường', value: '300+ km', description: 'Theo tiêu chuẩn WLTP sau mỗi lần sạc đầy' },
        { label: 'Sạc nhanh DC', value: '30 phút', description: 'Sạc từ 10% đến 70% tại trạm sạc siêu tốc' },
        { label: 'Số chỗ ngồi', value: '5 chỗ', description: 'Tối ưu hóa không gian sử dụng' }
      ]
    }
  }
]

const initialFormState: FormState = {
  name: '',
  slug: '',
  description: '',
  is_active: true,
  listing_image_url: '',
  hero_image_url: '',
  logo_image_url: '',
  brochure_url: '',
  detail_image_urls: [],
  specifications: {
    'Quãng đường đi được': '',
    'Công suất tối đa': '',
    'Mô-men xoắn cực đại': '',
    'Tốc độ tối đa': '',
    'Hệ dẫn động': '',
    'Dung lượng pin': '',
    'Thời gian sạc nhanh': '',
    'Công suất sạc DC tối đa': '',
    'Dài x Rộng x Cao': '',
    'Chiều dài cơ sở': '',
    'Khoảng sáng gầm xe': '',
    'Khối lượng / Tải trọng': '',
    'Số chỗ ngồi': '',
    'Đèn chiếu sáng phía trước': '',
    'Kích thước la-zăng': '',
    'Hệ thống giải trí': '',
    'Hệ thống điều hòa': '',
    'Điều chỉnh ghế lái': '',
    'Hệ thống túi khí': '',
    'Hệ thống ABS': '',
    'Hệ thống EBD': '',
  },
  hidden_specifications: [],
  custom_specifications: [],
  colors: [
    { color_name: 'Trắng (Brahminy White)', image_url: '', swatch: '', color_type: 'STANDARD' },
    { color_name: 'Xám (Neptune Grey)', image_url: '', swatch: '', color_type: 'STANDARD' },
  ],
  advanced_color_price: 0,
  interiors: [
    { interior_name: 'Đen (Granite Black)', image_url: '', swatch: '' },
    { interior_name: 'Nâu (Saddle Brown)', image_url: '', swatch: '' },
  ],
  versions: [
    { name: 'Phiên bản Eco (Thuê pin)', sku: 'VINFAST-CAR-ECO-01', price: 460000000, deposit_amount: 15000000, compatible_colors: ['Trắng (Brahminy White)', 'Xám (Neptune Grey)'], interiors_by_color: { 'Trắng (Brahminy White)': ['Đen (Granite Black)', 'Nâu (Saddle Brown)'], 'Xám (Neptune Grey)': ['Đen (Granite Black)', 'Nâu (Saddle Brown)'] }, stock_by_configuration: {} },
    { name: 'Phiên bản Plus (Thuê pin)', sku: 'VINFAST-CAR-PLUS-01', price: 530000000, deposit_amount: 15000000, compatible_colors: ['Trắng (Brahminy White)', 'Xám (Neptune Grey)'], interiors_by_color: { 'Trắng (Brahminy White)': ['Đen (Granite Black)', 'Nâu (Saddle Brown)'], 'Xám (Neptune Grey)': ['Đen (Granite Black)', 'Nâu (Saddle Brown)'] }, stock_by_configuration: {} },
  ],
  landing_page_blocks: defaultLandingBlocks,
}

export default function NewCarPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initialFormState)
  const [activeTab, setActiveTab] = useState<'basic' | 'images' | 'specs' | 'variants' | 'landing_page'>('basic')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAddSpecForm, setShowAddSpecForm] = useState(false)
  const [newSpecName, setNewSpecName] = useState('')
  const [newSpecCategory, setNewSpecCategory] = useState('Vận hành & Pin')

  // Temporary state for the preview color selection
  const [previewColorIndex, setPreviewColorIndex] = useState(0)

  // 1. Toast notify helper
  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4000)
  }, [])

  // 2. Load the current-tab session snapshot on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.name || parsed.slug || parsed.colors?.some((c: any) => c.image_url)) {
          setShowRestorePrompt(true)
        }
      } catch (e) {
        console.error('Failed to parse draft', e)
      }
    }
  }, [])

  // 3. Save the current-tab session snapshot on change
  useEffect(() => {
    if (form !== initialFormState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    }
  }, [form])

  // Restore draft
  const handleRestoreDraft = () => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setForm(JSON.parse(saved))
        notify('success', 'Đã khôi phục bản nháp', 'Dữ liệu trước đó đã được tải lại thành công.')
      } catch (e) {
        notify('error', 'Khôi phục bản nháp thất bại')
      }
    }
    setShowRestorePrompt(false)
  }

  // Reject draft / Start fresh
  const handleDiscardDraft = () => {
    localStorage.removeItem(STORAGE_KEY)
    setShowRestorePrompt(false)
    notify('warning', 'Bỏ qua bản nháp', 'Bắt đầu điền thông tin mới.')
  }

  // Cancel action
  const handleCancel = () => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      router.push('/admin/products')
      return
    }

    const toastId = Date.now() + Math.random()
    setToasts((items) => [
      ...items,
      {
        id: toastId,
        kind: 'warning',
        title: 'Xác nhận hủy tạo mới?',
        message: 'Bản nháp lưu tạm thời sẽ bị xóa vĩnh viễn và không thể khôi phục.',
        action: {
          label: 'Xóa và hủy',
          variant: 'danger',
          onClick: () => {
            setToasts((current) => current.filter((item) => item.id !== toastId))
            localStorage.removeItem(STORAGE_KEY)
            notify('success', 'Đã hủy tạo mới', 'Bản nháp lưu tạm đã được dọn sạch.')
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
    setForm((current) => {
      let nextBlocks = current.landing_page_blocks
      if (key === 'Quãng đường đi được') {
        nextBlocks = nextBlocks.map(block => {
          if (block.type === 'HIGHLIGHT_GRID') {
            return {
              ...block,
              data: {
                ...block.data,
                items: block.data.items?.map((item: any) =>
                  item.label === 'Quãng đường' ? { ...item, value: val } : item
                )
              }
            }
          }
          return block
        })
      } else if (key === 'Thời gian sạc nhanh') {
        nextBlocks = nextBlocks.map(block => {
          if (block.type === 'HIGHLIGHT_GRID') {
            return {
              ...block,
              data: {
                ...block.data,
                items: block.data.items?.map((item: any) =>
                  item.label === 'Thời gian sạc' ? { ...item, value: val } : item
                )
              }
            }
          }
          return block
        })
      }
      return {
        ...current,
        specifications: {
          ...current.specifications,
          [key]: formatSpecificationValue(key as string, val),
        },
        landing_page_blocks: nextBlocks
      }
    })
  }

  // Add/Remove colors
  const addColor = () => {
    setForm((current) => ({
      ...current,
      colors: [...current.colors, { color_name: 'Màu mới', image_url: '', swatch: '', color_type: 'STANDARD' }],
    }))
  }

  const removeColor = (index: number) => {
    if (form.colors.length <= 1) {
      notify('warning', 'Không thể xóa', 'Sản phẩm cần tối thiểu một màu sắc.')
      return
    }
    setForm((current) => {
      const removedName = current.colors[index]?.color_name
      return {
        ...current,
        colors: current.colors.filter((_, idx) => idx !== index),
        versions: current.versions.map((version) => {
          const interiorsByColor = { ...(version.interiors_by_color ?? {}) }
          if (removedName) delete interiorsByColor[removedName]
          const stockByConfiguration = Object.fromEntries(Object.entries(version.stock_by_configuration ?? {}).filter(([key]) => {
            try { return JSON.parse(key)[0] !== removedName } catch { return true }
          }))
          return {
            ...version,
            compatible_colors: (version.compatible_colors ?? current.colors.map((color) => color.color_name)).filter((name) => name !== removedName),
            interiors_by_color: interiorsByColor,
            stock_by_configuration: stockByConfiguration,
          }
        }),
      }
    })
  }

  const updateColor = (index: number, fields: Partial<ColorEntry>) => {
    setForm((current) => {
      const previousName = current.colors[index]?.color_name
      const nextName = fields.color_name
      return {
        ...current,
        colors: current.colors.map((c, idx) => (idx === index ? { ...c, ...fields } : c)),
        versions: previousName && nextName && previousName !== nextName
          ? current.versions.map((version) => {
              const interiorsByColor = { ...(version.interiors_by_color ?? {}) }
              if (interiorsByColor[previousName]) {
                interiorsByColor[nextName] = interiorsByColor[previousName]
                delete interiorsByColor[previousName]
              }
              const stockByConfiguration: Record<string, number> = {}
              Object.entries(version.stock_by_configuration ?? {}).forEach(([key, value]) => {
                try {
                  const [exterior, interior] = JSON.parse(key)
                  stockByConfiguration[configurationKey(exterior === previousName ? nextName : exterior, interior)] = value
                } catch { stockByConfiguration[key] = value }
              })
              return {
                ...version,
                compatible_colors: (version.compatible_colors ?? current.colors.map((color) => color.color_name)).map((name) => name === previousName ? nextName : name),
                interiors_by_color: interiorsByColor,
                stock_by_configuration: stockByConfiguration,
              }
            })
          : current.versions,
      }
    })
  }

  // Add/Remove versions
  const addVersion = () => {
    setForm((current) => ({
      ...current,
      versions: [
        ...current.versions,
        { name: 'Phiên bản mới', sku: `VINFAST-CAR-${Date.now().toString().slice(-4)}`, price: 500000000, deposit_amount: 15000000, compatible_colors: current.colors.map((color) => color.color_name), interiors_by_color: Object.fromEntries(current.colors.map((color) => [color.color_name, current.interiors.map((interior) => interior.interior_name)])), stock_by_configuration: {} },
      ],
    }))
  }

  const removeVersion = (index: number) => {
    if (form.versions.length <= 1) {
      notify('warning', 'Không thể xóa', 'Sản phẩm cần tối thiểu một phiên bản để định giá.')
      return
    }
    setForm((current) => {
      const versionToRemove = current.versions[index]?.name
      
      const newColors = current.colors.map(color => {
        if (!color.images_by_version || !versionToRemove || !color.images_by_version[versionToRemove]) return color
        const nextImages = { ...color.images_by_version }
        delete nextImages[versionToRemove]
        return { ...color, images_by_version: nextImages }
      })

      return {
        ...current,
        versions: current.versions.filter((_, idx) => idx !== index),
        colors: newColors
      }
    })
  }

  const updateVersion = (index: number, fields: Partial<VersionEntry>) => {
    setForm((current) => {
      const oldVersionName = current.versions[index]?.name

      // If name is changing, we must update all colors' images_by_version keys
      let newColors = current.colors
      if (fields.name !== undefined && fields.name !== oldVersionName && oldVersionName) {
        newColors = current.colors.map(color => {
          if (!color.images_by_version || !color.images_by_version[oldVersionName]) return color
          
          const newImagesByVersion = { ...color.images_by_version }
          newImagesByVersion[fields.name!] = newImagesByVersion[oldVersionName]
          delete newImagesByVersion[oldVersionName]
          
          return { ...color, images_by_version: newImagesByVersion }
        })
      }

      return {
        ...current,
        versions: current.versions.map((v, idx) => (idx === index ? { ...v, ...fields } : v)),
        colors: newColors,
      }
    })
  }

  const selectedColorsFor = (version: VersionEntry) =>
    version.compatible_colors ?? form.colors.map((color) => color.color_name)

  const selectedInteriorsFor = (version: VersionEntry, colorName: string) =>
    version.interiors_by_color?.[colorName] ?? form.interiors.map((interior) => interior.interior_name)

  const updateCompatibleColors = (versionIndex: number, colors: string[]) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((version, index) => index === versionIndex
        ? {
            ...version,
            compatible_colors: Array.from(new Set(colors)),
            interiors_by_color: Object.fromEntries(colors.map((color) => [color, version.interiors_by_color?.[color] ?? current.interiors.map((interior) => interior.interior_name)])),
          }
        : version),
    }))
  }

  const updateCompatibleInteriors = (versionIndex: number, colorName: string, interiors: string[]) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((version, index) => index === versionIndex
        ? { ...version, interiors_by_color: { ...(version.interiors_by_color ?? {}), [colorName]: Array.from(new Set(interiors)) } }
        : version),
    }))
  }

  const updateConfigurationStock = (versionIndex: number, exterior: string, interior: string, value: number) => {
    setForm((current) => ({
      ...current,
      versions: current.versions.map((version, index) => index === versionIndex
        ? { ...version, stock_by_configuration: { ...(version.stock_by_configuration ?? {}), [configurationKey(exterior, interior)]: Math.max(0, value || 0) } }
        : version),
    }))
  }

  // Add/Remove interiors
  const addInterior = () => {
    setForm((current) => ({
      ...current,
      interiors: [...(current.interiors || []), { interior_name: 'Màu nội thất mới', image_url: '', swatch: '' }],
    }))
  }

  const removeInterior = (index: number) => {
    if ((form.interiors || []).length <= 1) {
      notify('warning', 'Không thể xóa', 'Sản phẩm cần tối thiểu một màu nội thất.')
      return
    }
    setForm((current) => {
      const removedName = current.interiors[index]?.interior_name
      return {
        ...current,
        interiors: current.interiors.filter((_, idx) => idx !== index),
        versions: current.versions.map((version) => ({
          ...version,
          interiors_by_color: Object.fromEntries(Object.entries(version.interiors_by_color ?? {}).map(([color, names]) => [color, names.filter((name) => name !== removedName)])),
          stock_by_configuration: Object.fromEntries(Object.entries(version.stock_by_configuration ?? {}).filter(([key]) => {
            try { return JSON.parse(key)[1] !== removedName } catch { return true }
          })),
        })),
      }
    })
  }

  const updateInterior = (index: number, fields: Partial<InteriorEntry>) => {
    setForm((current) => {
      const previousName = current.interiors[index]?.interior_name
      const nextName = fields.interior_name
      return {
        ...current,
        interiors: current.interiors.map((interior, idx) => idx === index ? { ...interior, ...fields } : interior),
        versions: previousName && nextName && previousName !== nextName
          ? current.versions.map((version) => {
              const stockByConfiguration: Record<string, number> = {}
              Object.entries(version.stock_by_configuration ?? {}).forEach(([key, value]) => {
                try {
                  const [exterior, interior] = JSON.parse(key)
                  stockByConfiguration[configurationKey(exterior, interior === previousName ? nextName : interior)] = value
                } catch { stockByConfiguration[key] = value }
              })
              return {
                ...version,
                interiors_by_color: Object.fromEntries(Object.entries(version.interiors_by_color ?? {}).map(([color, names]) => [color, names.map((name) => name === previousName ? nextName : name)])),
                stock_by_configuration: stockByConfiguration,
              }
            })
          : current.versions,
      }
    })
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
        { label: 'Quãng đường', value: '300 km', description: 'Tiêu chuẩn sau mỗi lần sạc' },
        { label: 'Thời gian sạc', value: '30 phút', description: 'Sạc siêu tốc' },
        { label: 'Thiết kế', value: 'Hiện đại', description: 'Phong cách SUV lai Coupe' }
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
      return 'Tất cả các màu ngoại thất phải có đầy đủ tên màu, hình xe và hình swatch (Tab 4)'
    }
    if (form.interiors && form.interiors.some((i) => !i.interior_name.trim() || !i.image_url || !i.swatch)) {
      return 'Tất cả các màu nội thất phải có đầy đủ tên màu, hình nội thất và hình swatch (Tab 4)'
    }
    if (form.versions.some((v) => !v.name.trim() || !v.sku.trim() || v.price <= 0 || v.deposit_amount <= 0)) {
      return 'Vui lòng nhập đầy đủ thông tin tên, SKU, giá và tiền cọc cho tất cả phiên bản (Tab 4)'
    }
    if (form.versions.some((version) => selectedColorsFor(version).length === 0)) {
      return 'Mỗi phiên bản phải áp dụng cho ít nhất một màu ngoại thất (Tab 4)'
    }
    if (form.versions.some((version) => selectedColorsFor(version).some((color) => selectedInteriorsFor(version, color).length === 0))) {
      return 'Mỗi cặp phiên bản–ngoại thất phải có ít nhất một màu nội thất tương thích (Tab 4)'
    }
    return null
  }

  // Submit to API
  const handleSaveProduct = async () => {
    const errorMsg = validateForm()
    if (errorMsg) {
      notify('error', 'Dữ liệu không hợp lệ', errorMsg)
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/v1/admin/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Lỗi không xác định khi lưu.')
      }

      notify('success', 'Lưu sản phẩm thành công', 'Xe ô tô điện đã được thêm vào hệ thống.')
      localStorage.removeItem(STORAGE_KEY)
      setTimeout(() => {
        router.push('/admin/products')
      }, 1000)
    } catch (e: any) {
      notify('error', 'Lưu sản phẩm thất bại', e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  }

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
            <h1 className="text-2xl font-bold text-slate-950">Thêm xe ô tô điện mới</h1>
            <p className="text-xs text-slate-500 mt-1">Thiết lập thông số, màu sắc, phiên bản và hình ảnh của xe.</p>
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
            disabled={isSaving}
            onClick={() => void handleSaveProduct()}
            className="bg-slate-950 text-white hover:bg-slate-900 font-bold"
          >
            {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Lưu sản phẩm
          </Button>
        </div>
      </div>

      {/* Restore Draft Banner */}
      {showRestorePrompt && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h4 className="font-bold text-brand-900 text-sm">Tìm thấy bản nháp chưa lưu!</h4>
            <p className="text-xs text-brand-700 mt-0.5">Bạn có muốn tiếp tục chỉnh sửa từ phiên bản nháp lưu tạm trước đó không?</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg transition"
            >
              Bỏ qua
            </button>
            <Button
              type="button"
              onClick={handleRestoreDraft}
              className="bg-brand-600 text-white hover:bg-brand-700 text-xs py-2 h-8 font-bold"
            >
              Khôi phục bản nháp
            </Button>
          </div>
        </div>
      )}

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
                <label className="block text-sm font-semibold text-slate-700">Tên xe ô tô điện *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: VF 5 Plus, VF 8, VF 9"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">Slug (Đường dẫn tĩnh) *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: vf-5-plus, vf-8, vf-9"
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
                placeholder="Nhập mô tả giới thiệu xe ô tô điện..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Link Brochure / File PDF thông số</label>
              <input
                type="text"
                placeholder="Dán link Drive, Dropbox hoặc đường dẫn file PDF..."
                value={form.brochure_url || ''}
                onChange={(e) => setForm({ ...form, brochure_url: e.target.value })}
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                Kích hoạt hiển thị sản phẩm ngay sau khi tạo
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

            {/* Logo Image */}
            <div className="max-w-2xl border-t border-slate-100 pt-6">
              <h4 className="text-sm font-bold text-slate-900">Hình ảnh Logo xe (Car Logo)</h4>
              <p className="text-xs text-slate-500 mt-1 mb-3">Logo của xe (dạng chữ hoặc biểu tượng). Sẽ hiển thị ở trang Đặt cọc thay cho tên xe chữ thường.</p>
              {form.logo_image_url ? (
                <div className="relative w-48 h-20 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden group">
                  <img src={form.logo_image_url} alt="Logo preview" className="max-w-full max-h-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, logo_image_url: '' })}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ) : (
                <div className="w-64">
                  <ImageUploadDropzone onUploadSuccess={(urls) => setForm({ ...form, logo_image_url: urls[0] })} />
                </div>
              )}
            </div>

            {/* Gallery Images */}
            <div className="max-w-4xl border-t border-slate-100 pt-6">
              <h4 className="text-sm font-bold text-slate-900">Thư viện ảnh chi tiết (Detail Images)</h4>
              <p className="text-xs text-slate-500 mt-1 mb-3">Hình ảnh bổ sung hiển thị trong thư viện ảnh (tối đa 20 ảnh). Di chuột vào hình để đổi thứ tự.</p>
              <div className="flex flex-wrap gap-4 mb-4">
                {form.detail_image_urls.map((url, idx) => (
                  <div key={idx} className="relative w-36 h-24 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden group shadow-sm transition-all hover:shadow-md">
                    <img src={url} alt={`Detail ${idx + 1}`} className="max-w-full max-h-full object-contain p-1" />
                    
                    {/* Delete button (top-right on hover) */}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, detail_image_urls: form.detail_image_urls.filter((_, i) => i !== idx) })}
                      className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded transition opacity-0 group-hover:opacity-100 z-20"
                      title="Xóa hình ảnh"
                    >
                      <Trash2 size={12} />
                    </button>

                    {/* Move Left button (left side on hover) */}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const urls = [...form.detail_image_urls]
                          const temp = urls[idx]
                          urls[idx] = urls[idx - 1]
                          urls[idx - 1] = temp
                          setForm({ ...form, detail_image_urls: urls })
                        }}
                        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-black/60 hover:bg-brand-600 text-white rounded-full transition opacity-0 group-hover:opacity-100 z-20"
                        title="Di chuyển sang trái"
                      >
                        <ChevronLeft size={12} />
                      </button>
                    )}

                    {/* Move Right button (right side on hover) */}
                    {idx < form.detail_image_urls.length - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const urls = [...form.detail_image_urls]
                          const temp = urls[idx]
                          urls[idx] = urls[idx + 1]
                          urls[idx + 1] = temp
                          setForm({ ...form, detail_image_urls: urls })
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-black/60 hover:bg-brand-600 text-white rounded-full transition opacity-0 group-hover:opacity-100 z-20"
                        title="Di chuyển sang phải"
                      >
                        <ChevronRight size={12} />
                      </button>
                    )}

                    {/* Dark overlay on hover */}
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10" />
                  </div>
                ))}
              </div>
              {form.detail_image_urls.length < 20 && (
                <div className="w-64">
                  <ImageUploadDropzone onUploadSuccess={(urls) => setForm({ ...form, detail_image_urls: [...form.detail_image_urls, ...urls].slice(0, 20) })} />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-bold text-slate-900">Thông số kỹ thuật của xe</h3>
              <p className="text-xs text-slate-500 mt-1">Các thông số này sẽ hiển thị trong bảng so sánh chi tiết và cấu hình xe. Bấm vào biểu tượng con mắt để ẩn/hiện thông số.</p>
            </div>

            {/* Helper UI function for rendering a spec field */}
            {(() => {
              const renderSpecField = (key: string, label?: string, placeholder?: string, isCustom = false) => {
                const isHidden = form.hidden_specifications.includes(key)
                const displayLabel = label || key

                const handleToggleHidden = () => {
                  setForm(curr => ({
                    ...curr,
                    hidden_specifications: isHidden
                      ? curr.hidden_specifications.filter(k => k !== key)
                      : [...curr.hidden_specifications, key]
                  }))
                }

                const handleDelete = () => {
                  setForm(curr => {
                    const newSpecs = { ...curr.specifications }
                    delete newSpecs[key]
                    return {
                      ...curr,
                      custom_specifications: curr.custom_specifications.filter((k: any) => k.name ? k.name !== key : k !== key),
                      hidden_specifications: curr.hidden_specifications.filter((k: any) => k !== key),
                      specifications: newSpecs
                    }
                  })
                }

                return (
                  <div key={key} className={`group ${isHidden ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600 line-clamp-1" title={displayLabel}>
                        {displayLabel}
                      </label>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={handleToggleHidden}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500"
                          title={isHidden ? "Hiện thông số này" : "Ẩn thông số này"}
                        >
                          <Eye size={14} className={isHidden ? "text-slate-400 line-through" : ""} />
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="p-1 hover:bg-red-50 rounded text-red-500"
                            title="Xóa thông số này"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder={placeholder || `Nhập ${displayLabel.toLowerCase()}`}
                      value={form.specifications[key as keyof FormState['specifications']] || ''}
                      onChange={(e) => handleUpdateSpec(key as any, e.target.value)}
                      className={`h-10 w-full rounded-md border bg-white px-3 text-sm outline-none transition focus:ring-2 ${
                        isHidden 
                          ? 'border-slate-100 text-slate-400 focus:border-slate-300 focus:ring-slate-100' 
                          : 'border-slate-200 text-slate-900 focus:border-brand-500 focus:ring-brand-100'
                      }`}
                    />
                  </div>
                )
              }

              return (
                <>
                  {/* 1. Performance & Powertrain */}
                  <div className="space-y-4 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    <h4 className="text-sm font-bold flex items-center gap-1.5 border-b pb-2 text-slate-800">
                      <Zap size={16} className="text-brand-600" /> Vận hành & Pin
                    </h4>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      {renderSpecField('Quãng đường đi được', 'Quãng đường đi được *', 'Ví dụ: 300')}
                      {renderSpecField('Công suất tối đa', 'Công suất tối đa *', 'Ví dụ: 100')}
                      {renderSpecField('Mô-men xoắn cực đại', 'Mô-men xoắn cực đại', 'Ví dụ: 135')}
                      {renderSpecField('Tốc độ tối đa', 'Tốc độ tối đa', 'Ví dụ: 150')}
                      {renderSpecField('Hệ dẫn động', 'Hệ dẫn động', 'Ví dụ: FWD')}
                      {renderSpecField('Dung lượng pin', 'Dung lượng pin', 'Ví dụ: 37.23')}
                      {renderSpecField('Thời gian sạc nhanh', 'Thời gian sạc nhanh', 'Ví dụ: 30')}
                      {renderSpecField('Công suất sạc DC tối đa', 'Công suất sạc DC tối đa', 'Ví dụ: 60')}
                      {form.custom_specifications.filter((c: any) => c.category === 'Vận hành & Pin').map((c: any) => renderSpecField(c.name || c, c.name || c, undefined, true))}
                    </div>
                  </div>

                  {/* 2. Dimensions & Capacity */}
                  <div className="space-y-4 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    <h4 className="text-sm font-bold flex items-center gap-1.5 border-b pb-2 text-slate-800">
                      <Layers size={16} className="text-brand-600" /> Kích thước & Trọng lượng
                    </h4>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {renderSpecField('Dài x Rộng x Cao', 'Kích thước Dài x Rộng x Cao *', 'Nhập liền: 396517201580')}
                      {renderSpecField('Chiều dài cơ sở', 'Chiều dài cơ sở *', 'Ví dụ: 2513')}
                      {renderSpecField('Khoảng sáng gầm xe', 'Khoảng sáng gầm xe', 'Ví dụ: 182')}
                      {renderSpecField('Khối lượng / Tải trọng', 'Khối lượng / Tải trọng', 'Ví dụ: 1360325')}
                      {renderSpecField('Số chỗ ngồi', 'Số chỗ ngồi *', 'Ví dụ: 5 ghế')}
                      {form.custom_specifications.filter((c: any) => c.category === 'Kích thước & Trọng lượng').map((c: any) => renderSpecField(c.name || c, c.name || c, undefined, true))}
                    </div>
                  </div>

                  {/* 3. Interior & Exterior */}
                  <div className="space-y-4 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    <h4 className="text-sm font-bold flex items-center gap-1.5 border-b pb-2 text-slate-800">
                      <Palette size={16} className="text-brand-600" /> Nội thất & Ngoại thất
                    </h4>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {renderSpecField('Đèn chiếu sáng phía trước', 'Đèn chiếu sáng phía trước', 'Ví dụ: Đèn pha LED')}
                      {renderSpecField('Kích thước la-zăng', 'Kích thước la-zăng', 'Ví dụ: 16')}
                      {renderSpecField('Hệ thống giải trí', 'Hệ thống giải trí', 'Ví dụ: Màn hình 10 inch')}
                      {renderSpecField('Hệ thống điều hòa', 'Hệ thống điều hòa', 'Ví dụ: Tự động')}
                      {renderSpecField('Điều chỉnh ghế lái', 'Điều chỉnh ghế lái', 'Ví dụ: Chỉnh cơ 6 hướng')}
                      {form.custom_specifications.filter((c: any) => c.category === 'Nội thất & Ngoại thất').map((c: any) => renderSpecField(c.name || c, c.name || c, undefined, true))}
                    </div>
                  </div>

                  {/* 4. Safety */}
                  <div className="space-y-4 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    <h4 className="text-sm font-bold flex items-center gap-1.5 border-b pb-2 text-slate-800">
                      <Check size={16} className="text-brand-600" /> Hệ thống An toàn
                    </h4>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {renderSpecField('Hệ thống túi khí', 'Hệ thống túi khí', 'Ví dụ: 4 túi khí')}
                      {renderSpecField('Hệ thống ABS', 'Hệ thống ABS (Chống bó cứng)', 'Ví dụ: Có')}
                      {renderSpecField('Hệ thống EBD', 'Hệ thống EBD (Phân phối lực phanh)', 'Ví dụ: Có')}
                      {form.custom_specifications.filter((c: any) => c.category === 'Hệ thống An toàn').map((c: any) => renderSpecField(c.name || c, c.name || c, undefined, true))}
                    </div>
                  </div>

                  {/* 5. Custom Specs */}
                  <div className="space-y-4 bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                    <h4 className="text-sm font-bold flex items-center gap-1.5 border-b pb-2 text-slate-800">
                      <FileText size={16} className="text-brand-600" /> Thông số khác
                    </h4>
                    {form.custom_specifications.filter((c: any) => c.category === 'Thông số khác' || !c.category).length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Chưa có thông số tuỳ chỉnh nào ở mục này.</p>
                    ) : (
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {form.custom_specifications.filter((c: any) => c.category === 'Thông số khác' || !c.category).map((c: any) => renderSpecField(c.name || c, c.name || c, undefined, true))}
                      </div>
                    )}
                    <div className="pt-2">
                      {showAddSpecForm ? (
                        <div className="flex items-center gap-2 max-w-xl">
                          <select 
                            value={newSpecCategory}
                            onChange={(e) => setNewSpecCategory(e.target.value)}
                            className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500"
                          >
                            <option value="Vận hành & Pin">Vận hành & Pin</option>
                            <option value="Kích thước & Trọng lượng">Kích thước & Trọng lượng</option>
                            <option value="Nội thất & Ngoại thất">Nội thất & Ngoại thất</option>
                            <option value="Hệ thống An toàn">Hệ thống An toàn</option>
                            <option value="Thông số khác">Thông số khác</option>
                          </select>
                          <input
                            type="text"
                            value={newSpecName}
                            onChange={(e) => setNewSpecName(e.target.value)}
                            placeholder="Tên thông số (ví dụ: Góc thoát)"
                            className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const trimmed = newSpecName.trim()
                                if (!trimmed) return
                                if (form.specifications[trimmed as any] !== undefined) {
                                  notify('error', 'Lỗi', 'Thông số này đã tồn tại')
                                  return
                                }
                                setForm(curr => ({
                                  ...curr,
                                  custom_specifications: [...curr.custom_specifications, { name: trimmed, category: newSpecCategory }],
                                  specifications: { ...curr.specifications, [trimmed]: '' }
                                }))
                                setNewSpecName('')
                                setShowAddSpecForm(false)
                              } else if (e.key === 'Escape') {
                                setShowAddSpecForm(false)
                                setNewSpecName('')
                              }
                            }}
                          />
                          <Button 
                            type="button" 
                            size="sm"
                            onClick={() => {
                              const trimmed = newSpecName.trim()
                              if (!trimmed) return
                              if (form.specifications[trimmed as any] !== undefined) {
                                notify('error', 'Lỗi', 'Thông số này đã tồn tại')
                                return
                              }
                              setForm(curr => ({
                                ...curr,
                                custom_specifications: [...curr.custom_specifications, { name: trimmed, category: newSpecCategory }],
                                specifications: { ...curr.specifications, [trimmed]: '' }
                              }))
                              setNewSpecName('')
                              setShowAddSpecForm(false)
                            }}
                          >
                            Thêm
                          </Button>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setShowAddSpecForm(false)
                              setNewSpecName('')
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddSpecForm(true)}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-slate-200 bg-white shadow-sm hover:bg-slate-100 hover:text-slate-900 h-9 px-4 py-2"
                        >
                          <Plus size={16} className="mr-2" /> Thêm thông số
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}
        {activeTab === 'variants' && (
          <div className="space-y-8">
            {/* Version section */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">1. Các phiên bản & Giá bán</h3>
                  <p className="text-xs text-slate-500 mt-1">Thiết lập giá bán gốc, tiền đặt cọc và SKU cho mỗi phiên bản.</p>
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
                  </div>
                ))}
              </div>
            </div>

            {/* Color section */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">2. Màu ngoại thất xe</h3>
                  <p className="text-xs text-slate-500 mt-1">Thêm các tùy chọn màu kèm ảnh xe tương ứng và swatch màu sắc.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded border border-slate-200">
                    <label className="text-[11px] font-bold text-slate-600">Giá màu nâng cao:</label>
                    <input
                      type="number"
                      min={0}
                      value={form.advanced_color_price || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, advanced_color_price: Number(e.target.value) }))}
                      className="h-7 w-28 rounded border border-slate-200 px-2 text-xs text-slate-900 outline-none focus:border-brand-500"
                      placeholder="0"
                    />
                    <span className="text-xs text-slate-500">VNĐ</span>
                  </div>
                  <button
                    type="button"
                    onClick={addColor}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition"
                  >
                    <Plus size={14} /> Thêm màu
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {form.colors.map((color, idx) => (
                  <div
                    key={idx}
                    className="grid gap-4 sm:grid-cols-12 items-center rounded-lg border border-slate-200 p-4 bg-slate-50/50"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tên màu</label>
                      <input
                        type="text"
                        value={color.color_name}
                        onChange={(e) => updateColor(idx, { color_name: e.target.value })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                      <label className="mt-3 flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={color.color_type === 'ADVANCED'}
                          onChange={(e) => updateColor(idx, { color_type: e.target.checked ? 'ADVANCED' : 'STANDARD' })}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">Đây là màu nâng cao (tính phí)</span>
                      </label>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh xe (Chung)</label>
                      {color.image_url ? (
                        <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1 mb-2">
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
                        <div className="mb-2">
                          <ImageUploadDropzone compact label="Tải hình xe chung" onUploadSuccess={(urls) => updateColor(idx, { image_url: urls[0] })} />
                        </div>
                      )}

                      {form.versions.length > 1 && (
                        <details className="mt-3 group border border-slate-200 rounded-md bg-white">
                          <summary className="text-[11px] font-bold text-slate-600 cursor-pointer p-2 hover:bg-slate-50 transition list-none flex items-center justify-between">
                            <span>Tùy chỉnh ảnh theo phiên bản ({form.versions.length})</span>
                            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                          </summary>
                          <div className="p-2 border-t border-slate-100 space-y-2 bg-slate-50/50">
                            {form.versions.map((version, vIdx) => {
                              const versionImg = color.images_by_version?.[version.name]
                              return (
                                <div key={vIdx} className="text-xs">
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{version.name}</label>
                                  {versionImg ? (
                                    <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                                      <img src={versionImg} alt={`Car color ${version.name}`} className="w-10 h-7 object-contain" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextImages = { ...(color.images_by_version || {}) }
                                          delete nextImages[version.name]
                                          updateColor(idx, { images_by_version: nextImages })
                                        }}
                                        className="text-red-500 hover:bg-red-50 rounded p-1"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <ImageUploadDropzone compact label={`Tải ảnh cho ${version.name}`} onUploadSuccess={(urls) => {
                                      const nextImages = { ...(color.images_by_version || {}) }
                                      nextImages[version.name] = urls[0]
                                      updateColor(idx, { images_by_version: nextImages })
                                    }} />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </details>
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
                  </div>
                ))}
              </div>
            </div>

            {/* Interior section */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">3. Màu sắc & Hình ảnh Nội thất</h3>
                  <p className="text-xs text-slate-500 mt-1">Thêm các tùy chọn màu nội thất kèm ảnh nội thất và swatch tương ứng.</p>
                </div>
                <button
                  type="button"
                  onClick={addInterior}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition"
                >
                  <Plus size={14} /> Thêm màu nội thất
                </button>
              </div>

              <div className="space-y-4">
                {(form.interiors || []).map((interior, idx) => (
                  <div
                    key={idx}
                    className="grid gap-4 sm:grid-cols-12 items-center rounded-lg border border-slate-200 p-4 bg-slate-50/50"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tên màu nội thất</label>
                      <input
                        type="text"
                        value={interior.interior_name}
                        onChange={(e) => updateInterior(idx, { interior_name: e.target.value })}
                        className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh nội thất (Interior Images)</label>
                      
                      <div className="space-y-2">
                        {interior.image_urls && interior.image_urls.length > 0 ? (
                          <div className="space-y-2">
                            {interior.image_urls.map((imgUrl, imgIdx) => (
                              <div key={imgIdx} className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                                <img src={imgUrl} alt="Interior view" className="w-10 h-7 object-contain" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextImages = interior.image_urls!.filter((_, i) => i !== imgIdx)
                                    updateInterior(idx, { 
                                      image_urls: nextImages,
                                      image_url: nextImages[0] || '' 
                                    })
                                  }}
                                  className="text-red-500 hover:bg-red-50 rounded p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            <ImageUploadDropzone 
                              compact 
                              label="Tải thêm hình nội thất" 
                              onUploadSuccess={(urls) => {
                                const nextImages = [...(interior.image_urls || []), ...urls]
                                updateInterior(idx, { 
                                  image_urls: nextImages,
                                  image_url: nextImages[0] || ''
                                })
                              }} 
                            />
                          </div>
                        ) : interior.image_url ? (
                          <div className="space-y-2">
                            <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                              <img src={interior.image_url} alt="Interior view" className="w-10 h-7 object-contain" />
                              <button
                                type="button"
                                onClick={() => updateInterior(idx, { image_url: '', image_urls: [] })}
                                className="text-red-500 hover:bg-red-50 rounded p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <ImageUploadDropzone 
                              compact 
                              label="Tải thêm hình nội thất" 
                              onUploadSuccess={(urls) => {
                                const nextImages = [interior.image_url, ...urls]
                                updateInterior(idx, { 
                                  image_urls: nextImages,
                                  image_url: nextImages[0] || ''
                                })
                              }} 
                            />
                          </div>
                        ) : (
                          <ImageUploadDropzone 
                            compact 
                            label="Tải hình nội thất" 
                            onUploadSuccess={(urls) => updateInterior(idx, { 
                              image_url: urls[0],
                              image_urls: urls
                            })} 
                          />
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình Swatch nội thất</label>
                      {interior.swatch ? (
                        <div className="relative flex items-center justify-between border rounded bg-white px-2 py-1">
                          <img src={interior.swatch} alt="Interior swatch" className="w-8 h-6 object-contain" />
                          <button
                            type="button"
                            onClick={() => updateInterior(idx, { swatch: '' })}
                            className="text-red-500 hover:bg-red-50 rounded p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <ImageUploadDropzone compact label="Tải swatch nội thất" onUploadSuccess={(urls) => updateInterior(idx, { swatch: urls[0] })} />
                      )}
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeInterior(idx)}
                        className="rounded-lg p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        aria-label="Xóa màu nội thất"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="sm:col-span-12 mt-2">
                      <details className="group border border-slate-200 rounded-md bg-white">
                        <summary className="text-[11px] font-bold text-slate-600 cursor-pointer p-2 hover:bg-slate-50 transition list-none flex items-center justify-between">
                          <span>Giới hạn tương thích (Phiên bản & Màu ngoại thất)</span>
                          <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                          <p className="text-[10px] text-slate-500 mb-3">
                            Chọn các kết hợp Phiên bản - Màu sắc cho phép. Nếu không chọn gì, nội thất này sẽ hiển thị cho mọi cấu hình.
                          </p>
                          <div className="space-y-4">
                            {form.versions.map(version => (
                              <div key={version.name} className="border border-slate-200 rounded-md bg-white overflow-hidden">
                                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                                  <span className="text-xs font-semibold text-slate-700">{version.name}</span>
                                </div>
                                <div className="p-2 flex flex-wrap gap-2">
                                  {form.colors.map(color => {
                                    const comboKey = `${version.name}::${color.color_name}`
                                    const isSelected = interior.allowed_combinations?.includes(comboKey) || false
                                    return (
                                      <label key={comboKey} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2 py-1 cursor-pointer hover:bg-slate-50">
                                        <input 
                                          type="checkbox" 
                                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3 h-3"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            const currentAllowed = interior.allowed_combinations || []
                                            if (e.target.checked) {
                                              updateInterior(idx, { allowed_combinations: [...currentAllowed, comboKey] })
                                            } else {
                                              const newAllowed = currentAllowed.filter(c => c !== comboKey)
                                              updateInterior(idx, { allowed_combinations: newAllowed.length > 0 ? newAllowed : undefined })
                                            }
                                          }}
                                        />
                                        <span className="text-[11px] text-slate-700">{color.color_name}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-base font-bold text-slate-900">4. Tồn kho của các tổ hợp hợp lệ</h3>
              <p className="mt-1 text-xs text-slate-500">Mỗi dòng là một SKU phiên bản–ngoại thất–nội thất đã được áp dụng ở trên.</p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-4 py-3">Phiên bản</th><th className="px-4 py-3">Ngoại thất</th><th className="px-4 py-3">Nội thất</th><th className="px-4 py-3">Số lượng tồn</th></tr></thead>
                  <tbody>{form.versions.flatMap((version, versionIndex) => selectedColorsFor(version).flatMap((exterior) => selectedInteriorsFor(version, exterior).map((interior) => <tr key={`${version.sku}-${configurationKey(exterior, interior)}`} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-800">{version.name || 'Phiên bản chưa đặt tên'}</td><td className="px-4 py-3 text-slate-700">{exterior}</td><td className="px-4 py-3 text-slate-700">{interior}</td><td className="px-4 py-2"><input aria-label={`Tồn kho ${version.name} - ${exterior} - ${interior}`} type="number" min="0" step="1" value={version.stock_by_configuration?.[configurationKey(exterior, interior)] ?? 0} onChange={(event) => updateConfigurationStock(versionIndex, exterior, interior, Number(event.target.value))} className="h-9 w-28 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500" /></td></tr>)))}</tbody>
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
                                <label className="block text-xs font-bold text-slate-600 uppercase">Nội dung chi tiết</label>
                                <textarea
                                  rows={3}
                                  value={block.data.description || ''}
                                  onChange={(e) => updateBlockData(block.id, 'description', e.target.value)}
                                  className="mt-1.5 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh (Image)</label>
                                {block.data.image && (
                                  <div className="mb-2 relative h-20 w-36 rounded overflow-hidden border border-slate-200">
                                    <img src={block.data.image} className="h-full w-full object-cover" alt="Split visual" />
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
                                  label="Chọn hình ảnh"
                                  onUploadSuccess={(urls) => updateBlockData(block.id, 'image', urls[0])}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Vị trí ảnh (Image Position)</label>
                                <select
                                  value={block.data.imagePosition || 'right'}
                                  onChange={(e) => updateBlockData(block.id, 'imagePosition', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                >
                                  <option value="left">Bên trái</option>
                                  <option value="right">Bên phải</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Màu nền khối (Hex Color)</label>
                                <input
                                  type="text"
                                  placeholder="#ffffff"
                                  value={block.data.backgroundColor || '#ffffff'}
                                  onChange={(e) => updateBlockData(block.id, 'backgroundColor', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                            </div>
                          )}

                          {block.type === 'HIGHLIGHT_GRID' && (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề nhóm thông số</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div className="border-t border-slate-100 pt-3">
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">3 Thông số nổi bật</label>
                                <div className="grid gap-4 md:grid-cols-3">
                                  {[0, 1, 2].map((itemIdx) => {
                                    const item = block.data.items?.[itemIdx] || { label: '', value: '', description: '' }
                                    const updateItem = (field: string, val: string) => {
                                      const nextItems = [...(block.data.items || [])]
                                      while (nextItems.length < 3) {
                                        nextItems.push({ label: '', value: '', description: '' })
                                      }
                                      nextItems[itemIdx] = { ...nextItems[itemIdx], [field]: val }
                                      updateBlockData(block.id, 'items', nextItems)
                                    }

                                    return (
                                      <div key={itemIdx} className="bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Ô thông số {itemIdx + 1}</span>
                                        <div className="mt-2 space-y-2">
                                          <input
                                            type="text"
                                            placeholder="Tên nhãn (Ví dụ: Quãng đường)"
                                            value={item.label}
                                            onChange={(e) => updateItem('label', e.target.value)}
                                            className="h-8 w-full rounded border px-2 text-xs"
                                          />
                                          <input
                                            type="text"
                                            placeholder="Giá trị (Ví dụ: 300 km)"
                                            value={item.value}
                                            onChange={(e) => updateItem('value', e.target.value)}
                                            className="h-8 w-full rounded border px-2 text-xs font-bold text-slate-900"
                                          />
                                          <input
                                            type="text"
                                            placeholder="Mô tả phụ"
                                            value={item.description}
                                            onChange={(e) => updateItem('description', e.target.value)}
                                            className="h-8 w-full rounded border px-2 text-xs text-slate-500"
                                          />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {block.type === 'IMAGE_GALLERY' && (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase">Tiêu đề bộ sưu tập</label>
                                <input
                                  type="text"
                                  value={block.data.title || ''}
                                  onChange={(e) => updateBlockData(block.id, 'title', e.target.value)}
                                  className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Thêm hình ảnh vào thư viện</label>
                                <div className="flex flex-wrap gap-3 mb-3">
                                  {(block.data.images || []).map((url: string, imgIdx: number) => (
                                    <div key={imgIdx} className="relative h-16 w-24 rounded border overflow-hidden bg-slate-50 group flex items-center justify-center">
                                      <img src={url} className="max-h-full max-w-full object-contain p-1" alt="Gallery item" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextImgs = (block.data.images || []).filter((_: any, i: number) => i !== imgIdx)
                                          updateBlockData(block.id, 'images', nextImgs)
                                        }}
                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <ImageUploadDropzone
                                  compact
                                  label="Chọn hình ảnh tải lên"
                                  onUploadSuccess={(urls) => {
                                    const nextImgs = [...(block.data.images || []), ...urls]
                                    updateBlockData(block.id, 'images', nextImgs)
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
                                <label className="block text-xs font-bold text-slate-600 uppercase">Liên kết Video YouTube (Link hoặc Embed code)</label>
                                <input
                                  type="text"
                                  placeholder="Ví dụ: https://www.youtube.com/watch?v=..."
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

      {/* Floating Preview Window / Panel */}
      <AnimatePresence>
        {isPreviewOpen && (() => {
          const logoImg = form.logo_image_url || (form.specifications as any)?.logo_image_url || (form.specifications as any)?.logo_image;
          const displayImgs = form.detail_image_urls || [];
          const displayIntImg = form.detail_image_urls?.[2] || form.detail_image_urls?.[1] || form.hero_image_url;

          return (
            <div className="fixed inset-0 z-50 bg-slate-950/80 overflow-y-auto backdrop-blur-sm flex flex-col">
              {/* Control Bar */}
              <div className="sticky top-0 bg-slate-900 text-white h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-slate-800 z-10">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-wide">CHẾ ĐỘ XEM TRƯỚC LANDING PAGE</span>
                  <span className="bg-[#3b82f6] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Ô tô điện</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold transition"
                >
                  <X size={16} /> Đóng xem trước
                </button>
              </div>

              {/* Simulated PDP Layout */}
              <div className="flex-1 bg-black">
                {/* Simulated Sticky Nav CTA */}
                <div className="sticky top-[56px] z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/10 shadow-sm">
                  <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between text-white">
                    <div className="flex items-center">
                      {logoImg ? (
                        <img 
                          src={logoImg} 
                          alt={form.name} 
                          className="h-8 object-contain hidden sm:block" 
                          style={
                            logoImg.includes('cloudinary') || logoImg.includes('/uploads') || !logoImg.endsWith('.svg')
                              ? {}
                              : { filter: 'brightness(0) invert(1)' }
                          } 
                        />
                      ) : (
                        <h2 className="font-bold text-lg hidden sm:block">{form.name}</h2>
                      )}
                    </div>
                    <div className="flex gap-6 text-sm font-semibold text-white/60">
                      {form.versions.length > 1 && <span className="cursor-pointer hover:text-white transition-colors">Phiên bản</span>}
                      <span className="cursor-pointer hover:text-white transition-colors">Thiết kế</span>
                      <span className="cursor-pointer hover:text-white transition-colors">Vận hành</span>
                      <span className="cursor-pointer hover:text-white transition-colors">Thông số</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-full px-5 py-2 text-xs font-bold transition-all">Đặt cọc</button>
                    </div>
                  </div>
                </div>

                {/* Hero Section */}
                <section className="relative h-screen min-h-[500px] w-full flex flex-col justify-between overflow-hidden bg-slate-950 text-white">
                  <img
                    src={form.hero_image_url || '/images/hero-fallback.jpg'}
                    alt="Car hero view"
                    className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />

                  <div className="relative z-10 flex flex-col items-center mt-36 text-center px-4 animate-fade-in-up">
                    {logoImg ? (
                      <img 
                        src={logoImg} 
                        alt={form.name} 
                        className="h-16 sm:h-24 w-auto object-contain" 
                        style={
                          logoImg.includes('cloudinary') || logoImg.includes('/uploads') || !logoImg.endsWith('.svg')
                            ? {}
                            : { filter: 'brightness(0) invert(1)' }
                        }
                      />
                    ) : (
                      <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-widest">{form.name || 'VinFast VF'}</h2>
                    )}
                    <p className="text-sm sm:text-lg text-white/80 max-w-xl mt-3 font-semibold">{form.description || 'Mẫu xe thông minh của tương lai.'}</p>
                  </div>

                  <div className="relative z-10 flex flex-col items-center pb-24 w-full">
                    <div className="flex gap-4">
                      <button className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold uppercase tracking-widest text-black shadow-xl">
                        Đặt cọc ngay
                      </button>
                    </div>
                  </div>
                </section>

                {/* Specs Highlights */}
                <section className="py-24 bg-zinc-900 text-white border-y border-zinc-800">
                  <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 md:gap-12 text-center divide-x divide-white/5">
                      <div className="flex flex-col items-center">
                        <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-blue-500">
                          {String(form.specifications['Quãng đường đi được'] || '').trim().split(' ')[0] || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Quãng đường (km)</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-blue-500">
                          {form.specifications['Công suất tối đa'] || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Công suất (kW)</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-blue-500">
                          {form.specifications['Mô-men xoắn cực đại'] || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Mô-men xoắn (Nm)</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-blue-500">
                          {String(form.specifications['Thời gian sạc nhanh'] || '').split(' ')[0] || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Sạc siêu tốc (phút)</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Color Visualizer Selector */}
                {form.colors.length > 0 && (
                  <section className="py-24 bg-gradient-to-b from-white to-gray-100">
                    <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
                      <h2 className="text-3xl sm:text-4xl lg:text-[56px] font-bold tracking-tight text-foreground mb-16 text-slate-900">
                        Trải nghiệm cá nhân hóa
                      </h2>

                      <div className="flex flex-col items-center gap-8 sm:gap-12">
                        {/* Image Display */}
                        <div className="relative w-full max-w-4xl aspect-[16/9] md:aspect-[2/1] flex items-center justify-center group">
                          {form.colors.map((c: any, idx: number) => (
                            <img
                              key={idx}
                              src={c.image_url || '/images/hero-fallback.jpg'}
                              alt={c.color_name}
                              className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out ${previewColorIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                            />
                          ))}
                        </div>

                        {/* Color Swatches */}
                        <div className="flex flex-col items-center gap-8 mt-4">
                          <p className="text-3xl sm:text-4xl font-light text-slate-800">
                            {form.colors[previewColorIndex]?.color_name || 'Tên màu'}
                          </p>

                          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 max-w-2xl mt-2">
                            {form.colors.map((c: any, idx: number) => {
                              const isSelected = previewColorIndex === idx;
                              const colorName = c.color_name;
                              const swatchImg = c.swatch;
                              const hexCode = colorMap[colorName] || '#CCCCCC';

                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setPreviewColorIndex(idx)}
                                  className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 focus:outline-none shadow-md ${
                                    isSelected ? 'ring-2 ring-offset-[3px] ring-[#3b82f6] scale-110' : ''
                                  }`}
                                  style={{ backgroundColor: swatchImg ? 'transparent' : hexCode }}
                                  title={colorName}
                                >
                                  {swatchImg && (
                                    <img src={swatchImg} alt={colorName} className="absolute inset-0 w-full h-full object-cover rounded-full" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Design Section representing the layout in landing page */}
                <section id="design" className="py-32 bg-white text-black">
                  <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
                    <div className="mb-16">
                      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Thiết kế tương lai</h2>
                      <p className="text-xl text-muted-foreground max-w-2xl">Đường nét thiết kế sang trọng, thời thượng, tôn vinh đẳng cấp người sở hữu.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-16">
                      {displayImgs[0] && (
                        <div className="md:col-span-2 overflow-hidden rounded-[2rem]">
                          <img src={displayImgs[0]} alt="Ngoại thất" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-1000" />
                        </div>
                      )}
                      {displayImgs[1] && (
                        <div className="overflow-hidden rounded-[2rem] aspect-square">
                          <img src={displayImgs[1]} alt="Ngoại thất" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
                        </div>
                      )}
                      {displayIntImg && (
                        <div className="overflow-hidden rounded-[2rem] aspect-square relative group">
                          <img src={displayIntImg} alt="Nội thất" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 text-white">
                             <h3 className="text-2xl font-bold mb-2">Nội thất đẳng cấp</h3>
                             <p className="text-white/80">Không gian rộng rãi, tiện nghi, sử dụng chất liệu cao cấp thân thiện môi trường.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Variants Pricing Section */}
                {form.versions.length > 1 && (
                  <section id="variants" className="relative py-32 bg-black overflow-hidden flex items-center justify-center min-h-[600px] text-white">
                     <img src={displayIntImg || form.hero_image_url} alt="Interior" className="absolute inset-0 w-full h-full object-cover opacity-70"/>
                     
                     <div className="relative z-10 w-full max-w-4xl mx-auto px-6">
                       <div className="bg-white/70 backdrop-blur-xl p-8 sm:p-14 shadow-2xl rounded-3xl">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 sm:gap-8 mb-12">
                            {form.versions.map((version: any) => {
                              const originalPrice = Number(version.price) || 0
                              const discountPrice = originalPrice * 0.95 // 5% discount
                              const formatNum = (n: number) => new Intl.NumberFormat('vi-VN').format(n)
                              
                              return (
                                <div key={version.sku} className="px-4 text-slate-900">
                                  <h3 className="text-3xl sm:text-4xl font-light mb-8 text-slate-900">{form.name} {version.name}</h3>
                                  <p className="text-sm font-medium mb-2 text-slate-800">Giá bán từ</p>
                                  <div className="flex items-baseline gap-2 mb-2 text-slate-900">
                                     <span className="text-3xl sm:text-4xl font-light">{formatNum(discountPrice)}</span>
                                     <span className="text-sm font-bold">VNĐ*</span>
                                  </div>
                                  <div className="flex items-baseline gap-2 opacity-50 line-through text-slate-700">
                                     <span className="text-lg">{formatNum(originalPrice)}</span>
                                     <span className="text-xs font-bold">VNĐ*</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          
                          <div className="flex justify-center mb-8 px-4">
                            <button type="button" className="bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-none h-14 font-bold tracking-widest w-full sm:max-w-md shadow-lg transition-colors">
                              ĐẶT CỌC
                            </button>
                          </div>
                          <p className="text-center text-sm text-slate-700/80 px-4">(*) Mức giá ưu đãi mang tính chất tham khảo. Chương trình áp dụng theo điều khoản & điều kiện.</p>
                       </div>
                     </div>
                  </section>
                )}

                {/* Specifications Section */}
                <section id="specs" className="py-24 bg-white text-slate-900 border-t border-slate-100">
                  <div className="max-w-6xl mx-auto px-6">
                    <h2 className="text-3xl font-bold tracking-tight mb-12">Thông số kỹ thuật {form.name || 'VinFast'}</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 sm:gap-16">
                      <div>
                        <h3 className="text-xl font-bold border-b border-slate-200 pb-3 mb-5 text-slate-800">Động cơ & Vận hành</h3>
                        <ul className="space-y-4">
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Công suất tối đa</span>
                            <span className="font-semibold text-right">{form.specifications['Công suất tối đa'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Mô-men xoắn cực đại</span>
                            <span className="font-semibold text-right">{form.specifications['Mô-men xoắn cực đại'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Hệ dẫn động</span>
                            <span className="font-semibold text-right">{form.specifications['Hệ dẫn động'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Quãng đường di chuyển</span>
                            <span className="font-semibold text-right">{form.specifications['Quãng đường đi được'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Dung lượng pin</span>
                            <span className="font-semibold text-right">{form.specifications['Dung lượng pin'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Thời gian sạc nhanh</span>
                            <span className="font-semibold text-right">{form.specifications['Thời gian sạc nhanh'] || 'Chưa cập nhật'}</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <h3 className="text-xl font-bold border-b border-slate-200 pb-3 mb-5 text-slate-800">Kích thước & Tiện ích</h3>
                        <ul className="space-y-4">
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Kích thước (D x R x C)</span>
                            <span className="font-semibold text-right">{form.specifications['Dài x Rộng x Cao'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Chiều dài cơ sở</span>
                            <span className="font-semibold text-right">{form.specifications['Chiều dài cơ sở'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Khối lượng / Tải trọng</span>
                            <span className="font-semibold text-right">{form.specifications['Khối lượng / Tải trọng'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Khoảng sáng gầm xe</span>
                            <span className="font-semibold text-right">{form.specifications['Khoảng sáng gầm xe'] || 'Chưa cập nhật'}</span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Số chỗ ngồi</span>
                            <span className="font-semibold text-right">
                              {form.specifications['Số chỗ ngồi'] 
                                ? (String(form.specifications['Số chỗ ngồi']).includes('chỗ') || String(form.specifications['Số chỗ ngồi']).includes('ghế')
                                  ? String(form.specifications['Số chỗ ngồi'])
                                  : `${form.specifications['Số chỗ ngồi']} ghế`)
                                : 'Chưa cập nhật'}
                            </span>
                          </li>
                          <li className="flex justify-between py-2 border-b border-slate-100 text-sm">
                            <span className="text-slate-500">Hệ thống túi khí</span>
                            <span className="font-semibold text-right">
                              {form.specifications['Hệ thống túi khí']
                                ? (String(form.specifications['Hệ thống túi khí']).includes('túi')
                                  ? String(form.specifications['Hệ thống túi khí'])
                                  : `${form.specifications['Hệ thống túi khí']} túi khí`)
                                : 'Chưa cập nhật'}
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Final CTA */}
                <section className="py-32 bg-[#171411] text-white text-center">
                  <div className="max-w-3xl mx-auto px-6">
                    <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-8">Sẵn sàng trải nghiệm?</h2>
                    <p className="text-xl text-white/70 mb-12">Gia nhập cộng đồng người dùng xe điện toàn cầu cùng VinFast.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                       <button type="button" className="bg-white text-black hover:bg-white/90 h-14 px-10 rounded-full font-bold uppercase tracking-wider text-sm transition-transform hover:scale-105">
                         Đặt cọc ngay
                      </button>
                      <button type="button" className="h-14 px-10 rounded-full border border-white/20 text-white hover:bg-white/10 font-bold uppercase tracking-wider text-sm">
                        Đăng ký lái thử
                      </button>
                    </div>
                  </div>
                </section>

                {/* Simulated Footer */}
                <footer className="py-16 bg-[#0a0807] text-white/50 text-xs border-t border-white/5">
                  <div className="max-w-[1440px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>© 2026 VinFast. All rights reserved. Bản mô phỏng xem trước.</div>
                    <div className="flex gap-6">
                      <span className="cursor-pointer hover:text-white">Chính sách quyền riêng tư</span>
                      <span className="cursor-pointer hover:text-white">Điều khoản sử dụng</span>
                      <span className="cursor-pointer hover:text-white">Liên hệ</span>
                    </div>
                  </div>
                </footer>

                {/* Render dynamic blocks */}
                <div className="bg-white">
                  <LandingPageRenderer
                    blocks={form.landing_page_blocks.map(block => {
                      if (block.type === 'HIGHLIGHT_GRID') {
                        return {
                          ...block,
                          data: {
                            ...block.data,
                            items: block.data.items?.map((item: any) => {
                              if (item.label === 'Quãng đường' && form.specifications['Quãng đường đi được']) {
                                return { ...item, value: form.specifications['Quãng đường đi được'] }
                              }
                              if (item.label === 'Thời gian sạc' && form.specifications['Thời gian sạc nhanh']) {
                                return { ...item, value: form.specifications['Thời gian sạc nhanh'] }
                              }
                              return item
                            })
                          }
                        }
                      }
                      return block
                    })}
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  )
}
