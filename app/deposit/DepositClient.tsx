'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Header } from '../../components/header'
import { Check, Battery, Zap, Ruler, ArrowRight, ChevronDown } from 'lucide-react'
import { ToastMessage, ToastViewport } from '../../components/ui/toast'
import {
  OutOfStockVariantDialog,
  type OutOfStockVariantNotice,
} from '../../components/out-of-stock-variant-dialog'
import { SearchableLocationSelect } from '../../components/ui/searchable-location-select'
import {
  findDepositVehicle,
  type DepositVehicleType,
} from '../../lib/deposit-vehicles'
import {
  validateDepositCustomerDetails,
  type DepositCustomerField,
} from '../../lib/deposit/order-input'
import {
  DEPOSIT_DRAFT_VERSION,
  type DepositDraft,
  type StoredDepositDraft,
} from '../../lib/deposit/draft'
import {
  matchesDepositVehicleVariant,
  vehicleSelectionKey,
} from '../../lib/deposit/vehicle-variant'

type LocationOption = { code: number; name: string }
type DepositQuote = {
  depositAmount: number
  subtotal: number
  discountAmount: number
  totalEstimatedPrice: number
  promotion: { id: string; code: string; name: string } | null
}

function getVehicleVariantName(vehicleName: string, version: string): string {
  return vehicleSelectionKey(version).startsWith(vehicleSelectionKey(vehicleName))
    ? version
    : `${vehicleName} ${version}`
}

const DEPOSIT_STEPS = [
  { number: 1, label: 'Lựa chọn xe' },
  { number: 2, label: 'Nhập thông tin' },
  { number: 3, label: 'Thanh toán' },
] as const

