'use client'

import { useState, useEffect } from 'react'
import { Header } from '../../components/header'
import { Check, Battery, Zap, Ruler, ArrowRight } from 'lucide-react'
import { ToastMessage, ToastViewport } from '../../components/ui/toast'
import { SearchableLocationSelect, LocationOption } from '@/components/ui/searchable-location-select'
import {
  findDepositVehicle,
  type DepositVehicleType,
} from '../../lib/deposit-vehicles'

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function DepositClient({
  carsData,
  motorbikesData,
  specsData,
  initialCar,
  initialVehicleType,
}: {
  carsData: any[]
  motorbikesData: any[]
  specsData: any
  initialCar?: string
  initialVehicleType: DepositVehicleType
}) {
  const initialVehicles =
    initialVehicleType === 'motorbike' ? motorbikesData : carsData
  const matchedInitialVehicle = findDepositVehicle(initialVehicles, initialCar)
  const defaultCar =
    matchedInitialVehicle?.name ||
    (initialVehicleType === 'motorbike' ? motorbikesData[0]?.name : 'VF 8')
  const defaultVariant =
    initialVehicleType === 'motorbike'
      ? `${defaultCar} ${matchedInitialVehicle?.variants?.[0] || motorbikesData[0]?.variants?.[0] || 'Bản tiêu chuẩn'}`
      : defaultCar === 'VF 3'
        ? 'VF 3 Eco'
        : defaultCar === 'VF 2'
          ? 'VF 2 Tiêu chuẩn'
          : `${defaultCar} Plus`

  const [vehicleType, setVehicleType] =
    useState<DepositVehicleType>(initialVehicleType)
  const [selectedCarId, setSelectedCarId] = useState(defaultCar)
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant)
  const [selectedColor, setSelectedColor] = useState('Infinity Blanc')
  const [selectedInteriorColor, setSelectedInteriorColor] = useState(
    initialVehicleType === 'motorbike' ? '' : 'Granite Black',
  )
  const [viewMode, setViewMode] = useState<'exterior'|'interior'>('exterior')
  const [interiorImageIndex, setInteriorImageIndex] = useState(0)
  const [selectedPackages, setSelectedPackages] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState(1)
  const [customerType, setCustomerType] = useState<'personal' | 'corporate'>('personal')
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', idCard: '', companyName: '', province: '', district: '' })
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'atm' | 'bank_transfer'>('bank_transfer')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [dbVariants, setDbVariants] = useState<any[]>([])
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [districts, setDistricts] = useState<LocationOption[]>([])
  const [provinceCode, setProvinceCode] = useState<number | null>(null)

  useEffect(() => {
    fetch('https://esgoo.net/api-tinhthanh/1/0.htm')
      .then(res => res.json())
      .then(data => {
        if (data.error === 0) {
          setProvinces(data.data.map((p: any) => ({ code: Number(p.id), name: p.full_name })))
        }
      })
      .catch(err => console.error('Error fetching provinces:', err))
  }, [])

  useEffect(() => {
    async function fetchVariants() {
      try {
        const currentCarObj = carsData.find(c => c.name === selectedCarId) || carsData[0]
        const res = await fetch(`/api/v1/vehicle-variants?product_name=${encodeURIComponent(currentCarObj.name)}`)
        const data = await res.json()
        setDbVariants(data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchVariants()
  }, [selectedCarId, carsData])

  useEffect(() => {
    if (provinceCode) {
      fetch(`https://esgoo.net/api-tinhthanh/2/${provinceCode}.htm`)
        .then(res => res.json())
        .then(data => {
          if (data.error === 0) {
            setDistricts(data.data.map((d: any) => ({ code: Number(d.id), name: d.full_name })))
          }
        })
        .catch(err => console.error('Error fetching districts:', err))
    } else {
      setDistricts([])
    }
  }, [provinceCode])

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }

  useEffect(() => {
    setInteriorImageIndex(0)
  }, [selectedInteriorColor, selectedCarId])

  const availableCars =
    vehicleType === 'motorbike'
      ? motorbikesData
      : carsData
          .filter(
            (c) =>
              c.name.startsWith('VF') ||
              c.name.startsWith('MPV') ||
              c.name.startsWith('VinFast'),
          )
          .sort((a, b) => {
      const getOrder = (name: string) => {
        if (name.includes('VF 2')) return 2
        if (name.includes('VF 3')) return 3
        if (name.includes('VF 5')) return 5
        if (name.includes('VF 6')) return 6
        if (name.includes('MPV 7') || name.includes('VF 7')) return 7
        if (name.includes('All-New 2026') || name.includes('VF 8')) return 8
        if (name.includes('VF 9')) return 9
        return 100
      }
      const orderA = getOrder(a.name)
      const orderB = getOrder(b.name)
      if (orderA !== orderB) return orderA - orderB
      return a.name.length - b.name.length
    })

  const handleVehicleTypeChange = (nextType: DepositVehicleType) => {
    if (nextType === vehicleType) return

    const nextVehicles = nextType === 'motorbike' ? motorbikesData : carsData
    const nextDefault =
      nextType === 'motorbike'
        ? nextVehicles[0]
        : findDepositVehicle(nextVehicles, 'VF 8') || nextVehicles[0]

    setVehicleType(nextType)
    setSelectedCarId(nextDefault?.name || '')
    setViewMode('exterior')
    setInteriorImageIndex(0)
    setSelectedInteriorColor(nextType === 'motorbike' ? '' : 'Granite Black')
  }

  const handleExteriorColorChange = (newColor: string) => {
    setSelectedColor(newColor)
    if (viewMode !== 'exterior') setViewMode('exterior')
    
    if (selectedCarId.includes('VF 8')) {
      const allowsSaddleBrown = [
        'Infinity Blanc', 
        'Starburst Blue', 
        'Jet Black', 
        'Starburst Blue Body - Infinity Blanc Roof', 
        'Jet Black Body - Stealth Gray Roof'
      ].includes(newColor)

      if (!allowsSaddleBrown && selectedInteriorColor === 'Saddle Brown') {
        setSelectedInteriorColor('Granite Black')
      }
    }

    if (selectedCarId.includes('MPV')) {
      if ((newColor === 'Solar Ruby' || newColor === 'Introspective Brown') && selectedInteriorColor === 'Mocca Brown') {
        setSelectedInteriorColor('Black')
      }
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

  const handleNextStep = () => {
    if (currentStep === 1) {
      setCurrentStep(2)
    } else if (currentStep === 2) {
      const isMissingPersonal = customerType === 'personal' && !formData.name;
      const isMissingCorporate = customerType === 'corporate' && !formData.companyName;
      
      if (isMissingPersonal || isMissingCorporate || !formData.phone || !formData.email || !formData.idCard || !formData.province || !formData.district) {
        addToast({ kind: 'warning', title: 'Vui lòng điền đầy đủ các thông tin bắt buộc' });
        return;
      }
      setCurrentStep(3)
    } else if (currentStep === 3) {
      if (!termsAccepted) {
        addToast({ kind: 'warning', title: 'Vui lòng xác nhận đồng ý với các Điều kiện & Điều khoản' });
        return;
      }

      setIsSubmitting(true);
      
      const order_number = 'VF' + Math.floor(Math.random() * 1000000)

      const currentCarObj =
        availableCars.find((c) => c.name === selectedCarId) || availableCars[0]
      const currentSpecsObj = specsData[currentCarObj.name] || {}
      
      const selectedVariantName = selectedVariant.replace(currentCarObj.name + ' ', '')
      const variantData = currentSpecsObj.variants?.[selectedVariantName]
      const basePrice = variantData?.price || currentCarObj.displayed_price || 0
      
      const advancedColorsList = (currentCarObj.colors || []).slice(4)
      const isAdvancedColor = advancedColorsList.some((c: any) => c.name === selectedColor)
      const colorPrice = isAdvancedColor ? (currentCarObj.name.includes('MPV') ? 10000000 : (['VF 7', 'VF 9'].includes(currentCarObj.name) || currentCarObj.name.includes('VF 8') ? 12000000 : 8000000)) : 0
      
      let packagesPrice = 0
      const availablePackages = currentCarObj.optional_packages?.filter((pkg: any) => !pkg.variants || pkg.variants.some((v: string) => selectedVariant.includes(v))) || []
      selectedPackages.forEach(id => {
        const pkg = availablePackages.find((p: any) => p.id === id)
        if (pkg) packagesPrice += pkg.price
      })
      const totalPrice = basePrice + colorPrice + packagesPrice

      fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number,
          customer_type: customerType,
          full_name: formData.name,
          company_name: formData.companyName,
          phone_number: formData.phone,
          email: formData.email,
          id_card_number: formData.idCard,
          province: formData.province,
          district: formData.district,
          car_model: currentCarObj.name,
          car_variant: selectedVariant,
          exterior_color: selectedColor,
          interior_color:
            currentCarObj.product_type === 'motorbike'
              ? ''
              : selectedInteriorColor,
          vehicle_variant_id: matchingDbVariant?.id,
          optional_packages: selectedPackages,
          showroom: 'VinFast Landmark 81',
          payment_method: paymentMethod,
          deposit_amount:
            matchingDbVariant?.deposit_amount ||
            currentCarObj.deposit_value ||
            (currentCarObj.product_type === 'motorbike' ? 2000000 : 10000000),
          total_estimated_price: totalPrice
        })
      }).then(res => res.json()).then(res => {
        setIsSubmitting(false)
        if (res.error) {
          addToast({ kind: 'error', title: 'Lỗi', message: res.error })
        } else {
          setCurrentStep(4)
        }
      }).catch(err => {
        setIsSubmitting(false)
        addToast({ kind: 'error', title: 'Lỗi hệ thống', message: 'Không thể kết nối máy chủ' })
      })
    }
  }
  
  // Find current car
  const currentCar =
    availableCars.find((c) => c.name === selectedCarId) || availableCars[0]
  const isMotorbike = currentCar.product_type === 'motorbike'
  const currentSpecs = specsData[currentCar.name] || {}
  
  let variants = (
    isMotorbike
      ? currentCar.variants || []
      : Object.keys(currentSpecs.variants || {})
  ).sort((a: string, b: string) => {
    if (currentCar.name === 'VF 8') {
      if (a.toLowerCase().includes('plus')) return -1
      if (b.toLowerCase().includes('plus')) return 1
      return 0
    }
    if (a.toLowerCase().includes('plus')) return 1
    if (b.toLowerCase().includes('plus')) return -1
    return 0
  })
  
  if (!isMotorbike && currentCar.name === 'VF 3') {
    variants = ['Eco', 'Plus']
  } else if (!isMotorbike && currentCar.name === 'VF 2') {
    variants = ['Tiêu chuẩn']
  }
  const colors = currentCar.colors || []
  
  // Update default variant when car changes
  useEffect(() => {
    setSelectedPackages([])
    if (variants.length > 0) {
       setSelectedVariant(`${currentCar.name} ${variants[0]}`)
    }
    if (colors.length > 0) {
      setSelectedColor(colors[0].name)
    }
    setSelectedInteriorColor('') // Force reset interior color to trigger fallback
    if (currentCar.name.includes('MPV') && viewMode === 'interior') {
      setViewMode('exterior')
    }
  }, [selectedCarId, currentCar.name])

  let baseColors = isMotorbike ? colors : colors.slice(0, 4)
  let advancedColors = isMotorbike ? [] : colors.slice(4)

  if (!isMotorbike && currentCar.name === 'VF 2') {
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
  
  const allExterior = stringArray(currentCar.gallery?.exterior_images)
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
      interiorImages = Array.from(new Set(stringArray(currentCar.gallery?.interior_images)))
        .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
    }
  } else if (currentCar.name.includes('VF 8')) {
    const isAllNew = currentCar.name.includes('All-New')
    const code = selectedInteriorColor === 'Granite Black' ? 'CI11' : 'CI12'
    
    if (isAllNew) {
      interiorImages = [
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8-THE-ALL-NEW/interior/${code}/1.webp`
      ]
    } else {
      interiorImages = [
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/1.png`,
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/2.png`,
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/3.png`,
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/4.png`,
        `https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/${code}/5.png`
      ]
    }
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
        interiorImages = Array.from(new Set(stringArray(currentCar.gallery?.interior_images)))
          .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
      }
    }
  } else {
    interiorImages = Array.from(new Set(stringArray(currentCar.gallery?.interior_images)))
      .filter((img: string) => !img.includes('interior-2-2') && !img.includes('interior-2-3') && !img.includes('interior-2-4'))
  }

  const selectedVariantNameForDb = selectedVariant.replace(currentCar.name + ' ', '')
  const matchingDbVariant = dbVariants?.find((v: any) => 
    (v.product_name || '').includes(currentCar.name) && 
    (v.version || '').includes(selectedVariantNameForDb) && 
    v.color === selectedColor
  )

  const powetrain = currentSpecs.variants?.[variants[0]]?.specs?.powertrain || {}
  const dimension = currentSpecs.variants?.[variants[0]]?.specs?.dimension || {}
  
  let availableInteriorColors = isMotorbike
    ? []
    : [
    { name: 'Granite Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' },
    { name: 'Saddle Brown', hex: '#633517', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw65203801/images/deposit/interior/CI12.webp' },
    { name: 'Cotton Beige', hex: '#d6cdb4' },
    { name: 'Navy Blue', hex: '#1c2841' }
    ]

  if (!isMotorbike && currentCar.name === 'VF 2') {
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
  } else if (currentCar.name.includes('VF 8')) {
    availableInteriorColors = availableInteriorColors.slice(0, 2)
    const allowsSaddleBrown = [
      'Infinity Blanc', 
      'Starburst Blue', 
      'Jet Black', 
      'Starburst Blue Body - Infinity Blanc Roof', 
      'Jet Black Body - Stealth Gray Roof'
    ].includes(selectedColor)

    if (!allowsSaddleBrown) {
      availableInteriorColors = [availableInteriorColors[0]] // Only Granite Black
    }
  } else if (currentCar.name.includes('MPV')) {
    const black = { name: 'Black', hex: '#111111', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp' }
    const moccaBrown = { name: 'Mocca Brown', hex: '#6b4e31', swatch: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7e53f19e/images/deposit/interior/CI18.webp' }
    
    if (selectedColor === 'Solar Ruby' || selectedColor === 'Introspective Brown') {
      availableInteriorColors = [black]
    } else {
      availableInteriorColors = [black, moccaBrown]
    }
  }

  const interiorColorNames = JSON.stringify(availableInteriorColors.map(c => c.name))
  useEffect(() => {
    if (!selectedInteriorColor || !availableInteriorColors.some(c => c.name === selectedInteriorColor)) {
      if (availableInteriorColors.length > 0) {
        setSelectedInteriorColor(availableInteriorColors[0].name)
      }
    }
  }, [interiorColorNames, selectedInteriorColor])

  const maxPower =
    powetrain.maxPower || (isMotorbike ? 'Chưa cập nhật' : '201 hp/150 kW')
  const distance = isMotorbike
    ? String(powetrain.distance || '').match(/\d+(?:[.,]\d+)?/)?.[0] || 'N/A'
    : powetrain.distance?.split(' ')?.[0] || '480'
  const wheelbase =
    dimension.wheelbase || (isMotorbike ? 'Chưa cập nhật' : '2.730 mm')

  const activeColorHex = getColorHex(selectedColor)

  return (
    <div className="min-h-screen bg-white selection:bg-slate-900 selection:text-white">
      <ToastViewport toasts={toasts} onClose={id => setToasts(t => t.filter(x => x.id !== id))} />
      <Header />
      <div 
        className="flex flex-1 overflow-hidden flex-col lg:flex-row relative w-full pt-[74px]" 
        style={{ zoom: 0.8, height: 'calc((100vh) / 0.8)' }}
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
            <div className={`flex min-w-0 max-w-full flex-col items-center gap-3 md:items-start transition-all duration-300 ${currentStep > 1 ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* VEHICLE TYPE TOGGLE */}
              <div
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1.5 shadow-sm"
                aria-label="Chọn loại xe"
              >
                <button
                  type="button"
                  onClick={() => handleVehicleTypeChange('car')}
                  aria-pressed={vehicleType === 'car'}
                  className={`whitespace-nowrap rounded-full px-7 py-2.5 text-sm font-bold tracking-wide transition-all duration-300 ${
                    vehicleType === 'car'
                      ? 'scale-105 bg-slate-900 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Ô tô điện
                </button>
                <button
                  type="button"
                  onClick={() => handleVehicleTypeChange('motorbike')}
                  aria-pressed={vehicleType === 'motorbike'}
                  className={`whitespace-nowrap rounded-full px-7 py-2.5 text-sm font-bold tracking-wide transition-all duration-300 ${
                    vehicleType === 'motorbike'
                      ? 'scale-105 bg-slate-900 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Xe máy điện
                </button>
              </div>

              {/* VEHICLE SELECTOR */}
              <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1.5 backdrop-blur-md hide-scrollbar">
                {availableCars.map((car, idx) => {
                const allImages = [
                  ...(car.gallery?.exterior_images || []),
                  ...(car.gallery?.interior_images || []),
                  ...(car.gallery?.all_images || [])
                ]
                let logo = isMotorbike
                  ? undefined
                  : allImages.find(
                      (img: string) =>
                        img.toLowerCase().includes('logo') ||
                        img.toLowerCase().includes('icon') ||
                        img.toLowerCase().endsWith('.svg'),
                    )
                if (!isMotorbike && car.name.includes('All-New')) {
                  logo = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VF8-THE-ALL-NEW.svg'
                } else if (!isMotorbike && car.name.includes('MPV 7')) {
                  logo = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VFMPV7.svg'
                } else if (!isMotorbike && car.name === 'VF 6') {
                  logo = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VF6.svg'
                }
                const isSelected = selectedCarId === car.name

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedCarId(car.name)}
                    className={`px-6 py-2.5 rounded-full text-sm font-medium tracking-wider transition-all duration-300 whitespace-nowrap flex items-center justify-center min-w-[80px] h-10 ${
                      isSelected 
                        ? 'bg-slate-900 text-white shadow-lg scale-105' 
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 group'
                    }`}
                  >
                    {logo ? (
                      <img src={logo} alt={car.name} className={`object-contain ${car.name.includes('All-New') ? 'h-[14px]' : car.name.includes('MPV') ? 'h-[14px]' : 'h-4'} ${isSelected ? 'brightness-0 invert' : 'brightness-0 opacity-60 group-hover:opacity-100'}`} />
                    ) : (
                      car.name
                    )}
                  </button>
                )
                })}
              </div>
            </div>

            {/* VIEW TOGGLE */}
            {!isMotorbike && !currentCar.name.includes('MPV') && (
              <div className={`inline-flex items-center gap-2 bg-slate-50 backdrop-blur-xl p-1.5 rounded-full border border-slate-200 shadow-sm flex-shrink-0 transition-all duration-300 ${currentStep > 1 ? 'opacity-50 pointer-events-none' : ''}`}>
                <button 
                  onClick={() => setViewMode('exterior')}
                  className={`whitespace-nowrap px-8 py-2.5 rounded-full text-sm font-bold tracking-wider transition-all duration-300 ${viewMode === 'exterior' ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                >
                  Ngoại thất
                </button>
                <button 
                  onClick={() => setViewMode('interior')}
                  className={`whitespace-nowrap px-8 py-2.5 rounded-full text-sm font-bold tracking-wider transition-all duration-300 ${viewMode === 'interior' ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                >
                  Nội thất
                </button>
              </div>
            )}
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
                  className={`w-full h-auto object-contain drop-shadow-2xl ${
                    isMotorbike ? '' : 'mix-blend-screen'
                  }`}
                  style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.5))' }}
                />
              </div>

              {/* FLOATING SPECS - GLASSMORPHISM */}
              <div className="absolute top-1/4 left-12 bg-white/80 backdrop-blur-xl border border-slate-200 p-4 rounded-2xl shadow-xl hidden md:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '4s'}}>
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Zap size={14} /> Công suất
                </div>
                <div className="text-xl font-light text-slate-900">{maxPower}</div>
              </div>

              <div className="absolute bottom-1/3 right-12 bg-white/80 backdrop-blur-xl border border-slate-200 p-4 rounded-2xl shadow-xl hidden md:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '5s'}}>
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Battery size={14} /> Phạm vi
                </div>
                <div className="text-xl font-light text-slate-900">{distance} <span className="text-sm text-slate-500">km</span></div>
              </div>

              <div className="absolute top-1/3 right-20 bg-white/80 backdrop-blur-xl border border-slate-200 p-4 rounded-2xl shadow-xl hidden lg:flex flex-col gap-1 w-44 animate-bounce" style={{animationDuration: '6s'}}>
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Ruler size={14} /> Trục cơ sở
                </div>
                <div className="text-xl font-light text-slate-900">{wheelbase}</div>
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
            <h1 className="text-[5rem] font-black tracking-tighter text-slate-900/5 select-none uppercase absolute bottom-0 left-1/2 -translate-x-1/2 w-full text-center pointer-events-none">
              VINFAST {currentCar.name.replace(/vinfast/i, '').replace(/2026/g, '').trim()}
            </h1>
          </div>
        </div>

        {/* RIGHT COLUMN: PREMIUM CONFIGURATOR */}
        <div className="w-full lg:w-[540px] xl:w-[600px] bg-white text-slate-900 shadow-2xl z-20 flex flex-col relative rounded-t-[40px] lg:rounded-t-none lg:rounded-l-[40px] overflow-hidden">
          
          <div className="flex-1 overflow-y-auto hide-scrollbar p-8 pb-48">
            
            {/* MODERN STEPPER */}
            <div className="flex items-center gap-4 mb-10 mt-2">
               <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${currentStep >= 1 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>1</div>
                 {currentStep === 1 && <span className="font-bold tracking-wide text-sm uppercase text-slate-900 whitespace-nowrap shrink-0">Lựa chọn xe</span>}
               </div>
               <div className={`h-px flex-1 ${currentStep >= 2 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
               <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${currentStep >= 2 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>2</div>
                 {currentStep === 2 && <span className="font-bold tracking-wide text-sm uppercase text-slate-900 whitespace-nowrap shrink-0">Nhập thông tin</span>}
               </div>
               <div className={`h-px flex-1 ${currentStep >= 3 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
               <div className="flex items-center gap-3">
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${currentStep >= 3 ? 'bg-slate-900 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>3</div>
                 {currentStep === 3 && <span className="font-bold tracking-wide text-sm uppercase text-slate-900 whitespace-nowrap shrink-0">Đặt cọc xe</span>}
               </div>
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
                  {variants.map((v: string) => {
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
                  {baseColors.map((c: any, i: number) => {
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
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 block">Màu nâng cao <span className="text-blue-600 normal-case">{currentCar.name.includes('MPV') ? '+10.000.000đ' : (['VF 7', 'VF 9'].includes(currentCar.name) || currentCar.name.includes('VF 8') ? '+12.000.000đ' : '+8.000.000đ')}</span></span>
                  <div className="flex flex-wrap gap-5">
                    {advancedColors.map((c: any, i: number) => {
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
            {!isMotorbike && (
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
                        if (viewMode !== 'interior' && !currentCar.name.includes('MPV')) setViewMode('interior')
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
            )}
            </>
            )}
            
            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-2xl font-bold tracking-tight mb-8">Thông tin người đặt cọc</h3>
                
                <div className="space-y-6">
                  {/* Loại khách hàng */}
                  <div className="flex gap-6 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="customerType" 
                        value="personal" 
                        checked={customerType === 'personal'} 
                        onChange={() => setCustomerType('personal')}
                        className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                      />
                      <span className="text-sm font-semibold text-slate-700">Cá nhân</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="customerType" 
                        value="corporate" 
                        checked={customerType === 'corporate'} 
                        onChange={() => setCustomerType('corporate')}
                        className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                      />
                      <span className="text-sm font-semibold text-slate-700">Doanh nghiệp</span>
                    </label>
                  </div>

                  {customerType === 'corporate' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Tên doanh nghiệp <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="Nhập tên doanh nghiệp đầy đủ" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Họ và tên <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="Nhập họ và tên đầy đủ" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Số điện thoại <span className="text-red-500">*</span></label>
                    <input type="tel" placeholder="Nhập số điện thoại" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Email <span className="text-red-500">*</span></label>
                    <input type="email" placeholder="Nhập địa chỉ email" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>

                  {customerType === 'corporate' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Số đăng ký kinh doanh / Mã số thuế <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="Nhập số ĐKKD hoặc MST" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Số CCCD / CMND / Hộ chiếu <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="Nhập số giấy tờ tùy thân" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white" value={formData.idCard} onChange={e => setFormData({...formData, idCard: e.target.value})} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Tỉnh / Thành phố <span className="text-red-500">*</span></label>
                      <SearchableLocationSelect
                        label=""
                        options={provinces}
                        value={formData.province}
                        onChange={(val) => {
                          setProvinceCode(val?.code || null)
                          setFormData({ ...formData, province: val?.name || '', district: '' })
                        }}
                        placeholder="Chọn Tỉnh/Thành"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Quận / Huyện <span className="text-red-500">*</span></label>
                      <SearchableLocationSelect
                        label=""
                        options={districts}
                        value={formData.district}
                        onChange={(val) => setFormData({ ...formData, district: val?.name || '' })}
                        placeholder="Chọn Quận/Huyện"
                        disabled={!formData.province}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-4">
                    <label className="text-sm font-semibold text-slate-700">Showroom nhận xe <span className="text-red-500">*</span></label>
                    <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 font-medium">
                      VinFast Landmark 81, TP. Hồ Chí Minh
                    </div>
                  </div>

                  <div className="space-y-2 pt-4">
                    <label className="text-sm font-semibold text-slate-700">Mã ưu đãi / E-voucher</label>
                    <div className="flex gap-3">
                      <input type="text" placeholder="Nhập mã ưu đãi" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white uppercase" />
                      <button className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap">
                        Áp dụng
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex justify-between items-center border-b border-slate-200 pb-4 mb-6">
                  <h3 className="text-xl font-bold tracking-tight text-slate-800">Thông tin đơn hàng</h3>
                  <svg className="w-5 h-5 text-slate-500 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <div className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-4">THÔNG TIN XE</div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="font-semibold text-slate-800">{selectedVariant}</span>
                      <span className="font-semibold text-slate-800 text-right">
                        {(() => {
                           const selectedVariantName = selectedVariant.replace(currentCar.name + ' ', '')
                           const variantData = currentSpecs.variants?.[selectedVariantName]
                           const basePrice = variantData?.price || currentCar.displayed_price || 0
                           return basePrice > 0 ? new Intl.NumberFormat('vi-VN').format(basePrice) : 'Liên hệ'
                        })()}
                      </span>
                    </div>
                    {!isMotorbike && <div className="text-slate-600 mb-4">Kèm pin</div>}
                    
                    <div className="flex justify-between items-center py-3 border-t border-slate-100">
                      <span className="text-slate-600">Ngoại thất</span>
                      <span className="font-medium text-slate-800">{selectedColor}</span>
                    </div>
                    {!isMotorbike && (
                      <div className="flex justify-between items-center py-3 border-t border-slate-100">
                        <span className="text-slate-600">Nội thất</span>
                        <span className="font-medium text-slate-800">{selectedInteriorColor}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <div className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-4">THÔNG TIN CHỦ XE</div>
                    
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">Chủ xe</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">
                        {customerType === 'corporate' ? formData.companyName || '-------------' : formData.name || '-------------'}
                      </div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">Email</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">{formData.email || '-------------'}</div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">Số điện thoại</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">{formData.phone || '-------------'}</div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">{customerType === 'corporate' ? 'Số ĐKKD/MST' : 'Số CCCD'}</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">{formData.idCard || '-------------'}</div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200 mt-4">
                      <span className="text-slate-600 w-1/3">Showroom nhận xe</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">VinFast Landmark 81</div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">Nhân viên tư vấn</span>
                      <div className="flex-1 text-right font-medium text-slate-800"></div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <div className="text-lg font-semibold text-slate-400 mb-6">Hình thức thanh toán</div>
                    
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="paymentMethod" checked={paymentMethod === 'credit_card'} onChange={() => setPaymentMethod('credit_card')} className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="text-slate-600">Thẻ thanh toán quốc tế</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="paymentMethod" checked={paymentMethod === 'atm'} onChange={() => setPaymentMethod('atm')} className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="text-slate-600">Thẻ ATM nội địa/ Internet Banking</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="paymentMethod" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} className="w-4 h-4 text-slate-900 focus:ring-slate-900" />
                        <span className="text-slate-600">Chuyển khoản ngân hàng</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-6">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="w-4 h-4 mt-1 text-slate-900 focus:ring-slate-900" />
                      <span className="text-sm text-slate-600 leading-relaxed">
                        Tôi xác nhận rằng tôi đã đọc, hiểu và đồng ý với các 
                        <a href="#" className="text-blue-600 hover:underline mx-1">Điều kiện & Điều khoản</a>
                        của VinFast.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 4 && (
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
                    <span className="font-bold text-blue-600">
                      {new Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(
                        matchingDbVariant?.deposit_amount ||
                        currentCar.deposit_value ||
                        (isMotorbike ? 2_000_000 : 10_000_000),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
          </div>

           {/* BOTTOM CHECKOUT BAR */}
           <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 sm:p-6 z-30">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                {currentStep < 4 ? (
                 <>
                   <div>
                     <div className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 whitespace-nowrap">Tổng dự tính</div>
                     <div className="text-lg sm:text-xl font-black text-slate-900 whitespace-nowrap">
                       {(() => {
                          const selectedVariantName = selectedVariant.replace(currentCar.name + ' ', '')
                          const variantData = currentSpecs.variants?.[selectedVariantName]
                          const basePrice = variantData?.price || currentCar.displayed_price || 0
                          
                          const isAdvancedColor = advancedColors.some((c: any) => c.name === selectedColor)
                          const colorPrice = isAdvancedColor ? (currentCar.name.includes('MPV') ? 10000000 : (['VF 7', 'VF 9'].includes(currentCar.name) || currentCar.name.includes('VF 8') ? 12000000 : 8000000)) : 0
                          
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
                   
                   <div className="flex gap-2 sm:gap-3 shrink-0">
                     {currentStep > 1 && (
                       <button 
                         onClick={() => setCurrentStep(currentStep - 1)}
                         className="flex items-center justify-center bg-slate-100 text-slate-600 px-3 sm:px-6 py-3 sm:py-4 rounded-full font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 hover:bg-slate-200 transition-all active:scale-95"
                       >
                         Quay lại
                       </button>
                     )}
                     <button 
                       onClick={handleNextStep}
                       disabled={isSubmitting}
                       className={`flex items-center justify-center gap-1 sm:gap-2 bg-slate-900 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-full font-bold text-xs sm:text-sm tracking-wide sm:tracking-widest whitespace-nowrap shrink-0 transition-all uppercase ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-800 hover:gap-3 hover:shadow-xl active:scale-95'}`}
                     >
                       {isSubmitting ? 'Đang xử lý...' : (currentStep === 1 || currentStep === 2 ? 'Tiếp tục' : 'Thanh toán đặt cọc')} {!isSubmitting && <ArrowRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
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
  const normalized = name.toLocaleLowerCase('vi')
  if (normalized.includes('đỏ')) return '#B5122B'
  if (normalized.includes('trắng')) return '#F4F4F2'
  if (normalized.includes('đen')) return '#171717'
  if (normalized.includes('xám')) return '#73777A'
  if (normalized.includes('bạc')) return '#C0C0C0'
  if (normalized.includes('vàng')) return '#D9A514'
  if (normalized.includes('cam')) return '#E96324'
  if (normalized.includes('tím')) return '#34304F'
  if (normalized.includes('xanh rêu') || normalized.includes('oliu')) {
    return '#65705A'
  }
  if (normalized.includes('xanh')) return '#496D78'

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
