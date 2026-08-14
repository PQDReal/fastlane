'use client'

import { Trash2 } from 'lucide-react'
import { ImageUploadDropzone } from '@/components/admin/image-upload-dropzone'
import type { MotorbikeVariantColorMedia } from '@/lib/motorbike-variant-color-media'

type ColorOption = {
  color_name: string
  image_url?: string
  swatch?: string
}

type MotorbikeVersionColorMediaFieldsProps = {
  versionName: string
  colors: ColorOption[]
  mediaByColor: Record<string, MotorbikeVariantColorMedia>
  onChange: (colorName: string, media: MotorbikeVariantColorMedia) => void
  onError?: (message: string) => void
}

export function MotorbikeVersionColorMediaFields({
  versionName,
  colors,
  mediaByColor,
  onChange,
  onError,
}: MotorbikeVersionColorMediaFieldsProps) {
  if (colors.length === 0) return null

  return (
    <div className="sm:col-span-12 border-t border-slate-200 pt-4">
      <div>
        <p className="text-xs font-bold uppercase text-slate-700">Ảnh màu theo phiên bản</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Mỗi tổ hợp phiên bản × màu dùng ảnh xe và swatch riêng; cả hai đều bắt buộc.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {colors.map((color) => {
          const ownMedia = mediaByColor[color.color_name]
          const media = ownMedia ?? {
            image_url: color.image_url || '',
            swatch: color.swatch || '',
          }

          return (
            <div key={color.color_name} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold text-slate-900">{color.color_name}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{versionName || 'Phiên bản chưa đặt tên'}</p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold uppercase text-slate-600">Hình ảnh xe</label>
                    {media.image_url && (
                      <button
                        type="button"
                        onClick={() => onChange(color.color_name, { ...media, image_url: '' })}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Xóa ảnh ${color.color_name} của ${versionName}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {media.image_url ? (
                    <div className="mt-2 aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      <img src={media.image_url} alt={`${versionName} - ${color.color_name}`} className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="mt-2">
                      <ImageUploadDropzone
                        compact
                        label="Tải hình xe"
                        folder="fastlane/products/motorbikes/variant-colors"
                        onError={onError}
                        onUploadSuccess={(urls) => onChange(color.color_name, { ...media, image_url: urls[0] || '' })}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold uppercase text-slate-600">Swatch màu</label>
                    {media.swatch && (
                      <button
                        type="button"
                        onClick={() => onChange(color.color_name, { ...media, swatch: '' })}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Xóa swatch ${color.color_name} của ${versionName}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {media.swatch ? (
                    <div className="mt-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-5">
                      <img src={media.swatch} alt={`Swatch ${versionName} - ${color.color_name}`} className="h-full w-full rounded-full object-cover" />
                    </div>
                  ) : (
                    <div className="mt-2">
                      <ImageUploadDropzone
                        compact
                        label="Tải swatch"
                        folder="fastlane/products/motorbikes/variant-colors"
                        onError={onError}
                        onUploadSuccess={(urls) => onChange(color.color_name, { ...media, swatch: urls[0] || '' })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
