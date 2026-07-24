'use client'

import { useState, useEffect } from 'react'
import { Header } from '../../components/header'
import { Check, Battery, Zap, Ruler, ArrowRight } from 'lucide-react'

export function DepositClient({ carsData, specsData, initialCar }: { carsData: any[], specsData: any, initialCar?: string }) {
  const defaultCar = initialCar && carsData.some(c => c.name === initialCar) ? initialCar : 'VF 8'
  const defaultVariant = defaultCar === 'VF 3' ? 'VF 3 Eco' : (defaultCar === 'VF 2' ? 'VF 2 Tiêu chuẩn' : `${defaultCar} Plus`)

  const [selectedCarId, setSelectedCarId] = useState(defaultCar)
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant)
  const [selectedColor, setSelectedColor] = useState('Infinity Blanc')
  const [selectedInteriorColor, setSelectedInteriorColor] = useState('Granite Black')
  const [viewMode, setViewMode] = useState<'exterior'|'interior'>('exterior')
  const [interiorImageIndex, setInteriorImageIndex] = useState(0)
  const [selectedPackages, setSelectedPackages] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState(1)

  useEffect(() => {
    setInteriorImageIndex(0)
  }, [selectedInteriorColor, selectedCarId])

  const availableCars = carsData.filter(c => c.name.startsWith('VF') || c.name.startsWith('MPV'))

  const handleExteriorColorChange = (newColor: string) => {
    setSelectedColor(newColor)
    if (viewMode !== 'exterior') setViewMode('exterior')
    
    let isRed = newColor.toLowerCase().includes('red') || newColor.toLowerCase().includes('ruby') || newColor.toLowerCase().includes('crimson')
    if (newColor.toLowerCase().includes('velvet')) isRed = false
    
    if (selectedCarId === 'VF 8' && isRed && selectedInteriorColor === 'Saddle Brown') {
      setSelectedInteriorColor('Granite Black')
    }

    if (selectedCarId === 'VF 6' || selectedCarId === 'VF 7') {
      const isEco = selectedVariant.toLowerCase().includes('eco')
      if (isEco) {
        const allowsBeige = (newColor === 'Jet Black' || newColor === 'Solar Ruby')
        if (!allowsBeige && selectedInteriorColor === 'Cotton Beige') {
          setSelectedInteriorColor('Black')
        }
      } else {
        if (newColor === 'Solar Ruby') {
          setSelectedInteriorColor('Cotton Beige')
        } else {
          const allowsBeige = (newColor === 'Jet Black')
          if (!allowsBeige && selectedInteriorColor === 'Cotton Beige') {
            setSelectedInteriorColor('Mocca Brown')
          }
        }
      }
    }

    if (selectedCarId === 'VF 9') {
      const isEco = selectedVariant.toLowerCase().includes('eco')
      const allowsBeige = ['Jet Black', 'Crimson Red', 'Ivy Green'].includes(newColor)
      const allowsSaddleBrown = !isEco && newColor !== 'Crimson Red'
      
      if (!allowsBeige && selectedInteriorColor === 'Cotton Beige') {
        setSelectedInteriorColor('Granite Black')
      } else if (!allowsSaddleBrown && selectedInteriorColor === 'Saddle Brown') {
        setSelectedInteriorColor('Granite Black')
      }
    }
  }
  
  // Find current car
  const currentCar = carsData.find(c => c.name === selectedCarId) || carsData[0]
  const currentSpecs = specsData[currentCar.name] || {}
  
  let variants = Object.keys(currentSpecs.variants || {}).sort((a, b) => {
    if (currentCar.name === 'VF 8') {
      if (a.toLowerCase().includes('plus')) return -1
      if (b.toLowerCase().includes('plus')) return 1
      return 0
    }
    if (a.toLowerCase().includes('plus')) return 1
    if (b.toLowerCase().includes('plus')) return -1
    return 0
  })
  
  if (currentCar.name === 'VF 3') {
    variants = ['Eco', 'Plus']
  } else if (currentCar.name === 'VF 2') {
    variants = ['Tiêu chuẩn']
  }
  const colors = currentCar.colors || []
  
  // Update default variant when car changes
  useEffect(() => {
    setSelectedPackages([])
    if (variants.length > 0 && !variants.includes(selectedVariant.replace(currentCar.name + ' ', ''))) {
       setSelectedVariant(`${currentCar.name} ${variants[0]}`)
    }
    if (colors.length > 0) {
      const hasColor = colors.some((c: any) => c.name === selectedColor)
      if (!hasColor) setSelectedColor(colors[0].name)
    }
  }, [selectedCarId, currentCar.name])

  let baseColors = colors.slice(0, 4)
  let advancedColors = colors.slice(4)

  if (currentCar.name === 'VF 2') {
    const vf2Base = ['Infinity Blanc', 'Solar Ruby', 'Desat Silver']
    baseColors = colors.filter((c: any) => vf2Base.includes(c.name))
    advancedColors = colors.filter((c: any) => !vf2Base.includes(c.name))
  } else if (currentCar.name === 'VF 5') {
    baseColors = colors.slice(0, 3)
    advancedColors = colors.slice(3)
  } else if (currentCar.name === 'VF 6') {
    baseColors = colors.filter((c: any) => c.name !== 'Urban Mint')
    advancedColors = colors.filter((c: any) => c.name === 'Urban Mint')
  } else if (currentCar.name === 'VF 7') {
    baseColors = colors.filter((c: any) => c.name !== 'Urban Mint')
    advancedColors = colors.filter((c: any) => c.name === 'Urban Mint')
  } else if (currentCar.name === 'VF 9') {
    const vf9Advanced = ['Ivy Green', 'Desat Silver']
    baseColors = colors.filter((c: any) => !vf9Advanced.includes(c.name))
    advancedColors = colors.filter((c: any) => vf9Advanced.includes(c.name))
  }

  const activeColorObj = colors.find((c: any) => c.name === selectedColor)
  
  const allExterior = currentCar.gallery?.exterior_images || []
  const nonLogoExterior = allExterior.find((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('icon') && !img.toLowerCase().includes('uu-diem') && !img.toLowerCase().includes('tuy-chon'))
  let displayImage = activeColorObj?.image || nonLogoExterior || currentCar.image_url || allExterior[0]

  if (currentCar.name === 'VF 8') {
    const isEco = selectedVariant.toLowerCase().includes('eco')
    const typeFolder = isEco ? 'ND31V' : 'ND32V'
    let code = ''
    if (selectedColor === 'Jet Black') code = 'CE11'
    else if (selectedColor === 'Ivy Green') code = 'CE22'
    else if (selectedColor === 'Infinity Blanc') code = 'CE18'
    else if (selectedColor === 'Crimson Red') code = 'CE1M'
    else if (selectedColor === 'Zenith Grey - Desat Silver Roof') code = '171V'
    else if (selectedColor === 'Infinity Blanc - Zenith Grey Roof') code = '1V18'
    else if (selectedColor === 'Crimson Velvet - Mystery Bronze Roof') code = '2927'
    else if (selectedColor === 'Jet Black - Mystery Bronze Roof') code = '2911'
    
    if (code) {
      displayImage = `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/images/VF8/${typeFolder}/${code}.webp`
    }
  } else if (currentCar.name === 'VF 3' && selectedVariant.toLowerCase().includes('plus')) {
    let code = ''
    if (selectedColor === 'Summer Yellow') code = '181U'
    else if (selectedColor === 'Rose Pink') code = '1821'
    else if (selectedColor === 'Zenith Grey') code = 'CE1V'
    else if (selectedColor === 'Solar Ruby') code = 'CE2Q'
    else if (selectedColor === 'Sky Blue') code = '181Y'
    else if (selectedColor === 'Urban Mint') code = 'CE1W'
    else if (selectedColor === 'Infinity Blanc') code = 'CE18'

    if (code) {
      displayImage = `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/images/VF3/TI1BV/${code}.webp`
    }
  } else if (currentCar.name === 'VF 6' && selectedVariant.toLowerCase().includes('plus')) {
    let code = ''
    if (selectedColor === 'Infinity Blanc') code = 'CE18'
    else if (selectedColor === 'Jet Black') code = 'CE11'
    else if (selectedColor === 'Zenith Grey') code = 'CE1V'
    else if (selectedColor === 'Urban Mint') code = 'CE1W'
    else if (selectedColor === 'Crimson Red') code = 'CE2Q'

    if (code) {
      displayImage = `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/images/VF6/JB12V/${code}.webp`
    }
  } else if (currentCar.name === 'VF 9') {
    const isEco = selectedVariant.toLowerCase().includes('eco')
    const typeFolder = isEco ? 'NE3LV' : 'NE3MV'

    let code = ''
    if (selectedColor === 'Infinity Blanc') code = 'CE18'
    else if (selectedColor === 'Desat Silver') code = 'CE17'
    else if (selectedColor === 'Urban Mint') code = 'CE1W'
    else if (selectedColor === 'Jet Black') code = 'CE11'
    else if (selectedColor === 'Ivy Green') code = 'CE22'
    else if (selectedColor === 'Zenith Grey') code = 'CE1V'
    else if (selectedColor === 'Crimson Red') code = 'CE1M'

    if (code) {
      displayImage = `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/images/VF9/${typeFolder}/${code}.webp`
    }
  }

  let interiorImages: string[] = []
  if (currentCar.name === 'VF 9') {
    if (selectedInteriorColor === 'Cotton Beige') {
      interiorImages = Array.from({length: 4}).map((_, i) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI13/${i+1}.webp`)
    } else if (selectedInteriorColor === 'Saddle Brown') {
      interiorImages = Array.from({length: 10}).map((_, i) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/${i+1}.webp`)
    } else if (selectedInteriorColor === 'Granite Black') {
      interiorImages = [
        'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI11/1.jpg',
        'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI11/2.jpg'
      ]
    } else {
      interiorImages = Array.from(new Set(currentCar.gallery?.interior_images || []))
        .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
    }
  } else if (currentCar.name === 'VF 8') {
    const code = selectedInteriorColor === 'Granite Black' ? 'CI11' : 'CI12'
    interiorImages = [
      `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/1.png`,
      `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/2.png`,
      `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/3.png`,
      `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/4.png`,
      `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/5.png`
    ]
  } else if (currentCar.name === 'VF 3') {
    interiorImages = ['https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF3/TI1CV/interior/CI11/1.jpg']
  } else if (currentCar.name === 'VF 5') {
    interiorImages = ['https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF5/GA12V/interior/CI11/1.jpg']
  } else if (currentCar.name === 'VF 6' || currentCar.name === 'VF 7') {
    if (selectedInteriorColor === 'Cotton Beige') {
      if (currentCar.name === 'VF 7') {
        interiorImages = Array.from({length: 6}).map((_, i) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/${i+1}.webp`)
      } else {
        interiorImages = ['https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI13/1.webp']
      }
    } else if (selectedInteriorColor === 'Mocca Brown') {
      interiorImages = Array.from({length: 6}).map((_, i) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/${i+1}.png`)
    } else {
      if (currentCar.name === 'VF 7') {
        interiorImages = Array.from({length: 5}).map((_, i) => `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/${i+1}.webp`)
      } else {
        interiorImages = Array.from(new Set(currentCar.gallery?.interior_images || []))
          .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
      }
    }
  } else {
    interiorImages = Array.from(new Set(currentCar.gallery?.interior_images || []))
      .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
  }

  const powetrain = currentSpecs.variants?.[variants[0]]?.specs?.powertrain || {}
  const dimension = currentSpecs.variants?.[variants[0]]?.specs?.dimension || {}
  
  let availableInteriorColors = [
    { name: 'Granite Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' },
    { name: 'Saddle Brown', hex: '#633517', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw65203801/images/deposit/interior/CI12.webp' },
    { name: 'Cotton Beige', hex: '#d6cdb4' },
    { name: 'Navy Blue', hex: '#1c2841' }
  ]

  if (currentCar.name === 'VF 2') {
    availableInteriorColors = [
      { name: 'Grey', hex: '#808080', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw33eb76b4/images/deposit/interior/CI1M.webp' }
    ]
  } else if (currentCar.name === 'VF 3') {
    availableInteriorColors = [
      { name: 'Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' }
    ]
  } else if (currentCar.name === 'VF 9') {
    const graniteBlack = { name: 'Granite Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' }
    const cottonBeige = { name: 'Cotton Beige', hex: '#d6cdb4', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw6b5810a9/images/deposit/interior/CI13.webp' }
    const saddleBrown = { name: 'Saddle Brown', hex: '#633517', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw65203801/images/deposit/interior/CI12.webp' }
    
    const isEco = selectedVariant.toLowerCase().includes('eco')
    const hasCottonBeige = ['Jet Black', 'Crimson Red', 'Ivy Green'].includes(selectedColor)
    const hasSaddleBrown = !isEco && selectedColor !== 'Crimson Red'

    availableInteriorColors = [graniteBlack]
    if (hasSaddleBrown) availableInteriorColors.push(saddleBrown)
    if (hasCottonBeige) availableInteriorColors.push(cottonBeige)
  } else if (currentCar.name === 'VF 5') {
    availableInteriorColors = [
      { name: 'Granite Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' }
    ]
  } else if (currentCar.name === 'VF 6' || currentCar.name === 'VF 7') {
    const isEco = selectedVariant.toLowerCase().includes('eco')
    const black = { name: 'Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' }
    const cottonBeige = { name: 'Cotton Beige', hex: '#d6cdb4', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw6b5810a9/images/deposit/interior/CI13.webp' }
    const moccaBrown = { name: 'Mocca Brown', hex: '#6b4e31', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7e53f19e/images/deposit/interior/CI18.webp' } // Fallback CI18 URL, relying on hex
    
    if (isEco) {
      const allowsBeige = selectedColor === 'Jet Black' || selectedColor === 'Solar Ruby'
      availableInteriorColors = allowsBeige ? [black, cottonBeige] : [black]
    } else {
      if (selectedColor === 'Solar Ruby') {
        availableInteriorColors = [cottonBeige]
      } else if (selectedColor === 'Jet Black') {
        availableInteriorColors = [moccaBrown, cottonBeige]
      } else {
        availableInteriorColors = [moccaBrown]
      }
    }
  } else if (currentCar.name === 'VF 8') {
    availableInteriorColors = availableInteriorColors.slice(0, 2)
    let isRed = selectedColor.toLowerCase().includes('red') || selectedColor.toLowerCase().includes('ruby') || selectedColor.toLowerCase().includes('crimson')
    if (selectedColor.toLowerCase().includes('velvet')) isRed = false

    if (isRed) {
      availableInteriorColors = [availableInteriorColors[0]] // Only Granite Black
    }
  }

  const maxPower = powetrain.maxPower || '201 hp/150 kW'
  const distance = powetrain.distance?.split(' ')?.[0] || '480'
  const wheelbase = dimension.wheelbase || '2.730 mm'

  const activeColorHex = getColorHex(selectedColor)

  return (
    <div className="h-screen overflow-hidden bg-[#0a0a0a] flex flex-col font-sans pt-[74px] text-white">
      <Header />

      <div 
        className="flex flex-1 overflow-hidden flex-col lg:flex-row relative w-full" 
        style={{ zoom: 0.8, height: 'calc((100vh - 74px) / 0.8)' }}
      >
        
        {/* DYNAMIC BACKGROUND GRADIENT */}
        <div 
          className="absolute inset-0 opacity-40 transition-colors duration-1000 ease-in-out z-0"
          style={{
            background: `radial-gradient(circle at 40% 50%, ${activeColorHex}88 0%, transparent 60%)`
          }}
        />

        {/* LEFT COLUMN: CAR SHOWCASE */}
        <div className="flex-1 flex flex-col relative z-10">
          
          {/* SLEEK TOP BAR */}
          <div className="w-full px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 z-50 relative">
            {/* CAR SELECTOR */}
            <div className="inline-flex bg-white/5 backdrop-blur-md p-1.5 rounded-full border border-white/10 overflow-x-auto max-w-full hide-scrollbar">
              {availableCars.map((car, idx) => {
                const allImages = [
                  ...(car.gallery?.exterior_images || []),
                  ...(car.gallery?.interior_images || []),
                  ...(car.gallery?.all_images || [])
                ]
                const logo = allImages.find((img: string) => img.toLowerCase().includes('logo') || img.toLowerCase().includes('icon') || img.toLowerCase().endsWith('.svg'))
                const isSelected = selectedCarId === car.name

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedCarId(car.name)}
                    className={`px-6 py-2.5 rounded-full text-sm font-medium tracking-wider transition-all duration-300 whitespace-nowrap flex items-center justify-center min-w-[80px] h-10 ${
                      isSelected 
                        ? 'bg-white text-black shadow-lg scale-105' 
                        : 'text-white/60 hover:text-white hover:bg-white/10 group'
                    }`}
                  >
                    {logo ? (
                      <img src={logo} alt={car.name} className={`h-4 object-contain ${isSelected ? 'brightness-0' : 'brightness-0 invert opacity-60 group-hover:opacity-100'}`} />
                    ) : (
                      car.name
                    )}
                  </button>
                )
              })}
            </div>

            {/* VIEW TOGGLE */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl p-1.5 rounded-full border border-white/20 shadow-2xl">
              <button 
                onClick={() => setViewMode('exterior')}
                className={`px-8 py-2.5 rounded-full text-sm font-bold tracking-wider transition-all duration-300 ${viewMode === 'exterior' ? 'bg-white text-black shadow-lg scale-105' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
              >
                Ngoại thất
              </button>
              <button 
                onClick={() => setViewMode('interior')}
                className={`px-8 py-2.5 rounded-full text-sm font-bold tracking-wider transition-all duration-300 ${viewMode === 'interior' ? 'bg-white text-black shadow-lg scale-105' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
              >
                Nội thất
              </button>
            </div>
          </div>

          {/* MAIN STAGE (CAR + FLOATING SPECS) */}
          {viewMode === 'exterior' ? (
            <div className="flex-1 flex items-center justify-center relative px-12">
              {/* CAR IMAGE */}
              <div className="relative w-full max-w-4xl animate-in fade-in zoom-in duration-1000">
                <img 
                  key={displayImage}
                  src={displayImage} 
                  alt={currentCar.name} 
                  className="w-full h-auto object-contain drop-shadow-2xl mix-blend-screen"
                  style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.5))' }}
                />
              </div>

              {/* FLOATING SPECS - GLASSMORPHISM */}
              <div className="absolute top-1/4 left-12 bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl hidden md:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '4s'}}>
                <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Zap size={14} /> Công suất
                </div>
                <div className="text-xl font-light text-white">{maxPower}</div>
              </div>

              <div className="absolute bottom-1/3 right-12 bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl hidden md:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '5s'}}>
                <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Battery size={14} /> Phạm vi
                </div>
                <div className="text-xl font-light text-white">{distance} <span className="text-sm text-white/50">km</span></div>
              </div>

              <div className="absolute top-1/3 right-20 bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl hidden lg:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '6s'}}>
                <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Ruler size={14} /> Trục cơ sở
                </div>
                <div className="text-xl font-light text-white">{wheelbase}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center relative px-12 pt-8 pb-32">
              <div className="relative w-full max-w-4xl aspect-[16/9] rounded-2xl overflow-hidden shadow-2xl bg-black/40 border border-white/10">
                {interiorImages[interiorImageIndex] && (
                  <img 
                    key={interiorImages[interiorImageIndex]} 
                    src={interiorImages[interiorImageIndex]} 
                    alt="Interior" 
                    className="w-full h-full object-cover animate-in fade-in duration-500" 
                  />
                )}
              </div>
              <div className="flex gap-4 mt-8 z-30">
                {interiorImages.map((img, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => setInteriorImageIndex(idx)} 
                    className={`w-28 aspect-[16/9] rounded-xl overflow-hidden border-[3px] transition-all ${interiorImageIndex === idx ? 'border-blue-500 scale-110 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'}`}
                  >
                    <img src={img} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          
          
          <div className="pb-4 px-12 text-center relative z-20">
            <h1 className="text-[5rem] font-black tracking-tighter text-white/5 opacity-50 select-none uppercase absolute bottom-0 left-1/2 -translate-x-1/2 w-full text-center pointer-events-none">{currentCar.name}</h1>
          </div>
        </div>

        {/* RIGHT COLUMN: PREMIUM CONFIGURATOR */}
        <div className="w-full lg:w-[480px] bg-white text-slate-900 shadow-2xl z-20 flex flex-col relative rounded-t-[40px] lg:rounded-t-none lg:rounded-l-[40px] overflow-hidden">
          
          <div className="flex-1 overflow-y-auto hide-scrollbar p-8 pb-32">
            
            {/* MODERN STEPPER */}
            <div className="flex items-center gap-4 mb-10 mt-2">
               <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep >= 1 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>1</div>
                 <span className={`font-bold tracking-wide text-sm uppercase ${currentStep >= 1 ? 'text-slate-900' : 'text-slate-300 hidden sm:inline'}`}>Lựa chọn xe</span>
               </div>
               <div className={`h-px flex-1 ${currentStep >= 2 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
               <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep >= 2 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>2</div>
                 <span className={`font-bold tracking-wide text-sm uppercase ${currentStep >= 2 ? 'text-slate-900' : 'text-slate-300 hidden sm:inline'}`}>Nhập thông tin</span>
               </div>
               <div className={`h-px w-4 ${currentStep >= 3 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep >= 3 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>3</div>
            </div>

            {currentStep === 1 && (
              <>

            {/* VARIANT SELECTION */}
            {variants.length > 0 && (
              <div className="mb-12">
                <div className="flex items-baseline justify-between mb-6">
                  <h3 className="text-2xl font-bold tracking-tight">Phiên bản</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {variants.map(v => {
                    const variantName = `${currentCar.name} ${v}`
                    const isSelected = selectedVariant === variantName
                    return (
                      <div 
                        key={v} 
                        onClick={() => {
                          setSelectedVariant(variantName)
                          if (currentCar.name === 'VF 6' || currentCar.name === 'VF 7') {
                            const isNewVariantEco = variantName.toLowerCase().includes('eco')
                            if (isNewVariantEco) {
                              const allowsBeige = (selectedColor === 'Jet Black' || selectedColor === 'Solar Ruby')
                              if (!allowsBeige && selectedInteriorColor === 'Cotton Beige') {
                                setSelectedInteriorColor('Black')
                              }
                              if (selectedInteriorColor === 'Mocca Brown') {
                                setSelectedInteriorColor('Black')
                              }
                            } else {
                              if (selectedColor === 'Solar Ruby') {
                                setSelectedInteriorColor('Cotton Beige')
                              } else {
                                const allowsBeige = (selectedColor === 'Jet Black')
                                if (selectedInteriorColor === 'Black') {
                                  setSelectedInteriorColor('Mocca Brown')
                                } else if (!allowsBeige && selectedInteriorColor === 'Cotton Beige') {
                                  setSelectedInteriorColor('Mocca Brown')
                                }
                              }
                            }
                          }
                          if (currentCar.name === 'VF 9') {
                            const isNewVariantEco = variantName.toLowerCase().includes('eco')
                            if (isNewVariantEco && selectedInteriorColor === 'Saddle Brown') {
                              setSelectedInteriorColor('Granite Black')
                            }
                          }
                        }}
                        className={`relative overflow-hidden cursor-pointer rounded-2xl p-6 transition-all duration-300 border-2 ${
                          isSelected 
                            ? 'border-slate-900 bg-slate-50 scale-[1.02] shadow-xl' 
                            : 'border-slate-100 hover:border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-6 right-6 text-slate-900">
                            <Check size={20} strokeWidth={3} />
                          </div>
                        )}
                        <h4 className={`text-xl font-bold mb-1 ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{variantName}</h4>
                        <p className="text-sm text-slate-500 font-medium">{v.toLowerCase().includes('plus') ? 'Bản cao cấp với thiết kế sang trọng' : 'Bản tiêu chuẩn với thiết kế tinh tế'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* UPGRADE PACKAGES */}
            {(() => {
              const availablePackages = currentCar.optional_packages?.filter((pkg: any) => !pkg.variants || pkg.variants.some((v: string) => selectedVariant.includes(v))) || []
              if (availablePackages.length === 0) return null
              
              return (
                <div className="mb-8">
                  <div className="flex items-baseline justify-between mb-6">
                    <h3 className="text-2xl font-bold tracking-tight">Tùy chọn nâng cấp</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {availablePackages.map((pkg: any) => {
                      const isSelected = selectedPackages.includes(pkg.id)
                      return (
                        <div 
                          key={pkg.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedPackages(prev => prev.filter(id => id !== pkg.id))
                            } else {
                              setSelectedPackages(prev => [...prev, pkg.id])
                            }
                          }}
                          className={`relative overflow-hidden cursor-pointer rounded-2xl p-5 transition-all duration-300 border-2 flex items-center justify-between ${
                            isSelected 
                              ? 'border-slate-900 bg-slate-50 shadow-md' 
                              : 'border-slate-100 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div>
                            <h4 className={`text-lg font-bold mb-1 ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{pkg.name}</h4>
                            <p className="text-sm font-medium text-blue-600">+{new Intl.NumberFormat('vi-VN').format(pkg.price)} VNĐ</p>
                          </div>
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300'}`}>
                            {isSelected && <Check size={14} strokeWidth={4} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* COLOR SELECTION */}
            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-2xl font-bold tracking-tight">Ngoại thất</h3>
                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{selectedColor}</span>
              </div>
              
              <div className="mb-8">
                <span className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 block">Màu tiêu chuẩn</span>
                <div className="flex flex-wrap gap-5">
                  {baseColors.map((c: any, i) => {
                    const isSelected = selectedColor === c.name
                    return (
                      <button 
                        key={i}
                        onClick={() => handleExteriorColorChange(c.name)}
                        className="relative group outline-none"
                        title={c.name}
                      >
                        <div className={`absolute -inset-1.5 rounded-full transition-all duration-300 ${isSelected ? 'bg-slate-900 scale-100' : 'bg-transparent scale-50 opacity-0 group-hover:bg-slate-200 group-hover:scale-100 group-hover:opacity-100'}`}></div>
                        <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-sm border border-black/5 z-10 transition-transform group-hover:scale-110 group-active:scale-95">
                          {c.swatch ? (
                            <img src={c.swatch} alt={c.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full" style={{ backgroundColor: getColorHex(c.name) }} />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {advancedColors.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 block">Màu nâng cao <span className="text-blue-600 normal-case">{['VF 8', 'VF 7', 'VF 9'].includes(currentCar.name) ? '+12.000.000đ' : '+8.000.000đ'}</span></span>
                  <div className="flex flex-wrap gap-5">
                    {advancedColors.map((c: any, i) => {
                      const isSelected = selectedColor === c.name
                      return (
                        <button 
                          key={i}
                          onClick={() => handleExteriorColorChange(c.name)}
                          className="relative group outline-none"
                          title={c.name}
                        >
                          <div className={`absolute -inset-1.5 rounded-full transition-all duration-300 ${isSelected ? 'bg-slate-900 scale-100' : 'bg-transparent scale-50 opacity-0 group-hover:bg-slate-200 group-hover:scale-100 group-hover:opacity-100'}`}></div>
                          <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-sm border border-black/5 z-10 transition-transform group-hover:scale-110 group-active:scale-95">
                            {c.swatch ? (
                              <img src={c.swatch} alt={c.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full" style={{ backgroundColor: getColorHex(c.name) }} />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            
            {/* INTERIOR COLOR SELECTION */}
            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-2xl font-bold tracking-tight">Nội thất</h3>
                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{selectedInteriorColor}</span>
              </div>
              
              <div className="flex flex-wrap gap-5">
                {availableInteriorColors.map((c, i) => {
                  const isSelected = selectedInteriorColor === c.name
                  return (
                    <button 
                      key={i}
                      onClick={() => {
                        setSelectedInteriorColor(c.name)
                        if (viewMode !== 'interior') setViewMode('interior')
                      }}
                      className="relative group outline-none"
                      title={c.name}
                    >
                      <div className={`absolute -inset-1.5 rounded-xl transition-all duration-300 ${isSelected ? 'bg-blue-600 scale-100' : 'bg-transparent scale-50 opacity-0 group-hover:bg-slate-200 group-hover:scale-100 group-hover:opacity-100'}`}></div>
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden shadow-sm border border-black/5 z-10 transition-transform group-hover:scale-110 group-active:scale-95">
                        {c.swatch ? (
                          <img src={c.swatch} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ backgroundColor: c.hex }} />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            </>
            )}
            
            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-2xl font-bold tracking-tight mb-8">Thông tin người đặt cọc</h3>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Họ và tên <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="Nhập họ và tên đầy đủ" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Số điện thoại <span className="text-red-500">*</span></label>
                    <input type="tel" placeholder="Nhập số điện thoại" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Email <span className="text-red-500">*</span></label>
                    <input type="email" placeholder="Nhập địa chỉ email" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Số CCCD / CMND / Hộ chiếu <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="Nhập số giấy tờ tùy thân" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Tỉnh / Thành phố <span className="text-red-500">*</span></label>
                      <select className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white appearance-none">
                        <option value="">Chọn Tỉnh/Thành</option>
                        <option value="HN">Hà Nội</option>
                        <option value="HCM">TP. Hồ Chí Minh</option>
                        <option value="DN">Đà Nẵng</option>
                        <option value="HP">Hải Phòng</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Quận / Huyện <span className="text-red-500">*</span></label>
                      <select className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white appearance-none">
                        <option value="">Chọn Quận/Huyện</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4">
                    <label className="text-sm font-semibold text-slate-700">Chọn Showroom nhận xe <span className="text-red-500">*</span></label>
                    <select className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white appearance-none">
                      <option value="">Chọn Showroom gần bạn</option>
                      <option value="1">VinFast Landmark 81</option>
                      <option value="2">VinFast Thảo Điền</option>
                      <option value="3">VinFast Ocean Park</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center py-12">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check size={40} strokeWidth={3} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight mb-4">Hoàn tất đặt cọc!</h3>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto">Cảm ơn bạn đã tin tưởng VinFast. Nhân viên của chúng tôi sẽ liên hệ trong thời gian sớm nhất để xác nhận.</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 text-left">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-500">Mã đơn hàng</span>
                    <span className="font-bold">VF{Math.floor(Math.random() * 1000000)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-500">Xe đặt cọc</span>
                    <span className="font-bold">{selectedVariant}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Số tiền cọc</span>
                    <span className="font-bold text-blue-600">10.000.000 ₫</span>
                  </div>
                </div>
              </div>
            )}
            
          </div>

          {/* BOTTOM CHECKOUT BAR */}
          <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-6 z-30">
             <div className="flex items-center justify-between gap-4">
               {currentStep < 3 ? (
                 <>
                   <div>
                     <div className="text-sm font-medium text-slate-500 mb-0.5">Tổng dự tính</div>
                     <div className="text-xl font-black text-slate-900">
                       {(() => {
                          const selectedVariantName = selectedVariant.replace(currentCar.name + ' ', '')
                          const variantData = currentSpecs.variants?.[selectedVariantName]
                          const basePrice = variantData?.price || currentCar.displayed_price || 0
                          
                          const isAdvancedColor = advancedColors.some((c: any) => c.name === selectedColor)
                          const colorPrice = isAdvancedColor ? (['VF 8', 'VF 7', 'VF 9'].includes(currentCar.name) ? 12000000 : 8000000) : 0
                          
                          let packagesPrice = 0
                          const availablePackages = currentCar.optional_packages?.filter((pkg: any) => !pkg.variants || pkg.variants.some((v: string) => selectedVariant.includes(v))) || []
                          selectedPackages.forEach(id => {
                            const pkg = availablePackages.find((p: any) => p.id === id)
                            if (pkg) packagesPrice += pkg.price
                          })
                          
                          const totalPrice = basePrice + colorPrice + packagesPrice
                          return totalPrice > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalPrice) : 'Liên hệ'
                       })()}
                     </div>
                   </div>
                   
                   <div className="flex gap-3">
                     {currentStep > 1 && (
                       <button 
                         onClick={() => setCurrentStep(currentStep - 1)}
                         className="flex items-center justify-center bg-slate-100 text-slate-600 px-6 py-4 rounded-full font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
                       >
                         Quay lại
                       </button>
                     )}
                     <button 
                       onClick={() => setCurrentStep(currentStep + 1)}
                       className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-full font-bold text-sm tracking-widest hover:bg-slate-800 transition-all hover:gap-3 uppercase hover:shadow-xl active:scale-95"
                     >
                       {currentStep === 1 ? 'Tiếp tục' : 'Thanh toán'} <ArrowRight size={18} />
                     </button>
                   </div>
                 </>
               ) : (
                 <button 
                   onClick={() => window.location.href = '/'}
                   className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-full font-bold text-sm tracking-widest hover:bg-slate-800 transition-all uppercase hover:shadow-xl active:scale-95"
                 >
                   Về trang chủ
                 </button>
               )}
             </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function getColorHex(name: string) {
  const map: Record<string, string> = {
    'Infinity Blanc': '#ffffff',
    'Jet Black': '#000000',
    'Zenith Grey': '#5c5d61',
    'Crimson Red': '#6b1114',
    'VinFast Blue': '#1b5bf7',
    'Deep Ocean': '#1e3831',
    'Urban Mint': '#789582',
    'Brahminy White': '#fcfcfc',
    'Desat Silver': '#b4b5b7',
    'Future Blue': '#5e7b99',
    'Luxury Blue': '#132145',
  }
  return map[name] || '#333333'
}