function DepositStepper({ currentStep }: { currentStep: number }) {
  const [isExploring, setIsExploring] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const visibleSteps = DEPOSIT_STEPS

  return (
    <div className="-mx-8 mb-10 mt-2 overflow-hidden px-8">
      <motion.ol
        layout
        aria-label={`Tiến trình đặt cọc, bước ${currentStep} trên 3`}
        className="flex h-14 w-full items-stretch gap-1.5"
        onHoverStart={() => setIsExploring(true)}
        onHoverEnd={() => setIsExploring(false)}
      >
        <AnimatePresence mode="popLayout">
          {visibleSteps.map((step, index) => {
            const isCurrent = step.number === currentStep
            const isCompleted = step.number < currentStep
            const showFullLabel = isCurrent || isExploring

            return (
              <motion.li
                layout
                key={step.number}
                aria-current={isCurrent ? 'step' : undefined}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -120, scaleX: 0.82 }
                }
                animate={{
                  opacity: 1,
                  x: 0,
                  scaleX: 1,
                  flexGrow: showFullLabel ? 1 : 0,
                  flexBasis: showFullLabel ? 0 : 52,
                }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -180, scaleX: 0.72 }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0.01 }
                    : {
                        layout: {
                          duration: 0.38,
                          ease: [0.16, 1, 0.3, 1],
                        },
                        opacity: { duration: 0.18 },
                        x: {
                          duration: 0.34,
                          ease: [0.7, 0, 0.2, 1],
                        },
                        scaleX: {
                          duration: 0.3,
                          ease: [0.7, 0, 0.2, 1],
                        },
                        flexGrow: {
                          duration: 0.38,
                          ease: [0.16, 1, 0.3, 1],
                        },
                        flexBasis: {
                          duration: 0.38,
                          ease: [0.16, 1, 0.3, 1],
                        },
                      }
                }
                className={`relative min-w-[52px] origin-left overflow-hidden ${
                  isCurrent
                    ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.2)]'
                    : isCompleted
                      ? 'bg-brand-100 text-brand-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
                style={{
                  clipPath:
                    index === 0
                      ? 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)'
                      : 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)',
                }}
              >
                <div
                  className={`flex h-full items-center gap-2.5 ${
                    index === 0 ? 'pl-3' : 'pl-5'
                  } pr-6`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      isCurrent
                        ? 'bg-white text-slate-950'
                        : isCompleted
                          ? 'border border-brand-300 bg-brand-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-500'
                    }`}
                  >
                    {step.number}
                  </span>

                  <AnimatePresence initial={false}>
                    {showFullLabel && (
                      <motion.span
                        initial={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, x: -8 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0.01 }
                            : {
                                duration: 0.22,
                                ease: [0.16, 1, 0.3, 1],
                              }
                        }
                        className={`truncate text-[11px] font-extrabold uppercase tracking-[0.08em] sm:text-xs ${
                          !isCurrent ? 'hidden sm:block' : ''
                        }`}
                      >
                        {step.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!showFullLabel && (
                    <span className="sr-only">{step.label}</span>
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </motion.ol>
    </div>
  )
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

const normalizeWard = (name: string) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^(phường|xã|thị trấn|thị xã|quận|huyện|thành phố|thị tứ|phố|ấp|thôn|bản)\s+/i, '')
    .replace(/\s+/g, '')
    .trim();
};

const findMatchingWard = (showroom: any, locationWards: LocationOption[]) => {
  if (!locationWards || locationWards.length === 0) return null;
  
  const normDistrict = normalizeWard(showroom.district_name || '');
  const addressNorm = showroom.address ? showroom.address.toLowerCase() : '';
  
  // 1. Try exact normalized match on district_name
  if (normDistrict) {
    const exactMatch = locationWards.find(w => normalizeWard(w.name) === normDistrict);
    if (exactMatch) return exactMatch.name;
  }
  
  // 2. Try matching ward names inside s.address
  const sortedWards = [...locationWards].sort((a, b) => b.name.length - a.name.length);
  for (const w of sortedWards) {
    const normW = normalizeWard(w.name);
    if (!normW) continue;
    if (addressNorm.includes(normW) || normalizeWard(showroom.address || '').includes(normW)) {
      return w.name;
    }
  }
  
  // 3. Fallback to raw substring match
  for (const w of sortedWards) {
    if (showroom.address && showroom.address.includes(w.name)) {
      return w.name;
    }
    if (showroom.district_name && showroom.district_name.includes(w.name)) {
      return w.name;
    }
  }
  
  return null;
};
export function DepositClient({
  carsData,
  motorbikesData,
  specsData,
  initialCar,
  initialReturnTo,
  initialVehicleType,
}: {
  carsData: any[]
  motorbikesData: any[]
  specsData: any
  initialCar?: string
  initialReturnTo?: string
  initialVehicleType: DepositVehicleType
}) {
  const initialVehicles =
    initialVehicleType === 'motorbike' ? motorbikesData : carsData
  const matchedInitialVehicle = findDepositVehicle(initialVehicles, initialCar)
  const defaultCar =
    matchedInitialVehicle?.name ||
    (initialVehicleType === 'motorbike'
      ? motorbikesData[0]?.name
      : carsData.find((car) => car.name === 'VF 3')?.name || carsData[0]?.name)
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
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const [customerType, setCustomerType] = useState<'personal' | 'corporate'>('personal')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    idCard: '',
    taxId: '',
    companyName: '',
    province: '',
    ward: '',
  })
  const activeIdentityNumber = customerType === 'corporate' ? formData.taxId : formData.idCard
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [wards, setWards] = useState<LocationOption[]>([])
  const [provinceCode, setProvinceCode] = useState('')
  const [wardCode, setWardCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<DepositCustomerField, string>>
  >({})
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [wardsLoading, setWardsLoading] = useState(false)
  const [autoOpenWard, setAutoOpenWard] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [promotionCode, setPromotionCode] = useState('')
  const [promotionQuote, setPromotionQuote] = useState<DepositQuote | null>(null)
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: string
    depositAmount: number
    totalEstimatedPrice: number
    subtotal: number
    discountAmount: number
    promotionCode: string | null
    createdAt: string
    status: string
  } | null>(null)
  const depositIdempotencyKey = useRef<string | null>(null)
  const pendingDraftSelectionRef = useRef<Pick<DepositDraft,
    'selectedCarId' | 'selectedVariant' | 'selectedColor' |
    'selectedInteriorColor' | 'selectedPackages'
  > | null>(null)
  const initializedCarColorRef = useRef<string | null>(null)
  const pendingDraftShowroomIdRef = useRef<string | null>(null)
  const latestDraftRef = useRef<DepositDraft | null>(null)
  const draftSavingStoppedRef = useRef(false)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftEnabled, setDraftEnabled] = useState(true)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const shouldReduceMotion = useReducedMotion()

  const [showrooms, setShowrooms] = useState<any[]>([])
  const [selectedShowroom, setSelectedShowroom] = useState<any>(null)
  const [openShowroom, setOpenShowroom] = useState(false)
  const [dbVariants, setDbVariants] = useState<any[]>([])
  const [dbVariantsLoading, setDbVariantsLoading] = useState(false)
  const [dbVariantsLoaded, setDbVariantsLoaded] = useState(false)
  const [dbVariantsSourceKey, setDbVariantsSourceKey] = useState<string | null>(null)
  const [applyingPromotion, setApplyingPromotion] = useState(false)
  const [promotionSuccess, setPromotionSuccess] = useState<string | null>(null)
  const [outOfStockNotice, setOutOfStockNotice] = useState<OutOfStockVariantNotice | null>(null)

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }

  const clearFieldError = (field: DepositCustomerField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }
  const validateCustomerField = (field: DepositCustomerField) => {
    const errors = validateDepositCustomerDetails({
      customerType,
      fullName: formData.name,
      companyName: formData.companyName,
      phoneNumber: formData.phone,
      email: formData.email,
      idCardNumber: activeIdentityNumber,
      provinceCode,
      wardCode,
    })
    setFieldErrors((current) => {
      const next = { ...current }
      if (errors[field]) next[field] = errors[field]
      else delete next[field]
      return next
    })
  }
  const inputClass = (field: DepositCustomerField) =>
    `w-full rounded-xl border px-4 py-3 transition-all focus:bg-white focus:outline-none focus:ring-1 ${
      fieldErrors[field]
        ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500'
        : 'border-slate-200 bg-slate-50 focus:border-slate-900 focus:ring-slate-900'
    }`

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/v1/deposit/draft', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 401) {
          setDraftEnabled(false)
          return null
        }
        if (!response.ok) throw new Error('Không thể tải bản nháp đặt cọc.')
        const payload = await response.json()
        return (payload.data ?? null) as StoredDepositDraft | null
      })
      .then((draft) => {
        if (!draft || controller.signal.aborted) return

        const restoreVehicleSelection =
          !initialCar || draft.selectedCarId === defaultCar
        if (restoreVehicleSelection) {
          pendingDraftSelectionRef.current = {
            selectedCarId: draft.selectedCarId,
            selectedVariant: draft.selectedVariant,
            selectedColor: draft.selectedColor,
            selectedInteriorColor: draft.selectedInteriorColor,
            selectedPackages: draft.selectedPackages,
          }
          setVehicleType(draft.vehicleType)
          setSelectedCarId(draft.selectedCarId)
          setCurrentStep(draft.currentStep)
        }

        setCustomerType(draft.customerType)
        setFormData(draft.formData)
        setProvinceCode(draft.provinceCode)
        setWardCode(draft.wardCode)
        pendingDraftShowroomIdRef.current = draft.selectedShowroomId
        setPromotionCode(draft.promotionCode)
        // Legal consent is deliberately never restored from a draft.
        setTermsAccepted(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setDraftEnabled(false)
        console.warn(error instanceof Error ? error.message : 'Không thể tải bản nháp đặt cọc.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftHydrated(true)
      })

    return () => controller.abort()
  }, [defaultCar, initialCar])

  useEffect(() => {
    const controller = new AbortController()
    setLocationsLoading(true)
    fetch('/api/v1/locations', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải tỉnh/thành phố.')
        setProvinces(payload.data ?? [])
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocationError(error instanceof Error ? error.message : 'Không thể tải tỉnh/thành phố.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoading(false)
      })

    // Dữ liệu showroom phụ thuộc loại xe đang đặt cọc. Giữ nguyên bộ lọc
    // tỉnh/phường hiện tại; chỉ thay nguồn showroom tương ứng với loại xe.
    const showroomDataPath = vehicleType === 'motorbike'
      ? '/data/showroomescooter.json'
      : '/data/showroomcar.json'
    fetch(showroomDataPath)
      .then(res => res.json())
      .then(data => {
        if (data && data.data) {
          setShowrooms(data.data)
        }
      })
      .catch(console.error)

    return () => controller.abort()
  }, [vehicleType])

  useEffect(() => {
    const controller = new AbortController()

    async function fetchVariants() {
      setDbVariants([])
      setDbVariantsLoaded(false)
      setDbVariantsSourceKey(null)
      setDbVariantsLoading(true)
      let sourceKey: string | null = null
      try {
        const vehicles = vehicleType === 'motorbike' ? motorbikesData : carsData
        const currentCarObj = vehicles.find(c => c.name === selectedCarId) || vehicles[0]
        if (!currentCarObj) {
          setDbVariants([])
          return
        }
        sourceKey = `${vehicleType}:${currentCarObj.product_id || currentCarObj.name}`
        const query = currentCarObj.product_id
          ? `product_id=${encodeURIComponent(currentCarObj.product_id)}`
          : `product_name=${encodeURIComponent(currentCarObj.name)}`
        const res = await fetch(`/api/v1/vehicle-variants?${query}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Không thể tải biến thể xe.')
        const data = await res.json()
        if (!controller.signal.aborted) {
          setDbVariants(Array.isArray(data) ? data : [])
          setDbVariantsSourceKey(sourceKey)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error(err)
        setDbVariants([])
        setDbVariantsSourceKey(sourceKey)
      } finally {
        if (!controller.signal.aborted) {
          setDbVariantsLoading(false)
          setDbVariantsLoaded(true)
        }
      }
    }
    fetchVariants()
    return () => controller.abort()
  }, [selectedCarId, vehicleType, carsData, motorbikesData])

  useEffect(() => {
    if (!provinceCode) {
      setWards([])
      setWardCode('')
      return
    }

    const controller = new AbortController()
    setWardsLoading(true)
    setLocationError(null)
    fetch(`/api/v1/locations?provinceCode=${provinceCode}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải xã/phường.')
        const fetchedWards = payload.data ?? []
        setWards(fetchedWards)
        if (selectedShowroom) {
          const matchedWard = findMatchingWard(selectedShowroom, fetchedWards)
          if (matchedWard) {
            const foundWardObj = fetchedWards.find((w: any) => w.name === matchedWard)
            if (foundWardObj) {
              setWardCode(String(foundWardObj.code))
              setFormData(prev => ({ ...prev, ward: matchedWard }))
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLocationError(error instanceof Error ? error.message : 'Không thể tải xã/phường.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWardsLoading(false)
      })
    return () => controller.abort()
  }, [provinceCode])

  // A province change may auto-select a showroom after the ward request has
  // already completed. Reconcile the showroom address with the ward list in
  // that case, so the user is never left with a showroom from one ward and an
  // empty/incompatible ward field.
  useEffect(() => {
    if (!selectedShowroom || wards.length === 0) return
    const matchedWard = findMatchingWard(selectedShowroom, wards)
    if (!matchedWard) return
    const ward = wards.find((item: any) => item.name === matchedWard)
    if (!ward || wardCode === String(ward.code)) return
    setWardCode(String(ward.code))
    setFormData((prev) => ({ ...prev, ward: matchedWard }))
  }, [selectedShowroom, wards, wardCode])

  const filteredShowrooms = showrooms
    .filter(s => {
      if (!formData.province) return false;
      
      const normalize = (str: string) => {
         if (!str) return '';
         return str
           .normalize('NFD')
           .replace(/[\u0300-\u036f]/g, '')
           .toLowerCase()
           .replace(/đ/g, 'd')
           .replace(/^(tỉnh|thành phố|tp|quận|huyện|thị xã|phường|xã|thị trấn)\s+/i, '')
           .replace(/\s+/g, '')
           .trim();
      }
      
      const provName = normalize(s.province_name);
      const addrName = normalize(s.address);
      const formProv = normalize(formData.province);
      
      return provName.includes(formProv) || formProv.includes(provName) || addrName.includes(formProv);
    })
    .filter(s => {
      if (!formData.ward) return true;
      const normalize = (str: string) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/^(tỉnh|thành phố|tp|quận|huyện|thị xã|phường|xã|thị trấn)\s+/i, '').replace(/\s+/g, '').trim() : '';
      const formWard = normalize(formData.ward);
      if (!formWard) return true;
      return normalize(s.district_name).includes(formWard) || formWard.includes(normalize(s.district_name)) || normalize(s.address).includes(formWard) || normalize(s.name).includes(formWard);
    });

  useEffect(() => {
    if (!formData.province) {
      setSelectedShowroom(null)
      return
    }
    if (filteredShowrooms.length > 0) {
      const pendingShowroomId = pendingDraftShowroomIdRef.current
      const restoredShowroom = pendingShowroomId
        ? filteredShowrooms.find((showroom) =>
            String(showroom.entity_id ?? showroom.id ?? '') === pendingShowroomId,
          )
        : null
      if (restoredShowroom) {
        pendingDraftShowroomIdRef.current = null
        setSelectedShowroom(restoredShowroom)
        return
      }
      if (!selectedShowroom || !filteredShowrooms.some(s => s.entity_id === selectedShowroom.entity_id)) {
        setSelectedShowroom(filteredShowrooms[0])
      }
    } else {
      setSelectedShowroom(null)
    }
  }, [filteredShowrooms, formData.province, formData.ward, selectedShowroom])
  const goToStep = (nextStep: number) => {
    if (nextStep < 3) depositIdempotencyKey.current = null
    setStepDirection(nextStep >= currentStep ? 1 : -1)
    setCurrentStep(nextStep)
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
              if (name.includes('VF 3')) return 1
              if (name.includes('VF 5')) return 2
              if (name.includes('VF 6')) return 3
              if (name.includes('VF 7')) return 4
              if (name.includes('MPV 7')) return 5
              if (name.includes('VF 8')) return 6
              if (name.includes('VF 9')) return 7
              return 100
            }
            const orderA = getOrder(a.name)
            const orderB = getOrder(b.name)
            if (orderA !== orderB) return orderA - orderB
            return a.name.length - b.name.length
          })

  const getDepositAmount = () => {
    const selectedVariantName = selectedVariant.replace(currentCar.name + ' ', '')
    const matchingDbVariant = effectiveDbVariants.find((v: any) => v.version === selectedVariantName && v.color === selectedColor)
      || effectiveDbVariants.find((v: any) => v.version === selectedVariantName)

    if (matchingDbVariant && matchingDbVariant.deposit_amount) {
      return Number(matchingDbVariant.deposit_amount)
    }

    if (currentCar.deposit_value) {
      const depVal = Number(currentCar.deposit_value)
      if (depVal > 0) return depVal
    }

    if (currentCar.deposit) {
      const depVal = parseInt(currentCar.deposit.toString().replace(/[^0-9]/g, ''), 10)
      if (!isNaN(depVal) && depVal > 0) return depVal
    }

    if (vehicleType === 'motorbike') return 2000000

    const carName = (currentCar.name || '').toUpperCase()
    if (carName.includes('VF 7') || carName.includes('VF 9')) return 50000000
    if (carName.includes('VF 6') || carName.includes('VF 8')) return 30000000
    return 15000000
  }

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
    setPromotionQuote(null)
    setPromotionError(null)
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

  const handleApplyPromotion = async (): Promise<boolean> => {
    const normalizedCode = promotionCode.trim().toUpperCase()
    if (!normalizedCode) return false
    setApplyingPromotion(true)
    setPromotionError(null)
    setPromotionSuccess(null)

    try {
      const currentVehicle =
        availableCars.find((vehicle) => vehicle.name === selectedCarId) ||
        availableCars[0]
      const response = await fetch('/api/deposit/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type:
            currentVehicle.product_type === 'motorbike' ? 'motorbike' : 'car',
          car_model: currentVehicle.name,
          car_variant: selectedVariant,
          exterior_color: selectedColor,
          interior_color:
            currentVehicle.product_type === 'motorbike'
              ? ''
              : selectedInteriorColor,
          optional_packages: selectedPackages,
          promotion_code: normalizedCode,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.data?.promotion) {
        throw new Error(
          result?.error?.message || 'Mã giảm giá không áp dụng cho cấu hình xe này.',
        )
      }

      setPromotionCode(result.data.promotion.code)
      setPromotionQuote(result.data as DepositQuote)
      setPromotionSuccess('Mã ưu đãi đã được áp dụng vào đơn đặt cọc.')
      addToast({ kind: 'success', title: 'Áp dụng mã ưu đãi thành công' })
      return true
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Mã giảm giá không hợp lệ.'
      setPromotionError(message)
      setPromotionQuote(null)
      // An invalid code must never remain attached to the draft/order. Clear
      // the field so the customer can continue without a promotion.
      setPromotionCode('')
      addToast({ kind: 'error', title: 'Không thể áp dụng mã ưu đãi', message })
      return false
    } finally {
      setApplyingPromotion(false)
    }
  }

  const handleNextStep = async () => {
    if (currentStep === 1) {
      const selectedVariantName = selectedVariant.replace(`${currentCar.name} `, '')
      const exactInventoryRow = dbVariants.find((variant) =>
        matchesDepositVehicleVariant(variant, {
          vehicleVariant: selectedVariant,
          exteriorColor: selectedColor,
          interiorColor: selectedInteriorColor || undefined,
        }),
      )
      if (dbVariantsLoading) {
        addToast({ kind: 'warning', title: 'Đang kiểm tra tồn kho', message: 'Vui lòng chờ hệ thống kiểm tra cấu hình xe.' })
        return
      }
      if (!exactInventoryRow?.product_variant_id || Number(exactInventoryRow.inventory?.on_hand_quantity ?? 0) <= 0) {
        const selectedVehicle = availableCars.find((vehicle) => vehicle.name === selectedCarId) || availableCars[0]
        const fallbackDetailHref = selectedVehicle?.product_type === 'motorbike' && selectedVehicle?.slug
          ? `/bikes/${encodeURIComponent(selectedVehicle.slug)}`
          : typeof selectedVehicle?.url === 'string' && selectedVehicle.url.startsWith('/') && !selectedVehicle.url.startsWith('//')
            ? selectedVehicle.url
            : initialReturnTo || '/cars'
        setOutOfStockNotice({
          productType: vehicleType === 'motorbike' ? 'motorbike' : 'car',
          productName: selectedVehicle?.name || selectedCarId,
          versionName: selectedVariantName || selectedVariant,
          colorName: selectedColor || 'Màu chưa chọn',
          returnHref: fallbackDetailHref,
        })
        return
      }
      goToStep(2)
    } else if (currentStep === 2) {
      const errors = validateDepositCustomerDetails({
        customerType,
        fullName: formData.name,
        companyName: formData.companyName,
        phoneNumber: formData.phone,
        email: formData.email,
        idCardNumber: activeIdentityNumber,
        provinceCode,
        wardCode,
      })
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0 || !formData.province || !formData.ward) {
        addToast({
          kind: 'warning',
          title: 'Thông tin chưa hợp lệ',
          message: Object.values(errors)[0] || 'Vui lòng chọn Tỉnh/Thành phố và Xã/Phường.',
        })
        return
      }
      if (!selectedShowroom) {
        addToast({
          kind: 'warning',
          title: 'Chưa chọn showroom',
          message: 'Vui lòng chọn showroom nhận xe trước khi tiếp tục.',
        })
        return
      }
      if (promotionCode.trim() && !promotionQuote) {
        await handleApplyPromotion()
      }
      goToStep(3)
    } else if (currentStep === 3) {
      if (!Number.isFinite(displayedTotal) || displayedTotal <= 0) {
        addToast({
          kind: 'error',
          title: 'Chưa thể thanh toán đặt cọc',
          message: 'Phiên bản xe đang chọn chưa có giá bán hợp lệ. Vui lòng chọn lại phiên bản hoặc liên hệ tư vấn.',
        })
        return
      }
      if (!termsAccepted) {
        addToast({ kind: 'warning', title: 'Vui lòng xác nhận đồng ý với các Điều kiện & Điều khoản' });
        return;
      }

      setIsSubmitting(true)

      const currentCarObj =
        availableCars.find((c) => c.name === selectedCarId) || availableCars[0]

      if (!depositIdempotencyKey.current) {
        depositIdempotencyKey.current = crypto.randomUUID()
      }

      try {
        const response = await fetch('/api/deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': depositIdempotencyKey.current,
          },
          body: JSON.stringify({
            customer_type: customerType,
            full_name: formData.name,
            company_name: formData.companyName,
            phone_number: formData.phone,
            email: formData.email,
            id_card_number: activeIdentityNumber,
            province: formData.province,
            province_code: provinceCode,
            ward: formData.ward,
            ward_code: wardCode,
            vehicle_type: currentCarObj.product_type === 'motorbike' ? 'motorbike' : 'car',
            car_model: currentCarObj.name,
            car_variant: selectedVariant,
            exterior_color: selectedColor,
            interior_color: selectedInteriorColor || null,
            optional_packages: selectedPackages,
            promotion_code: promotionQuote?.promotion?.code ?? null,
            payment_method: 'atm',
            terms_accepted: termsAccepted,
            showroom: selectedShowroom?.name || '',
          }),
        })
        const result = await response.json().catch(() => null)

        if (!response.ok || !result?.data?.paymentUrl) {
          addToast({
            kind: 'error',
            title: 'Không thể tạo đơn đặt cọc',
            message: result?.error?.message || 'Vui lòng thử lại sau.',
          })
          return
        }

        draftSavingStoppedRef.current = true
        latestDraftRef.current = null
        await fetch('/api/v1/deposit/draft', {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => undefined)
        window.location.assign(result.data.paymentUrl)
      } catch {
        addToast({
          kind: 'error',
          title: 'Lỗi kết nối',
          message: 'Không thể kết nối máy chủ. Bạn có thể thử gửi lại mà không tạo trùng đơn.',
        })
      } finally {
        setIsSubmitting(false)
      }
    }
  }
  
  // Find current car
  const currentCar =
    availableCars.find((c) => c.name === selectedCarId) || availableCars[0]
  const isMotorbike = currentCar.product_type === 'motorbike'
  const currentSpecs = specsData[currentCar.name] || {}
  
  const expectedDbVariantsSourceKey =
    `${vehicleType}:${currentCar.product_id || currentCar.name}`
  const hasCurrentDbVariants =
    dbVariantsLoaded && dbVariantsSourceKey === expectedDbVariantsSourceKey
  const effectiveDbVariants = hasCurrentDbVariants ? dbVariants : []
  
  const activeDbVersions = Array.from(new Set(
    effectiveDbVariants
      .filter((v: any) => v.is_active && v.version)
      .map((v: any) => v.version)
  ))

  const variants = (hasCurrentDbVariants ? activeDbVersions as string[] : []).sort((a: string, b: string) => {
    if (currentCar.name === 'VF 8') {
      if (a.toLowerCase().includes('plus')) return -1
      if (b.toLowerCase().includes('plus')) return 1
      return 0
    }
    if (a.toLowerCase().includes('plus')) return 1
    if (b.toLowerCase().includes('plus')) return -1
    return 0
  })
  const selectedVariantName = variants.find((variant) =>
    selectedVariant === getVehicleVariantName(currentCar.name, variant),
  ) || ''
  const selectedVersionRows = effectiveDbVariants.filter((variant: any) =>
    variant.is_active && variant.version === selectedVariantName,
  )
  const canonicalColorRows = selectedVersionRows.length > 0
    ? selectedVersionRows
    : effectiveDbVariants
  const variantColors = Array.from(new Map(canonicalColorRows
    .filter((variant: any) => variant.color)
    .map((variant: any) => [variant.color, {
      name: variant.color,
      image: variant.image_car_url,
      swatch: variant.image_color_url,
      type: variant.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
      priceAdjustment: Number(variant.color_price_adjustment || 0),
    }])).values())
    .sort((a: any, b: any) => {
      const tier = Number(a.type === 'ADVANCED') - Number(b.type === 'ADVANCED')
      return tier || a.name.localeCompare(b.name, 'vi')
    })
  const colors = variantColors.length > 0 ? variantColors : currentCar.colors || []
  const variantSelectionKey = variants.join('|')
  const colorSelectionKey = colors.map((color: any) => color.name).join('|')
  const variantsPending = dbVariantsLoading || !hasCurrentDbVariants
  
  // Update default variant when car changes
  useEffect(() => {
    setSelectedPackages([])
    setSelectedVariant('')
    if (colors.length > 0) {
      setSelectedColor(colors[0].name)
    }
    setSelectedInteriorColor('') // Force reset interior color to trigger fallback
    if (currentCar.name.includes('MPV') && viewMode === 'interior') {
      setViewMode('exterior')
    }
  }, [selectedCarId, currentCar.name])

  useEffect(() => {
    if (!hasCurrentDbVariants || dbVariantsLoading || variants.length === 0) return
    setSelectedVariant((current) => {
      const availableSelections = variants.map((variant) =>
        getVehicleVariantName(currentCar.name, variant),
      )
      return availableSelections.includes(current)
        ? current
        : availableSelections[0]
    })
  }, [
    currentCar.name,
    dbVariantsLoading,
    hasCurrentDbVariants,
    variantSelectionKey,
  ])

  useEffect(() => {
    if (!hasCurrentDbVariants || colors.length === 0) return
    if (initializedCarColorRef.current !== expectedDbVariantsSourceKey) {
      initializedCarColorRef.current = expectedDbVariantsSourceKey
      setSelectedColor(colors[0].name)
      return
    }
    setSelectedColor((current) =>
      colors.some((color: any) => color.name === current) ? current : colors[0].name,
    )
  }, [colorSelectionKey, expectedDbVariantsSourceKey, hasCurrentDbVariants])

  useEffect(() => {
    const pending = pendingDraftSelectionRef.current
    if (!pending || pending.selectedCarId !== currentCar.name) return

    setSelectedVariant(pending.selectedVariant)
    setSelectedColor(pending.selectedColor)
    setSelectedInteriorColor(pending.selectedInteriorColor)
    setSelectedPackages(pending.selectedPackages)
    pendingDraftSelectionRef.current = null
  }, [currentCar.name])

  useEffect(() => {
    if (!draftHydrated || !draftEnabled || draftSavingStoppedRef.current) return

    const showroomId = selectedShowroom
      ? String(selectedShowroom.entity_id ?? selectedShowroom.id ?? '') || null
      : null
    const draft: DepositDraft = {
      version: DEPOSIT_DRAFT_VERSION,
      currentStep: Math.min(3, Math.max(1, currentStep)) as 1 | 2 | 3,
      vehicleType,
      selectedCarId,
      selectedVariant,
      selectedColor,
      selectedInteriorColor,
      selectedPackages,
      customerType,
      formData,
      provinceCode,
      wardCode,
      selectedShowroomId: showroomId,
      promotionCode,
    }
    latestDraftRef.current = draft

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (draftSavingStoppedRef.current) return
      fetch('/api/v1/deposit/draft', {
        method: 'PUT',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      }).then((response) => {
        if (response.status === 401) setDraftEnabled(false)
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('Không thể tự động lưu bản nháp đặt cọc.', error)
        }
      })
    }, 650)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    currentStep,
    customerType,
    draftEnabled,
    draftHydrated,
    formData,
    promotionCode,
    provinceCode,
    selectedCarId,
    selectedColor,
    selectedInteriorColor,
    selectedPackages,
    selectedShowroom,
    selectedVariant,
    vehicleType,
    wardCode,
  ])

  useEffect(() => {
    const persistBeforeLeaving = () => {
      if (!draftEnabled || draftSavingStoppedRef.current || !latestDraftRef.current) return
      const body = new Blob([JSON.stringify(latestDraftRef.current)], {
        type: 'application/json',
      })
      navigator.sendBeacon('/api/v1/deposit/draft', body)
    }

    window.addEventListener('pagehide', persistBeforeLeaving)
    return () => {
      window.removeEventListener('pagehide', persistBeforeLeaving)
      // Next.js client navigation does not emit pagehide because the document
      // remains mounted, so persist once more when this page component unmounts.
      persistBeforeLeaving()
    }
  }, [draftEnabled])

  const baseColors = isMotorbike
    ? colors
    : colors.filter((color: any) => color.type !== 'ADVANCED')
  const advancedColors = isMotorbike
    ? []
    : colors.filter((color: any) => color.type === 'ADVANCED')
  const advancedColorAdjustments = Array.from(new Set<number>(
    advancedColors
      .map((color: any) => Number(color.priceAdjustment || 0))
      .filter((price: number) => price > 0),
  )).sort((a, b) => a - b)
  const advancedColorPriceLabel = advancedColorAdjustments
    .map((price) => `+${new Intl.NumberFormat('vi-VN').format(price)}đ`)
    .join(' / ')


  const selectedVariantData = currentSpecs.variants?.[selectedVariantName]
  const hasSelectedVehicleVariant = variants.some(
    (variant: string) =>
      selectedVariant === getVehicleVariantName(currentCar.name, variant),
  )
  const selectedInventoryVariant = hasSelectedVehicleVariant
    ? dbVariants.find((variant: any) =>
        matchesDepositVehicleVariant(variant, {
          vehicleVariant: selectedVariant,
          exteriorColor: selectedColor,
          interiorColor: selectedInteriorColor || undefined,
        }),
      )
    : undefined
  const selectedVehicleOutOfStock =
    hasSelectedVehicleVariant &&
    dbVariantsLoaded &&
    !dbVariantsLoading &&
    (!selectedInventoryVariant?.product_variant_id ||
      Number(selectedInventoryVariant.inventory?.on_hand_quantity ?? 0) <= 0)
  const vehicleInventoryUnavailable =
    !hasSelectedVehicleVariant ||
    !dbVariantsLoaded ||
    dbVariantsLoading ||
    selectedVehicleOutOfStock
  const matchingDbVariant =
    effectiveDbVariants.find(
      (variant: any) =>
        variant.version === selectedVariantName &&
        variant.color === selectedColor &&
        (!selectedInteriorColor || variant.interior_color === selectedInteriorColor),
    ) ||
    effectiveDbVariants.find((variant: any) => variant.version === selectedVariantName)
  const versionBasePrices = selectedVersionRows
    .map((variant: any) => Number(variant.price || 0))
    .filter((price: number) => Number.isFinite(price) && price > 0)
  const basePrice =
    (versionBasePrices.length > 0 ? Math.min(...versionBasePrices) : 0) ||
    matchingDbVariant?.price ||
    selectedVariantData?.price ||
    currentCar.displayed_price ||
    0
  const isAdvancedColor = advancedColors.some(
    (color: any) => color.name === selectedColor,
  )
  const selectedColorMetadata = colors.find((color: any) => color.name === selectedColor)
  const colorPrice = isAdvancedColor
    ? Number(selectedColorMetadata?.priceAdjustment || 0)
    : 0
  const availablePackages =
    currentCar.optional_packages?.filter(
      (pkg: any) =>
        !pkg.variants ||
        pkg.variants.some((variant: string) => selectedVariant.includes(variant)),
    ) || []
  const packagesPrice = selectedPackages.reduce((total, id) => {
    const selectedPackage = availablePackages.find((pkg: any) => pkg.id === id)
    return total + (selectedPackage?.price || 0)
  }, 0)
  const localSubtotal = basePrice + colorPrice + packagesPrice
  const displayedTotal =
    promotionQuote?.totalEstimatedPrice ?? localSubtotal
  const hasAppliedDiscount = Boolean(
    promotionQuote?.promotion &&
    promotionQuote.discountAmount > 0 &&
    displayedTotal < localSubtotal,
  )
  const formatVnd = (amount: number) => new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)

  useEffect(() => {
    setPromotionQuote(null)
    setPromotionError(null)
    setPromotionSuccess(null)
  }, [
    vehicleType,
    selectedCarId,
    selectedVariant,
    selectedColor,
    selectedInteriorColor,
    selectedPackages,
  ])

  const activeColorObj = colors.find((c: any) => c.name === selectedColor)
  
  const allExterior = stringArray(currentCar.gallery?.exterior_images)
  const nonLogoExterior = allExterior.find((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('icon') && !img.toLowerCase().includes('uu-diem') && !img.toLowerCase().includes('tuy-chon'))
  
  const exactDbVariant = effectiveDbVariants.find(
    (variant: any) =>
      variant.version === selectedVariantName &&
      variant.color === selectedColor &&
      (!selectedInteriorColor || variant.interior_color === selectedInteriorColor) &&
      variant.image_car_url
  )

  let displayImage = exactDbVariant?.image_car_url || activeColorObj?.image || nonLogoExterior || currentCar.image_url || allExterior[0]

  /* Legacy URL reconstruction is intentionally disabled for car deposit data.
     vehicle_variants.image_car_url is the canonical image source. */
  if (false && !exactDbVariant) {
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
      else if (selectedColor === 'Crimson Red' || selectedColor === 'Solar Ruby') code = 'CE2Q'

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
  }

  const selectedInteriorVariant = selectedVersionRows.find((variant: any) =>
    variant.color === selectedColor &&
    variant.interior_color === selectedInteriorColor,
  )
  const interiorImage = selectedInteriorVariant?.specs?.catalog?.interior_image_url
  const interiorImages: string[] = interiorImage ? [interiorImage] : []

  const powetrain = currentSpecs.variants?.[variants[0]]?.specs?.powertrain || {}
  const dimension = currentSpecs.variants?.[variants[0]]?.specs?.dimension || {}
  
  const interiorColorMap: Record<string, string> = {
    'Granite Black': '#111111',
    'Saddle Brown': '#633517',
    'Cotton Beige': '#d6cdb4',
    'Navy Blue': '#1c2841',
    'Mocca Brown': '#6b4e31',
    'Black': '#111111',
    'Grey': '#808080',
    'Đen (Granite Black)': '#111111',
    'Nâu (Saddle Brown)': '#633517'
  }

  const availableInteriorColors = isMotorbike
    ? []
    : Array.from(new Map(selectedVersionRows
        .filter((variant: any) =>
          variant.color === selectedColor && variant.interior_color,
        )
        .map((variant: any) => {
          const catalog = variant.specs?.catalog || {}
          return [variant.interior_color, {
            name: variant.interior_color,
            hex: interiorColorMap[variant.interior_color] || '#CCCCCC',
            swatch: catalog.interior_swatch_url || undefined,
            image: catalog.interior_image_url || undefined,
          }]
        })).values()).sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'))

  const interiorColorNames = JSON.stringify(availableInteriorColors.map((c: any) => c.name))
  useEffect(() => {
    if (!selectedInteriorColor || !availableInteriorColors.some((c: any) => c.name === selectedInteriorColor)) {
      if (availableInteriorColors.length > 0) {
        setSelectedInteriorColor(availableInteriorColors[0].name)
      }
    }
  }, [interiorColorNames, selectedInteriorColor])

  useEffect(() => {
    setOutOfStockNotice(null)
  }, [selectedCarId, selectedVariant, selectedColor, selectedInteriorColor])

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
      <OutOfStockVariantDialog
        notice={outOfStockNotice}
        onClose={() => setOutOfStockNotice(null)}
      />
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
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">

          {/* SLEEK TOP BAR */}
          <div className="w-full px-8 py-8 flex flex-col gap-5 z-50 relative">

            {/* ROW 1: TOGGLES */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
              {/* VEHICLE TYPE TOGGLE */}
              <div
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1.5 shadow-sm"
                aria-label="Chọn loại xe"
              >
                <button
                  type="button"
                  onClick={() => handleVehicleTypeChange('car')}
                  disabled={currentStep > 1}
                  aria-pressed={vehicleType === 'car'}
                  className={`whitespace-nowrap rounded-full px-7 py-2.5 text-sm font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
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
                  disabled={currentStep > 1}
                  aria-pressed={vehicleType === 'motorbike'}
                  className={`whitespace-nowrap rounded-full px-7 py-2.5 text-sm font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    vehicleType === 'motorbike'
                      ? 'scale-105 bg-slate-900 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Xe máy điện
                </button>
              </div>

              {/* VIEW TOGGLE */}
              {!isMotorbike && !currentCar.name.includes('MPV') && (
                <div className="inline-flex items-center gap-2 bg-slate-50 backdrop-blur-xl p-1.5 rounded-full border border-slate-200 shadow-sm flex-shrink-0">
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

            {/* ROW 2: VEHICLE SELECTOR */}
            <div className="flex min-w-0 max-w-full flex-col items-center gap-3 md:items-start w-full">
              <div
                className={
                  isMotorbike
                    ? 'grid max-w-full grid-rows-2 gap-2 overflow-x-auto rounded-[26px] border border-slate-200 bg-white/75 p-2 shadow-sm backdrop-blur-md hide-scrollbar'
                    : 'inline-flex max-w-full overflow-x-auto rounded-full border border-white/10 bg-white/5 p-2 backdrop-blur-md hide-scrollbar'
                }
                style={
                  isMotorbike
                    ? {
                        gridTemplateColumns: `repeat(${Math.ceil(availableCars.length / 2)}, minmax(112px, max-content))`,
                      }
                    : undefined
                }
              >
                {availableCars.map((car, idx) => {
                const allImages = [
                  ...(car.gallery?.exterior_images || []),
                  ...(car.gallery?.interior_images || []),
                  ...(car.gallery?.all_images || [])
                ]
                let logo = isMotorbike
                  ? undefined
                  : car.specifications?.logo_image_url ||
                    car.specifications?.logo_image ||
                    allImages.find(
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
                const isCustomLogo = logo && (logo.includes('cloudinary') || logo.includes('/uploads') || !logo.endsWith('.svg'))

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={currentStep > 1}
                    onClick={() => setSelectedCarId(car.name)}
                    className={`flex items-center justify-center whitespace-nowrap rounded-full transition-all duration-300 disabled:cursor-not-allowed ${
                      isMotorbike
                        ? 'h-11 min-w-[112px] px-5 py-2.5 text-[15px] font-bold tracking-[0.04em]'
                        : 'h-12 min-w-[96px] px-6 text-[15px] font-semibold tracking-wider'
                    } ${
                      isSelected 
                        ? 'bg-slate-900 text-white shadow-lg scale-105 disabled:opacity-90'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100 group disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-600'
                    }`}
                  >
                    {logo ? (
                      <img 
                        src={logo} 
                        alt={car.name} 
                        className={`object-contain ${
                          car.name === 'VF 2' ? 'h-[22px]' :
                          car.name.includes('All-New') || car.name.includes('MPV') ? 'h-[20px] max-w-[100px]' :
                          isCustomLogo ? 'h-8 max-w-[90px]' :
                          'h-[26px]'
                        } ${
                          isCustomLogo
                            ? `${isSelected ? 'brightness-0 invert scale-105' : 'opacity-70 group-hover:opacity-100'}`
                            : `${isSelected ? 'brightness-0 invert' : 'brightness-0 opacity-60 group-hover:opacity-100'}`
                        }`} 
                      />
                    ) : (
                      car.name
                    )}
                  </button>
                )
                })}
              </div>
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
                    className={`w-28 aspect-[16/9] rounded-xl overflow-hidden border-[3px] transition-all ${interiorImageIndex === idx ? 'border-blue-500 scale-110 shadow-[0_0_20px_rgba(225,146,0,0.5)]' : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'}`}
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
        <div className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-t-[40px] bg-white text-slate-900 shadow-2xl lg:w-[540px] lg:rounded-l-[40px] lg:rounded-t-none xl:w-[600px]">
          
          <div className="flex-1 overflow-y-auto hide-scrollbar p-8 pb-48">
            
            {/* SPEED-INSPIRED STEPPER */}
            <AnimatePresence>
              {currentStep <= 3 && (
                <motion.div
                  key="deposit-stepper"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: -140 }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.01 }
                      : { duration: 0.3, ease: [0.7, 0, 0.2, 1] }
                  }
                >
                  <DepositStepper currentStep={currentStep} />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout" custom={stepDirection}>
              <motion.div
                key={currentStep}
                custom={stepDirection}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        x: stepDirection > 0 ? 72 : -72,
                        filter: 'blur(3px)',
                      }
                }
                animate={{
                  opacity: 1,
                  x: 0,
                  filter: 'blur(0px)',
                }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        x: stepDirection > 0 ? -110 : 110,
                        filter: 'blur(3px)',
                      }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0.01 }
                    : {
                        x: {
                          duration: 0.38,
                          ease: [0.16, 1, 0.3, 1],
                        },
                        opacity: { duration: 0.2 },
                        filter: { duration: 0.22 },
                      }
                }
              >
            {currentStep === 1 && (
              <>

            {/* VARIANT SELECTION */}
            <div className="mb-12">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-2xl font-bold tracking-tight">Phiên bản</h3>
              </div>

              {variantsPending ? (
                <div role="status" className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                  Đang tải phiên bản...
                </div>
              ) : variants.length === 0 ? (
                <div role="status" className="rounded-2xl border-2 border-amber-100 bg-amber-50 p-6 text-sm font-semibold text-amber-700">
                  Hiện chưa có phiên bản đang hoạt động.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {variants.map((v: string) => {
                    const variantName = getVehicleVariantName(currentCar.name, v)
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
              )}
            </div>

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
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 block">Màu nâng cao <span className="text-blue-600 normal-case">{advancedColorPriceLabel}</span></span>
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
            
            {selectedVehicleOutOfStock && (
              <p role="alert" className="mb-8 -mt-3 text-sm font-semibold text-red-600">
                Sản phẩm đang tạm hết hàng.
              </p>
            )}

            {/* INTERIOR COLOR SELECTION */}
            {!isMotorbike && (
              <div className="mb-8">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-2xl font-bold tracking-tight">Nội thất</h3>
                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{selectedInteriorColor}</span>
              </div>
              
              <div className="flex flex-wrap gap-5">
                {availableInteriorColors.map((c: any, i: number) => {
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
              <div>
                <h3 className="text-2xl font-bold tracking-tight mb-6">Thông tin người đặt cọc</h3>
                
                <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50/30 border border-blue-100/80 flex items-center justify-between shadow-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số tiền đặt cọc</span>
                    <span className="text-sm font-semibold text-slate-600">Áp dụng cho dòng xe {currentCar.name}</span>
                  </div>
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                      getDepositAmount()
                    )}
                  </span>
                </div>
                
                <div className="space-y-6">
                  {/* Loại khách hàng */}
                  <div className="flex gap-6 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="customerType" 
                        value="personal" 
                        checked={customerType === 'personal'} 
                        onChange={() => {
                          setCustomerType('personal')
                          setFormData((current) => ({ ...current, companyName: '' }))
                          setFieldErrors({})
                        }}
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
                        onChange={() => {
                          setCustomerType('corporate')
                          setFormData((current) => ({ ...current, name: '' }))
                          setFieldErrors({})
                        }}
                        className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                      />
                      <span className="text-sm font-semibold text-slate-700">Doanh nghiệp</span>
                    </label>
                  </div>

                  {customerType === 'corporate' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Tên doanh nghiệp <span className="text-red-500">*</span></label>
                      <input type="text" required autoComplete="organization" minLength={2} maxLength={180} aria-invalid={Boolean(fieldErrors.companyName)} placeholder="Nhập tên doanh nghiệp đầy đủ" className={inputClass('companyName')} value={formData.companyName} onBlur={() => validateCustomerField('companyName')} onChange={e => { setFormData({...formData, companyName: e.target.value}); clearFieldError('companyName') }} />
                      {fieldErrors.companyName && <p className="text-xs font-medium text-red-600">{fieldErrors.companyName}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Họ và tên <span className="text-red-500">*</span></label>
                      <input type="text" required autoComplete="name" autoCapitalize="words" minLength={2} maxLength={120} aria-invalid={Boolean(fieldErrors.fullName)} placeholder="Nhập họ và tên đầy đủ" className={inputClass('fullName')} value={formData.name} onBlur={() => validateCustomerField('fullName')} onChange={e => { setFormData({...formData, name: e.target.value}); clearFieldError('fullName') }} />
                      {fieldErrors.fullName && <p className="text-xs font-medium text-red-600">{fieldErrors.fullName}</p>}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Số điện thoại <span className="text-red-500">*</span></label>
                    <input type="tel" required autoComplete="tel" inputMode="tel" minLength={10} maxLength={20} pattern="(?:0|\+84)(?:3|5|7|8|9)[0-9 .()\-]{8,14}" aria-invalid={Boolean(fieldErrors.phoneNumber)} placeholder="Ví dụ: 0901234567 hoặc +84901234567" className={inputClass('phoneNumber')} value={formData.phone} onBlur={() => validateCustomerField('phoneNumber')} onChange={e => { setFormData({...formData, phone: e.target.value}); clearFieldError('phoneNumber') }} />
                    {fieldErrors.phoneNumber && <p className="text-xs font-medium text-red-600">{fieldErrors.phoneNumber}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Email <span className="text-red-500">*</span></label>
                    <input type="email" required autoComplete="email" inputMode="email" maxLength={254} spellCheck={false} aria-invalid={Boolean(fieldErrors.email)} placeholder="Ví dụ: ten@example.com" className={inputClass('email')} value={formData.email} onBlur={() => validateCustomerField('email')} onChange={e => { setFormData({...formData, email: e.target.value}); clearFieldError('email') }} />
                    {fieldErrors.email && <p className="text-xs font-medium text-red-600">{fieldErrors.email}</p>}
                  </div>

                  {customerType === 'corporate' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Số đăng ký kinh doanh / Mã số thuế <span className="text-red-500">*</span></label>
                      <input type="text" required inputMode="numeric" minLength={10} maxLength={14} pattern="[0-9]{10}(?:-[0-9]{3})?" spellCheck={false} aria-invalid={Boolean(fieldErrors.idCardNumber)} placeholder="Ví dụ: 0100109106" className={inputClass('idCardNumber')} value={formData.taxId} onBlur={() => validateCustomerField('idCardNumber')} onChange={e => { setFormData({...formData, taxId: e.target.value.replace(/[^0-9-]/g, '')}); clearFieldError('idCardNumber') }} />
                      {fieldErrors.idCardNumber && <p className="text-xs font-medium text-red-600">{fieldErrors.idCardNumber}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Số CCCD / CMND / Hộ chiếu <span className="text-red-500">*</span></label>
                      <input type="text" required inputMode="text" minLength={8} maxLength={12} pattern="(?:[0-9]{9}|[0-9]{12}|[A-Za-z][0-9]{7})" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(fieldErrors.idCardNumber)} placeholder="CCCD 12 số, CMND 9 số hoặc hộ chiếu" className={inputClass('idCardNumber')} value={formData.idCard} onBlur={() => validateCustomerField('idCardNumber')} onChange={e => { setFormData({...formData, idCard: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')}); clearFieldError('idCardNumber') }} />
                      {fieldErrors.idCardNumber && <p className="text-xs font-medium text-red-600">{fieldErrors.idCardNumber}</p>}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 relative z-20">
                    <div>
                      <SearchableLocationSelect
                        label="Tỉnh / Thành phố"
                        options={provinces}
                        value={provinceCode}
                        loading={locationsLoading}
                        placeholder="Chọn Tỉnh/Thành"
                        onChange={(option) => {
                          if (option) {
                            setProvinceCode(String(option.code))
                            setWardCode('')
                            setFormData(prev => ({ ...prev, province: option.name, ward: '' }))
                            setSelectedShowroom(null)
                            setOpenShowroom(false)
                            setAutoOpenWard(true)
                            clearFieldError('provinceCode')
                            clearFieldError('wardCode')
                          } else {
                            setProvinceCode('')
                            setWardCode('')
                            setFormData(prev => ({ ...prev, province: '', ward: '' }))
                            setSelectedShowroom(null)
                            setOpenShowroom(false)
                            setAutoOpenWard(false)
                          }
                        }}
                      />
                      {fieldErrors.provinceCode && <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.provinceCode}</p>}
                    </div>
                    <div>
                      <SearchableLocationSelect
                        label="Xã / Phường"
                        options={wards}
                        value={wardCode}
                        disabled={!provinceCode}
                        loading={wardsLoading}
                        autoOpen={autoOpenWard}
                        placeholder={provinceCode ? 'Chọn Xã/Phường' : 'Chọn Tỉnh/Thành trước'}
                        onChange={(option) => {
                          setAutoOpenWard(false)
                          if (option) {
                            setWardCode(String(option.code))
                            setFormData(prev => ({ ...prev, ward: option.name }))
                            setOpenShowroom(false)
                            clearFieldError('wardCode')
                          } else {
                            setWardCode('')
                            setFormData(prev => ({ ...prev, ward: '' }))
                            setSelectedShowroom(null)
                            setOpenShowroom(false)
                          }
                        }}
                      />
                      {fieldErrors.wardCode && <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.wardCode}</p>}
                    </div>
                  </div>

                  {locationError && (
                    <p className="text-sm text-red-600" role="status">{locationError}</p>
                  )}
                  <div className="space-y-2 pt-4 relative z-10">
                    <div className="relative text-sm font-medium text-gray-700" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenShowroom(false) }}>
                      <label className="text-sm font-semibold text-slate-700 mb-2 block">Showroom nhận xe <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenShowroom(!openShowroom)}
                          className={`w-full text-left rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-10 font-normal focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all text-slate-700 min-h-[46px] ${
                            !formData.province ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''
                          }`}
                          disabled={!formData.province}
                        >
                          <span className="block whitespace-normal break-words text-sm">
                            {selectedShowroom
                              ? `${selectedShowroom.name} - ${selectedShowroom.address}`
                              : formData.province
                                ? 'Chọn showroom'
                                : 'Vui lòng chọn Tỉnh/Thành trước'}
                          </span>
                        </button>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      </div>
                      
                      {openShowroom && (
                        <div className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                          {filteredShowrooms.length ? filteredShowrooms.map(s => {
                            const active = selectedShowroom?.entity_id === s.entity_id;
                            return (
                              <button
                                key={s.entity_id}
                                type="button"
                                onClick={() => {
                                  setSelectedShowroom(s);
                                  setOpenShowroom(false);
                                  const matchedWard = findMatchingWard(s, wards);
                                  if (matchedWard) {
                                    const foundWardObj = wards.find((w: any) => w.name === matchedWard)
                                    if (foundWardObj) {
                                      setWardCode(String(foundWardObj.code))
                                      setFormData(prev => ({ ...prev, ward: matchedWard }))
                                    }
                                  }
                                }}
                                className={`flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left text-sm font-normal transition active:scale-[0.99] ${active ? 'bg-slate-100 text-slate-900 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                              >
                                <span className="break-words whitespace-normal w-full pr-2 leading-relaxed">{s.name} - {s.address}</span>
                                {active && <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                              </button>
                            )
                          }) : <p className="px-3 py-6 text-center text-sm font-normal text-gray-500">Không tìm thấy kết quả phù hợp.</p>}
                        </div>
                      )}
                    </div>
                    {filteredShowrooms.length === 0 && formData.province && (
                      <p className="text-sm text-amber-600 mt-1">Không tìm thấy showroom nào ở khu vực bạn chọn. Vui lòng chọn khu vực khác.</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Mã ưu đãi / E-voucher</label>
                      {promotionQuote?.promotion && (
                        <span className="text-xs font-semibold text-emerald-600">
                          Đã áp dụng mã {promotionQuote.promotion.code}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <input 
                        type="text" 
                        placeholder="Nhập mã ưu đãi" 
                        value={promotionCode}
                        onChange={(event) => {
                          setPromotionCode(event.target.value.toUpperCase())
                          setPromotionQuote(null)
                          setPromotionError(null)
                          setPromotionSuccess(null)
                        }}
                        disabled={applyingPromotion || !!promotionQuote?.promotion}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all bg-slate-50 focus:bg-white uppercase disabled:opacity-50" 
                      />
                      {promotionQuote?.promotion ? (
                        <button 
                          type="button"
                          onClick={() => {
                            setPromotionQuote(null)
                            setPromotionCode('')
                            setPromotionSuccess(null)
                            setPromotionError(null)
                          }}
                          className="px-6 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors whitespace-nowrap"
                        >
                          Hủy mã
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={handleApplyPromotion}
                          disabled={applyingPromotion || !promotionCode.trim()}
                          className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          {applyingPromotion ? 'Đang áp dụng...' : 'Áp dụng'}
                        </button>
                      )}
                    </div>
                    {promotionError && <p className="text-sm text-red-500 mt-1">{promotionError}</p>}
                    {promotionSuccess && <p className="text-sm text-emerald-600 mt-1">{promotionSuccess}</p>}
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 3 && (
              <div>
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
                    {promotionQuote?.promotion && (
                      <>
                        <div className="flex items-center justify-between border-t border-slate-100 py-3">
                          <span className="text-slate-600">
                            Mã ưu đãi {promotionQuote.promotion.code}
                          </span>
                          <span className="font-semibold text-emerald-700">
                            -{new Intl.NumberFormat('vi-VN').format(promotionQuote.discountAmount)} ₫
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 py-3">
                          <span className="font-semibold text-slate-800">Tổng sau ưu đãi</span>
                          <span className="font-bold text-slate-950">
                            {new Intl.NumberFormat('vi-VN').format(promotionQuote.totalEstimatedPrice)} ₫
                          </span>
                        </div>
                      </>
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
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">{activeIdentityNumber || '-------------'}</div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200 mt-4">
                      <span className="text-slate-600 w-1/3">Showroom nhận xe</span>
                      <div className="flex-1 text-right font-medium text-slate-800 border-b border-dashed border-slate-300">
                        {selectedShowroom ? selectedShowroom.name : 'VinFast Landmark 81'}
                      </div>
                    </div>
                    <div className="flex items-center py-3 border-b border-dashed border-slate-200">
                      <span className="text-slate-600 w-1/3">Nhân viên tư vấn</span>
                      <div className="flex-1 text-right font-medium text-slate-800"></div>
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
              <div className="py-12 text-center">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check size={40} strokeWidth={3} />
                </div>
                <h3 className="text-3xl font-bold tracking-tight mb-4">Đã tạo đơn đặt cọc</h3>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto">Đơn đang chờ hoàn tất thanh toán. Nhân viên của chúng tôi sẽ liên hệ để xác nhận và hướng dẫn bước tiếp theo.</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 text-left">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-500">Mã đơn hàng</span>
                    <span className="font-bold">{completedOrder?.orderNumber || '\u0110ang c\u1eadp nh\u1eadt'}</span>
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
                      }).format(completedOrder?.depositAmount || 0)}
                    </span>
                  </div>
                  {(completedOrder?.discountAmount ?? 0) > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-slate-500">Ưu đãi</span>
                      <span className="font-bold text-emerald-700">
                        -{new Intl.NumberFormat('vi-VN').format(completedOrder?.discountAmount ?? 0)} ₫
                      </span>
                    </div>
                  )}
                  {completedOrder?.createdAt && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-sm text-slate-500">Thời gian tạo</span>
                      <span className="text-sm font-semibold text-slate-700">
                        {new Intl.DateTimeFormat('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        }).format(new Date(completedOrder.createdAt))} (GMT+7)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
              </motion.div>
            </AnimatePresence>

          </div>

           {/* BOTTOM CHECKOUT BAR */}
           <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 sm:p-6 z-30">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                {currentStep < 4 ? (
                 <>
                   <motion.div layout className="min-w-0">
                     <motion.div
                       layout
                       transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                       className="mb-0.5 text-xs font-medium text-slate-500 sm:text-sm whitespace-nowrap"
                     >
                       Tổng dự tính
                     </motion.div>
                     <AnimatePresence initial={false} mode="popLayout">
                       {hasAppliedDiscount && (
                         <motion.div
                           key="original-total"
                           initial={{ opacity: 0, y: 7, scale: 1.08 }}
                           animate={{ opacity: 1, y: 0, scale: 1 }}
                           exit={{ opacity: 0, y: -5, scale: 0.95 }}
                           transition={{ duration: 0.2, ease: 'easeOut' }}
                           className="w-fit text-xs font-semibold text-slate-800 line-through decoration-slate-800 decoration-1 sm:text-sm"
                           aria-label={`Giá gốc ${formatVnd(localSubtotal)}`}
                         >
                           {formatVnd(localSubtotal)}
                         </motion.div>
                       )}
                     </AnimatePresence>
                     <motion.div
                       layout
                       transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                       className={`text-lg font-black whitespace-nowrap sm:text-xl ${hasAppliedDiscount ? 'text-amber-600' : 'text-slate-900'}`}
                     >
                       {displayedTotal > 0 ? formatVnd(displayedTotal) : 'Liên hệ'}
                     </motion.div>
                   </motion.div>
                   
                   <div className="flex gap-2 sm:gap-3 shrink-0">
                     {currentStep > 1 && (
                       <button 
                         onClick={() => goToStep(currentStep - 1)}
                         className="flex items-center justify-center bg-slate-100 text-slate-600 px-3 sm:px-6 py-3 sm:py-4 rounded-full font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 hover:bg-slate-200 transition-all active:scale-95"
                       >
                         Quay lại
                       </button>
                     )}
                     <button 
                       onClick={handleNextStep}
                       disabled={isSubmitting || (currentStep === 1 && dbVariantsLoading)}
                       className={`flex items-center justify-center gap-1 sm:gap-2 bg-slate-900 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-full font-bold text-xs sm:text-sm tracking-wide sm:tracking-widest whitespace-nowrap shrink-0 transition-all uppercase ${isSubmitting || (currentStep === 1 && dbVariantsLoading) ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-800 hover:gap-3 hover:shadow-xl active:scale-95'}`}
                     >
                       {isSubmitting ? 'Đang xử lý...' : (currentStep === 1 || currentStep === 2 ? 'Tiếp tục' : 'Thanh toán đặt cọc')} {!isSubmitting && <ArrowRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
                     </button>
                   </div>
                 </>
               ) : (
                 <button 
                   onClick={() => window.location.href = '/profile'}
                   className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-full font-bold text-sm tracking-widest hover:bg-slate-800 transition-all uppercase hover:shadow-xl active:scale-95"
                 >
                   Xem lịch sử mua xe
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
