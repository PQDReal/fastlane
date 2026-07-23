'use client'

import { useState, useEffect } from 'react'
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
  'Infinity Blanc': '#F8F9FA',
  'Solar Ruby': '#941B26',
  'Zenith Grey': '#5E5E5E',
  'Urban Mint': '#A0E8D7',
  'Summer Yellow Body - Jet Black Roof': '#FFD700',
  'Ivy Green': '#556B2F',
  'Zenith Grey - Desat Silver Roof': '#5E5E5E',
  'Infinity Blanc - Zenith Grey Roof': '#F8F9FA'
}

export function CarColorSelector({ colors, images }: CarColorSelectorProps) {
  // If we have no colors, or no images, or different lengths, we can't reliably map them.
  if (!colors || colors.length === 0 || !images || images.length === 0) return null

  // Ensure we don't exceed the shortest array
  const availableColors = colors.slice(0, Math.min(colors.length, images.length))
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (availableColors.length === 0) return null

  const selectedColorObj = availableColors[selectedIndex]
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
            {availableColors.map((colorObj, idx) => {
              const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
              return (
                <img 
                  key={colorName}
                  src={images[idx]} 
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
              {availableColors.map((colorObj, idx) => {
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
