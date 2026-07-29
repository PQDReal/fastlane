'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'

interface BikeColorSelectorProps {
  colors: (string | { name: string; swatch?: string })[]
  images: string[]
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

function isLightColor(colorName: string, hexCode: string) {
  const normalized = colorName.toLocaleLowerCase('vi')
  if (
    normalized.includes('trắng') ||
    normalized.includes('white') ||
    normalized.includes('blanc') ||
    normalized.includes('vàng') ||
    normalized.includes('yellow')
  ) {
    return true
  }

  const hex = hexCode.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 160
}

export function BikeColorSelector({ colors, images }: BikeColorSelectorProps) {
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
    <section className="py-24 bg-white">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-[56px] font-bold tracking-tight text-foreground mb-16">
          Trải nghiệm cá nhân hóa
        </h2>

        <div className="flex flex-col items-center gap-12">
          {/* Image Display */}
          <div className="relative w-full max-w-4xl aspect-[16/9] md:aspect-[2/1] flex items-center justify-center">
            {availableOptions.map(({ color: colorObj }, idx) => {
              const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
              return (
                <img
                  key={colorName}
                  src={availableOptions[idx].image}
                  alt={colorName}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out ${selectedIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
                    }`}
                />
              )
            })}
          </div>

          {/* Color Swatches */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {availableOptions.map(({ color: colorObj }, idx) => {
                const isSelected = selectedIndex === idx
                const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
                const swatchImg = typeof colorObj === 'object' ? colorObj.swatch : null

                const hexCode = colorHex(colorName)
                const useDarkCheck = isLightColor(colorName, hexCode)

                return (
                  <button
                    key={colorName}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 overflow-hidden shadow-sm`}
                    style={{ background: swatchImg ? 'transparent' : colorBackground(colorName) }}
                    title={colorName}
                  >
                    {swatchImg && (
                      <img src={swatchImg} alt={colorName} className="absolute inset-0 w-full h-full object-cover" />
                    )}

                    {/* Ring selection effect */}
                    {isSelected && (
                      <span className="absolute -inset-2 rounded-full border-2 border-foreground z-20" />
                    )}

                    {/* Checkmark */}
                    {isSelected && (
                      <Check size={20} className={`relative z-10 ${useDarkCheck ? 'text-black' : 'text-white drop-shadow-md'}`} />
                    )}
                  </button>
                )
              })}
            </div>

            <p className="text-xl font-medium text-foreground">
              {selectedColorName}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
