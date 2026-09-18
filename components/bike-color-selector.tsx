'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface BikeColorSelectorProps {
  colors: (string | { name: string; swatch?: string })[]
  images: string[]
  description?: string
}

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
  // 'Infinity Blanc': '#F8F9FA',
  // 'Solar Ruby': '#941B26',
  // 'Zenith Grey': '#5E5E5E',
  // 'Urban Mint': '#A0E8D7',
  'Summer Yellow Body - Jet Black Roof': '#FFD700',
  'Ivy Green': '#556B2F',
  'Zenith Grey - Desat Silver Roof': '#5E5E5E',
  'Infinity Blanc - Zenith Grey Roof': '#F8F9FA'
}

function colorHex(colorName: string) {
  const normalized = colorName.toLocaleLowerCase('vi')
  if (normalized.includes('đỏ')) return '#B5122B'
  if (normalized.includes('trắng')) return '#F4F4F2'
  if (normalized.includes('đen')) return '#171717'
  if (normalized.includes('xám')) return '#73777A'
  if (normalized.includes('bạc')) return '#C0C0C0'
  if (normalized.includes('vàng')) return '#D9A514'
  if (normalized.includes('cam')) return '#E96324'
  if (normalized.includes('tím')) return '#34304F'
  if (normalized.includes('xanh rêu') || normalized.includes('oliu')) return '#65705A'
  if (normalized.includes('xanh')) return '#496D78'
  return colorMap[colorName] || '#CCCCCC'
}

function colorBackground(colorName: string) {
  const normalized = colorName.toLocaleLowerCase('vi')

  if (
    normalized.includes('đỏ') &&
    normalized.includes('đen')
  ) {
    return 'linear-gradient(135deg, #B5122B 0 50%, #171717 50% 100%)'
  }

  if (
    normalized.includes('trắng') &&
    normalized.includes('cam')
  ) {
    return 'linear-gradient(135deg, #F4F4F2 0 50%, #E96324 50% 100%)'
  }

  return colorHex(colorName)
}

export function BikeColorSelector({ colors, images, description }: BikeColorSelectorProps) {
  const availableOptions = colors
    .map((color, index) => ({ color, image: images[index] }))
    .filter(
      (option): option is { color: (typeof colors)[number]; image: string } =>
        typeof option.image === 'string' && option.image.trim() !== '',
    )
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (selectedIndex >= availableOptions.length) setSelectedIndex(0)
  }, [availableOptions.length, selectedIndex])

  if (availableOptions.length === 0) return null

  const selectedColorObj = availableOptions[selectedIndex].color
  const selectedColorName = typeof selectedColorObj === 'string' ? selectedColorObj : selectedColorObj.name

  return (
    <section className="bg-slate-950 py-20 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-12">
        <div className="relative flex h-80 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 p-6 lg:col-span-8 lg:h-96">
          {availableOptions.map(({ color: colorObj, image }, idx) => {
            const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
            return (
              <Image
                key={colorName}
                src={image}
                alt={colorName}
                fill
                sizes="(max-width: 1024px) 100vw, 768px"
                loading={idx === 0 ? 'eager' : 'lazy'}
                className={`absolute inset-0 h-full w-full object-contain transition-all duration-500 ${selectedIndex === idx ? 'z-10 scale-100 opacity-100' : 'z-0 scale-95 opacity-0'}`}
              />
            )
          })}
          <span className="absolute bottom-4 left-6 z-20 text-xs text-white/40">
            Màu đang xem: {selectedColorName}
          </span>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <h2 className="text-2xl font-bold uppercase tracking-tight">Chọn màu sắc của bạn</h2>
          <p className="text-sm leading-6 text-white/60">
            {description || 'Cá nhân hóa chiếc xe theo phong cách của bạn.'}
          </p>
          <div className="flex flex-wrap gap-3 pt-3">
            {availableOptions.map(({ color: colorObj }, idx) => {
              const isSelected = selectedIndex === idx
              const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
              const swatchImg = typeof colorObj === 'object' ? colorObj.swatch : null
              const hexCode = colorHex(colorName)

              return (
                <button
                  key={colorName}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative h-11 w-11 rounded-full border-2 p-0.5 transition active:scale-95 ${isSelected ? 'border-brand-500 bg-brand-500/20' : 'border-white/20 hover:border-white/50'}`}
                  title={colorName}
                >
                  {swatchImg ? (
                    <Image src={swatchImg} alt={colorName} fill sizes="44px" className="rounded-full object-cover" />
                  ) : (
                    <span className="block h-full w-full rounded-full" style={{ background: colorBackground(colorName) || hexCode }} />
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-sm font-semibold text-white/70">{selectedColorName}</p>
        </div>
      </div>
    </section>
  )
}
