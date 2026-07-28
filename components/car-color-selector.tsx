'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CarColorSelectorProps {
  colors: (string | { name: string; swatch?: string; price_delta?: number })[]
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
    .map((color, index) => ({ color, image: images[index]?.trim() ?? '', optIdx: index }))
    .filter((option) => option.image !== '')
  
  // Update optIdx to map correctly after filtering
  const options = availableOptions.map((opt, idx) => ({ ...opt, optIdx: idx }))
  
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (options.length === 0) return null

  const selectedColorObj = options[selectedIndex]?.color
  const selectedColorName = typeof selectedColorObj === 'string' ? selectedColorObj : selectedColorObj?.name

  const handlePrev = () => setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1))
  const handleNext = () => setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0))

  const standardColors = options.filter(opt => typeof opt.color === 'string' || (typeof opt.color === 'object' && (!opt.color.price_delta || opt.color.price_delta === 0)))
  const advancedColors = options.filter(opt => typeof opt.color === 'object' && opt.color.price_delta && opt.color.price_delta > 0)

  const renderSwatch = ({ color: colorObj, optIdx }: { color: any; optIdx: number }) => {
    const isSelected = selectedIndex === optIdx
    const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
    const swatchImg = typeof colorObj === 'object' ? colorObj.swatch : null

    const hexCode = colorMap[colorName] || '#CCCCCC'

    return (
      <button
        key={colorName}
        onClick={() => setSelectedIndex(optIdx)}
        className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 focus:outline-none shadow-md ${isSelected ? 'ring-2 ring-offset-[3px] ring-[#3b82f6] scale-110' : ''}`}
        style={{ backgroundColor: swatchImg ? 'transparent' : hexCode }}
        title={colorName}
      >
        {swatchImg && (
          <img src={swatchImg} alt={colorName} className="absolute inset-0 w-full h-full object-cover rounded-full" />
        )}
      </button>
    )
  }

  return (
    <section className="py-24 bg-gradient-to-b from-white to-gray-100">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-[56px] font-bold tracking-tight text-foreground mb-16">
          Trải nghiệm cá nhân hóa
        </h2>

        <div className="flex flex-col items-center gap-8 sm:gap-12">
          {/* Image Display */}
          <div className="relative w-full max-w-4xl aspect-[16/9] md:aspect-[2/1] flex items-center justify-center group">
            <button onClick={handlePrev} className="absolute left-0 sm:left-4 z-20 p-2 sm:p-3 bg-black/5 hover:bg-black/20 text-black rounded-full transition-colors hidden sm:block">
              <ChevronLeft size={32} />
            </button>
            <button onClick={handleNext} className="absolute right-0 sm:right-4 z-20 p-2 sm:p-3 bg-black/5 hover:bg-black/20 text-black rounded-full transition-colors hidden sm:block">
              <ChevronRight size={32} />
            </button>
            
            {options.map(({ color: colorObj, image }, idx) => {
              const colorName = typeof colorObj === 'string' ? colorObj : colorObj.name
              return (
                <img
                  key={colorName}
                  src={image}
                  alt={colorName}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out ${selectedIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
                    }`}
                />
              )
            })}
          </div>

          {/* Color Swatches */}
          <div className="flex flex-col items-center gap-8 mt-4">
            <p className="text-3xl sm:text-4xl font-light text-slate-800">
              {selectedColorName}
            </p>

            {advancedColors.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-12 sm:gap-24 items-center sm:items-start justify-center mt-2">
                <div className="flex flex-col items-center gap-6">
                   <h3 className="text-xl sm:text-2xl font-light text-slate-600">Màu tiêu chuẩn</h3>
                   <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-[300px]">
                     {standardColors.map(opt => renderSwatch(opt))}
                   </div>
                </div>
                <div className="flex flex-col items-center gap-6">
                   <h3 className="text-xl sm:text-2xl font-light text-slate-600 flex flex-col items-center">
                     Màu nâng cao
                     {typeof advancedColors[0]?.color !== 'string' && advancedColors[0]?.color?.price_delta && (
                       <span className="text-sm font-medium text-blue-600 mt-1">
                         +{new Intl.NumberFormat('vi-VN').format(advancedColors[0].color.price_delta)} VNĐ
                       </span>
                     )}
                   </h3>
                   <div className="flex flex-wrap justify-center gap-4 sm:gap-6 max-w-[300px]">
                     {advancedColors.map(opt => renderSwatch(opt))}
                   </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 max-w-2xl mt-2">
                {options.map(opt => renderSwatch(opt))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
