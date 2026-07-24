'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

interface CarColorSelectorProps {
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
  'Infinity Blanc - Zenith Grey Roof': '#F8F9FA',
  'Xám': '#747B7D',
  'Đen': '#171717',
  'Đen nhám': '#171717',
  'Đen bóng': '#111111',
  'Đỏ tươi': '#C8202F',
  'Đỏ': '#C8202F',
  'Đỏ Đen': '#C8202F',
  'Đỏ tươi - Đen nhám': '#C8202F',
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

export function CarColorSelector({ colors, images }: CarColorSelectorProps) {
  // Keep the color/image association but omit entries whose image is unavailable.
  // Empty strings remain valid placeholders in the database; they must not reach <img src>.
  const availableOptions = colors
    .slice(0, Math.min(colors.length, images.length))
    .map((color, index) => ({ color, image: images[index]?.trim() ?? '' }))
    .filter((option) => option.image !== '')
  const [selectedIndex, setSelectedIndex] = useState(0)

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
            {availableOptions.map(({ color: colorObj, image }, idx) => {
              const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
              return (
                <img 
                  key={colorName}
                  src={image}
                  alt={colorName}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out ${
                    selectedIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
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
                
                const hexCode = colorMap[colorName] || '#CCCCCC'
                const isLightColor = ['Infinity Blanc', 'Brahminy White', 'Summer Yellow'].includes(colorName)

                return (
                  <button
                    key={colorName}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 overflow-hidden shadow-sm`}
                    style={{ backgroundColor: swatchImg ? 'transparent' : hexCode }}
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
                      <Check size={20} className={`relative z-10 ${isLightColor && !swatchImg ? 'text-black' : 'text-white drop-shadow-md'}`} />
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
