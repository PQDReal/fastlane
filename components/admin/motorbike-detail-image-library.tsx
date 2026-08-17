'use client'

import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { ImageUploadDropzone } from '@/components/admin/image-upload-dropzone'
import { MAX_MOTORBIKE_DETAIL_IMAGES, normalizeMotorbikeDetailImages } from '@/lib/motorbike-version-media'

type MotorbikeDetailImageLibraryProps = {
  images: string[]
  onChange: (images: string[]) => void
  onError?: (message: string) => void
}

export function MotorbikeDetailImageLibrary({ images, onChange, onError }: MotorbikeDetailImageLibraryProps) {
  const cleanImages = normalizeMotorbikeDetailImages(images)

  const appendImages = (incoming: string[]) => {
    const nextImages = normalizeMotorbikeDetailImages([...cleanImages, ...incoming])
    if (cleanImages.length + incoming.filter(Boolean).length > MAX_MOTORBIKE_DETAIL_IMAGES) {
      onError?.(`Thư viện ảnh chỉ được có tối đa ${MAX_MOTORBIKE_DETAIL_IMAGES} ảnh.`)
    }
    onChange(nextImages)
  }

  const moveImage = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= cleanImages.length) return
    const nextImages = [...cleanImages]
    const [image] = nextImages.splice(index, 1)
    nextImages.splice(nextIndex, 0, image)
    onChange(nextImages)
  }

  return (
    <div className="border-t border-slate-100 pt-6">
      <h4 className="text-sm font-bold text-slate-900">Thư viện ảnh chi tiết (Detail Images)</h4>
      <p className="mt-1 text-xs text-slate-500">
        Hình ảnh bổ sung hiển thị trên trang sản phẩm (tối đa {MAX_MOTORBIKE_DETAIL_IMAGES} ảnh). Di chuột vào hình để đổi thứ tự.
      </p>

      {cleanImages.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4">
          {cleanImages.map((url, index) => (
            <div key={`${url}-${index}`} className="group relative flex h-24 w-36 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md">
              <img src={url} alt={`Ảnh chi tiết ${index + 1}`} className="max-h-full max-w-full object-contain p-1" />
              <button
                type="button"
                onClick={() => onChange(cleanImages.filter((_, imageIndex) => imageIndex !== index))}
                className="absolute right-1 top-1 z-20 rounded bg-black/60 p-1 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={`Xóa ảnh chi tiết ${index + 1}`}
              >
                <Trash2 size={12} />
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => moveImage(index, -1)}
                  className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white opacity-0 transition hover:bg-brand-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={`Đưa ảnh chi tiết ${index + 1} sang trái`}
                >
                  <ChevronLeft size={12} />
                </button>
              )}
              {index < cleanImages.length - 1 && (
                <button
                  type="button"
                  onClick={() => moveImage(index, 1)}
                  className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white opacity-0 transition hover:bg-brand-600 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={`Đưa ảnh chi tiết ${index + 1} sang phải`}
                >
                  <ChevronRight size={12} />
                </button>
              )}
              <div className="pointer-events-none absolute inset-0 bg-black/10 opacity-0 transition group-hover:opacity-100" />
            </div>
          ))}
        </div>
      )}

      {cleanImages.length < MAX_MOTORBIKE_DETAIL_IMAGES && (
        <div className={cleanImages.length > 0 ? 'mt-4 w-64' : 'mt-6 max-w-sm'}>
          <ImageUploadDropzone
            compact
            label="Kéo thả hoặc chọn file từ máy"
            folder="fastlane/products/motorbikes/details"
            onError={onError}
            onUploadSuccess={appendImages}
          />
        </div>
      )}
    </div>
  )
}
