'use client'

import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { ImageUploadDropzone } from '@/components/admin/image-upload-dropzone'
import { MAX_MOTORBIKE_VERSION_DETAIL_IMAGES } from '@/lib/motorbike-version-media'

type MotorbikeVersionMediaFieldsProps = {
  versionName: string
  imageUrl: string
  detailImageUrls: string[]
  onImageChange: (url: string) => void
  onDetailImagesChange: (urls: string[]) => void
  onError?: (message: string) => void
}

function mergeImages(current: string[], incoming: string[]) {
  return Array.from(new Set([...current, ...incoming].map((url) => url.trim()).filter(Boolean)))
}

export function MotorbikeVersionMediaFields({
  versionName,
  imageUrl,
  detailImageUrls,
  onImageChange,
  onDetailImagesChange,
  onError,
}: MotorbikeVersionMediaFieldsProps) {
  const cleanDetails = detailImageUrls.filter(Boolean).slice(0, MAX_MOTORBIKE_VERSION_DETAIL_IMAGES)

  const appendDetails = (incoming: string[]) => {
    const merged = mergeImages(cleanDetails, incoming)
    if (merged.length > MAX_MOTORBIKE_VERSION_DETAIL_IMAGES) {
      onError?.(`Mỗi phiên bản chỉ được có tối đa ${MAX_MOTORBIKE_VERSION_DETAIL_IMAGES} ảnh chi tiết.`)
    }
    onDetailImagesChange(merged.slice(0, MAX_MOTORBIKE_VERSION_DETAIL_IMAGES))
  }

  return (
    <div className="sm:col-span-12 grid gap-5 border-t border-slate-200 pt-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-600">Ảnh đại diện phiên bản</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Không bắt buộc; bỏ trống để dùng ảnh landing chung.</p>
          </div>
          {imageUrl && (
            <button
              type="button"
              onClick={() => onImageChange('')}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={`Xóa ảnh đại diện của ${versionName || 'phiên bản'}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {imageUrl ? (
          <div className="mt-3 aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img src={imageUrl} alt={`Ảnh đại diện ${versionName || 'phiên bản'}`} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-400">
            <ImageIcon size={24} />
          </div>
        )}

        <div className="mt-3">
          <ImageUploadDropzone
            compact
            label={imageUrl ? 'Thay ảnh đại diện' : 'Tải ảnh đại diện'}
            folder="fastlane/products/motorbikes/versions"
            onError={onError}
            onUploadSuccess={(urls) => {
              const [representative, ...remaining] = urls.filter(Boolean)
              if (representative) onImageChange(representative)
              if (remaining.length > 0) appendDetails(remaining)
            }}
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-600">Bộ ảnh riêng của phiên bản</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              Không bắt buộc; tối đa {MAX_MOTORBIKE_VERSION_DETAIL_IMAGES} ảnh. Đang có {cleanDetails.length} ảnh.
            </p>
          </div>
          <ImageUploadDropzone
            compact
            label="Thêm ảnh vào bộ"
            folder="fastlane/products/motorbikes/versions"
            disabled={cleanDetails.length >= MAX_MOTORBIKE_VERSION_DETAIL_IMAGES}
            onError={onError}
            onUploadSuccess={appendDetails}
          />
        </div>

        {cleanDetails.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {cleanDetails.map((url, index) => (
              <div key={`${url}-${index}`} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src={url} alt={`Ảnh ${index + 1} của ${versionName || 'phiên bản'}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onDetailImagesChange(cleanDetails.filter((_, itemIndex) => itemIndex !== index))}
                  className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1.5 text-slate-500 shadow transition hover:bg-red-50 hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={`Xóa ảnh ${index + 1} của ${versionName || 'phiên bản'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 text-center text-xs text-slate-400">
            Chưa có bộ ảnh riêng; trang sản phẩm sẽ dùng bộ ảnh chung.
          </div>
        )}
      </div>
    </div>
  )
}
