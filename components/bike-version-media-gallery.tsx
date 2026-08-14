'use client'

import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useState } from 'react'

export type BikeVersionMediaOption = {
  name: string
  sku: string
  price: number
  imageUrl: string
  detailImageUrls: string[]
}

export type BikeVersionColorOption = {
  versionName: string
  versionSku: string
  colorName: string
  imageUrl: string
  swatchUrl: string
}

type BikeVersionMediaGalleryProps = {
  productName: string
  versions: BikeVersionMediaOption[]
  colorVariants: BikeVersionColorOption[]
  description?: string
  fallbackImageUrl: string
  fallbackDetailImageUrls: string[]
}

function formatPrice(price: number) {
  return Number.isFinite(price)
    ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫`
    : 'Liên hệ'
}

export function BikeVersionMediaGallery({
  productName,
  versions,
  colorVariants,
  description,
  fallbackImageUrl,
  fallbackDetailImageUrls,
}: BikeVersionMediaGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedColorIndex, setSelectedColorIndex] = useState(0)
  const selectedVersion = versions[selectedIndex] ?? versions[0]
  const hasVersionSpecificMedia = versions.some((version) => (
    Boolean(version.imageUrl) || version.detailImageUrls.some(Boolean)
  ))
  const representativeImage = selectedVersion?.imageUrl || fallbackImageUrl
  const availableColors = colorVariants.filter((variant) => (
    variant.versionSku === selectedVersion?.sku || variant.versionName === selectedVersion?.name
  ))
  const resolvedColorIndex = Math.min(selectedColorIndex, Math.max(availableColors.length - 1, 0))
  const selectedColor = availableColors[resolvedColorIndex]
  const versionDetails = selectedVersion?.detailImageUrls.filter(Boolean) ?? []
  const detailImages = versionDetails.length > 0 ? versionDetails : fallbackDetailImageUrls.filter(Boolean)

  return (
    <section id="design" className="bg-slate-950 py-20 text-white">
      <div className="mx-auto max-w-6xl px-6">
        {(hasVersionSpecificMedia || colorVariants.length > 0) && versions.length > 1 && (
          <div className="mb-12">
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-400">Phiên bản</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-wider">Chọn phiên bản để xem hình ảnh</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {versions.map((version, index) => {
                const selected = index === selectedIndex
                return (
                  <button
                    key={`${version.sku}-${index}`}
                    type="button"
                    onClick={() => {
                      setSelectedIndex(index)
                      setSelectedColorIndex(0)
                    }}
                    aria-pressed={selected}
                    className={`relative min-h-24 rounded-2xl border px-5 py-4 text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      selected
                        ? 'border-brand-400 bg-brand-500/15 text-white shadow-lg shadow-brand-950/30'
                        : 'border-white/10 bg-white/5 text-white/75 hover:border-white/30 hover:bg-white/10'
                    }`}
                  >
                    <span className="block pr-7 text-sm font-bold leading-5">{version.name}</span>
                    <span className="mt-2 block text-xs text-white/50">{formatPrice(version.price)}</span>
                    {selected && <Check className="absolute right-4 top-4 text-brand-400" size={18} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {availableColors.length > 0 && (
          <div className="mb-16 grid items-center gap-12 lg:grid-cols-12">
            <div className="relative flex h-80 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 p-6 lg:col-span-8 lg:h-96">
              <AnimatePresence mode="wait">
                {selectedColor?.imageUrl && (
                  <motion.div
                    key={`${selectedVersion?.sku}-${selectedColor.colorName}`}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-6"
                  >
                    <Image
                      src={selectedColor.imageUrl}
                      alt={`${productName} ${selectedVersion?.name} - ${selectedColor.colorName}`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 768px"
                      className="object-contain"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="absolute bottom-4 left-6 z-20 text-xs text-white/40">
                {selectedVersion?.name} · {selectedColor?.colorName}
              </span>
            </div>

            <div className="space-y-6 lg:col-span-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-400">{selectedVersion?.name}</p>
                <h2 className="mt-2 text-2xl font-bold uppercase tracking-tight">Chọn màu sắc của bạn</h2>
              </div>
              <p className="text-sm leading-6 text-white/60">
                {description || 'Cá nhân hóa chiếc xe theo phong cách của bạn.'}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                {availableColors.map((color, index) => {
                  const selected = resolvedColorIndex === index
                  return (
                    <button
                      key={`${color.versionSku}-${color.colorName}`}
                      type="button"
                      onClick={() => setSelectedColorIndex(index)}
                      aria-pressed={selected}
                      title={color.colorName}
                      className={`relative h-11 w-11 rounded-full border-2 p-0.5 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        selected ? 'border-brand-500 bg-brand-500/20' : 'border-white/20 hover:border-white/50'
                      }`}
                    >
                      {color.swatchUrl ? (
                        <Image src={color.swatchUrl} alt={color.colorName} fill sizes="44px" className="rounded-full object-cover" />
                      ) : (
                        <span className="block h-full w-full rounded-full bg-slate-700" />
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-sm font-semibold text-white/70">{selectedColor?.colorName}</p>
            </div>
          </div>
        )}

        {hasVersionSpecificMedia && representativeImage && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedVersion?.sku || 'fallback'}-${representativeImage}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="relative mb-16 aspect-[16/9] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900"
            >
              <Image
                src={representativeImage}
                alt={`${productName} - ${selectedVersion?.name || 'ảnh đại diện'}`}
                fill
                sizes="(max-width: 1200px) 100vw, 1152px"
                className="object-cover"
              />
            </motion.div>
          </AnimatePresence>
        )}

        <div className="mb-12 text-center">
          <h2 className="text-2xl font-black uppercase tracking-wider">Khám phá chi tiết</h2>
          <p className="mt-2 text-xs text-white/50">
            {versionDetails.length > 0
              ? `Bộ ảnh riêng của ${selectedVersion?.name}.`
              : 'Hình ảnh thực tế chi tiết của xe.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedVersion?.sku || 'fallback-gallery'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {detailImages.slice(0, 20).map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="group relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/5 bg-slate-900"
              >
                <Image
                  src={url}
                  alt={`Chi tiết ${productName} ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 384px"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-12">
                  <span className="text-xs font-bold text-white/70">Hình ảnh chi tiết #{index + 1}</span>
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
