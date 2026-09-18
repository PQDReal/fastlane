'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BatteryCharging,
  CarFront,
  Gauge,
  Leaf,
  Route,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export type HomeVehicle = {
  id: string
  name: string
  slug: string
  type: 'CAR' | 'BIKE'
  description: string
  image: string
  price: number
  range: string
  power: string
  thirdMetric: string
  thirdMetricLabel: string
  colors: string[]
  href: string
  depositHref: string
  estimatorHref: string
  testDriveHref: string
}

const currency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)

function VehicleMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Route
  value: string
  label: string
}) {
  return (
    <div className="min-w-0 border-l border-black/10 pl-4 first:border-l-0 first:pl-0 sm:pl-6">
      <Icon aria-hidden="true" className="mb-3 h-5 w-5 text-[#a87908]" strokeWidth={1.7} />
      <p
        className="min-h-[2.5rem] whitespace-normal break-words text-lg font-bold leading-tight tracking-tight text-foreground sm:text-2xl"
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
    </div>
  )
}

export function HomeFeaturedVehicles({ vehicles }: { vehicles: HomeVehicle[] }) {
  const availableTypes = useMemo(
    () => (['CAR', 'BIKE'] as const).filter((type) => vehicles.some((vehicle) => vehicle.type === type)),
    [vehicles],
  )
  const [type, setType] = useState<'CAR' | 'BIKE'>(availableTypes[0] ?? 'CAR')
  const candidates = vehicles.filter((vehicle) => vehicle.type === type)
  const [selectedByType, setSelectedByType] = useState<Record<'CAR' | 'BIKE', string>>({
    CAR: vehicles.find((vehicle) => vehicle.type === 'CAR')?.id ?? '',
    BIKE: vehicles.find((vehicle) => vehicle.type === 'BIKE')?.id ?? '',
  })
  const selected =
    candidates.find((vehicle) => vehicle.id === selectedByType[type]) ?? candidates[0] ?? vehicles[0]

  if (!selected) return null

  const selectType = (nextType: 'CAR' | 'BIKE') => {
    setType(nextType)
    if (!selectedByType[nextType]) {
      setSelectedByType((current) => ({
        ...current,
        [nextType]: vehicles.find((vehicle) => vehicle.type === nextType)?.id ?? '',
      }))
    }
  }

  return (
    <section id="featured-vehicle" className="scroll-mt-20 overflow-hidden bg-background py-24 lg:py-36">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
        <div className="mb-10 flex flex-col gap-6 lg:mb-14 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a87908]">Khám phá dòng xe</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-6xl">
              Chọn chuyển động của riêng bạn
            </h2>
          </div>
          <div className="inline-flex w-fit rounded-full border border-black/10 bg-muted p-1.5 shadow-sm">
            {availableTypes.map((itemType) => (
              <button
                key={itemType}
                type="button"
                onClick={() => selectType(itemType)}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition-all sm:px-7 ${
                  type === itemType
                    ? 'bg-foreground text-background shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {itemType === 'CAR' ? 'Ô tô điện' : 'Xe máy điện'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {candidates.slice(0, 6).map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() =>
                setSelectedByType((current) => ({
                  ...current,
                  [type]: vehicle.id,
                }))
              }
              className={`shrink-0 rounded-full border px-5 py-2.5 text-xs font-bold transition-all ${
                selected.id === vehicle.id
                  ? 'border-[#a87908] bg-[#a87908] text-white'
                  : 'border-black/10 bg-white text-foreground hover:border-[#a87908]/60'
              }`}
            >
              {vehicle.name}
            </button>
          ))}
        </div>

        <div className="relative min-h-[620px] overflow-hidden rounded-[2rem] bg-[#f3f3f2] lg:min-h-[650px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_45%,rgba(255,255,255,0.95),transparent_44%)]" />
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 36 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
              className="relative grid min-h-[620px] items-center gap-8 px-7 py-10 sm:px-12 lg:min-h-[650px] lg:grid-cols-[0.82fr_1.18fr] lg:px-16"
            >
              <div className="relative z-10 max-w-xl">
                <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8b6407]">
                  <Sparkles size={14} />
                  Mẫu xe nổi bật
                </span>
                <h3 className="mt-4 text-5xl font-bold tracking-[-0.05em] text-foreground sm:text-7xl">
                  {selected.name}
                </h3>
                <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
                  {selected.description}
                </p>
                <p className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Giá từ
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">{currency(selected.price)} ₫</p>

                <div className="mt-9 grid grid-cols-3 gap-3 border-t border-black/10 pt-7">
                  <VehicleMetric icon={Route} value={selected.range} label="Phạm vi" />
                  <VehicleMetric icon={Zap} value={selected.power} label="Công suất" />
                  <VehicleMetric
                    icon={Gauge}
                    value={selected.thirdMetric}
                    label={selected.thirdMetricLabel}
                  />
                </div>

                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    href={selected.depositHref}
                    className="inline-flex h-12 items-center rounded-full bg-foreground px-7 text-xs font-bold uppercase tracking-[0.12em] text-background transition hover:-translate-y-0.5"
                  >
                    Đặt cọc ngay
                  </Link>
                  <Link
                    href={selected.href}
                    className="inline-flex h-12 items-center rounded-full border border-black/20 bg-white px-7 text-xs font-bold uppercase tracking-[0.12em] text-foreground transition hover:border-foreground"
                  >
                    Xem chi tiết
                  </Link>
                  <Link
                    href={selected.estimatorHref}
                    className="inline-flex h-12 items-center gap-2 px-2 text-xs font-bold uppercase tracking-[0.12em] text-foreground hover:text-[#8b6407]"
                  >
                    Dự toán <ArrowRight size={15} />
                  </Link>
                  <Link
                    href={selected.testDriveHref}
                    className="inline-flex h-12 items-center gap-2 px-2 text-xs font-bold uppercase tracking-[0.12em] text-foreground hover:text-[#8b6407]"
                  >
                    Lái thử <ArrowRight size={15} />
                  </Link>
                </div>
              </div>

              <div className="relative flex min-h-[330px] items-center justify-center lg:min-h-[540px]">
                <motion.img
                  key={selected.image}
                  initial={{ opacity: 0, scale: 0.94, x: 24 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
                  src={selected.image}
                  alt={selected.name}
                  className="relative z-10 max-h-[500px] w-full object-contain drop-shadow-[0_30px_35px_rgba(0,0,0,0.16)]"
                />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(56px,8vw,128px)] font-black uppercase tracking-[-0.08em] text-black/[0.035]">
                  {selected.name}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function CollectionCard({ vehicle }: { vehicle: HomeVehicle }) {
  return (
    <article className="group flex h-full flex-col">
      <Link
        href={vehicle.href}
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[1.6rem] bg-white p-7 transition duration-300 active:scale-[0.99]"
      >
        <span className="absolute left-5 top-5 rounded-full bg-[#171411] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white">
          {vehicle.type === 'CAR' ? 'Ô tô điện' : 'Xe máy điện'}
        </span>
        <img
          src={vehicle.image}
          alt={vehicle.name}
          className="h-[82%] w-full object-contain transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col px-2 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{vehicle.name}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{vehicle.description}</p>
          </div>
          <Link
            href={vehicle.href}
            aria-label={`Xem ${vehicle.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white transition group-hover:border-foreground"
          >
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4 border-t border-black/10 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Giá từ</p>
            <p className="mt-1 text-lg font-bold">{currency(vehicle.price)} ₫</p>
          </div>
          <div className="flex max-w-[45%] -space-x-1.5">
            {vehicle.colors.slice(0, 5).map((color, index) => (
              <span
                key={`${color}-${index}`}
                title={color}
                className="h-5 w-5 rounded-full border-2 border-white bg-slate-300 shadow-sm"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

export function HomeVehicleCollection({ vehicles }: { vehicles: HomeVehicle[] }) {
  const [filter, setFilter] = useState<'ALL' | 'CAR' | 'BIKE'>('ALL')
  const visible = vehicles.filter((vehicle) => filter === 'ALL' || vehicle.type === filter).slice(0, 4)

  return (
    <section id="products" className="scroll-mt-24 bg-muted py-24 lg:py-36">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a87908]">Bộ sưu tập FastLane</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-6xl">
              Thiết kế cho mọi hành trình
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              So sánh nhanh thiết kế, giá bán và thông số quan trọng trước khi đi sâu vào từng mẫu xe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['ALL', 'Tất cả'],
              ['CAR', 'Ô tô'],
              ['BIKE', 'Xe máy'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as 'ALL' | 'CAR' | 'BIKE')}
                className={`rounded-full px-5 py-2.5 text-xs font-bold transition ${
                  filter === value ? 'bg-foreground text-background' : 'bg-white text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={filter}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="mt-14 grid gap-x-8 gap-y-14 md:grid-cols-2"
          >
            {visible.map((vehicle) => (
              <CollectionCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </motion.div>
        </AnimatePresence>

        <div className="mt-16 flex flex-wrap justify-center gap-3">
          <Link
            href="/cars"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-6 text-xs font-bold uppercase tracking-[0.12em] hover:border-foreground"
          >
            Xem tất cả ô tô <ArrowRight size={15} />
          </Link>
          <Link
            href="/bikes"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-6 text-xs font-bold uppercase tracking-[0.12em] hover:border-foreground"
          >
            Xem tất cả xe máy <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  )
}

const NEED_OPTIONS = [
  { value: 'DAILY', label: 'Đi làm hằng ngày', icon: Route },
  { value: 'FAMILY', label: 'Dành cho gia đình', icon: CarFront },
  { value: 'LONG_RANGE', label: 'Hành trình dài', icon: BatteryCharging },
  { value: 'ECONOMY', label: 'Tối ưu chi phí', icon: Leaf },
] as const

export function HomeVehicleFinder({ vehicles }: { vehicles: HomeVehicle[] }) {
  const maximumPrice = Math.max(...vehicles.map((vehicle) => vehicle.price), 50_000_000)
  const roundedMaximum = Math.ceil(maximumPrice / 50_000_000) * 50_000_000
  const [vehicleType, setVehicleType] = useState<'ALL' | 'CAR' | 'BIKE'>('ALL')
  const [need, setNeed] = useState<(typeof NEED_OPTIONS)[number]['value']>('DAILY')
  const [budget, setBudget] = useState(Math.min(roundedMaximum, 800_000_000))

  const recommendations = useMemo(() => {
    const withinBudget = vehicles.filter(
      (vehicle) => (vehicleType === 'ALL' || vehicle.type === vehicleType) && vehicle.price <= budget,
    )
    const ranked = [...withinBudget].sort((a, b) => {
      if (need === 'ECONOMY') return a.price - b.price
      if (need === 'LONG_RANGE') return Number.parseInt(b.range) - Number.parseInt(a.range)
      if (need === 'FAMILY') {
        if (a.type !== b.type) return a.type === 'CAR' ? -1 : 1
        return b.price - a.price
      }
      return Math.abs(budget - a.price) - Math.abs(budget - b.price)
    })
    return ranked.slice(0, 3)
  }, [budget, need, vehicleType, vehicles])

  return (
    <section className="bg-[#171411] py-24 text-white lg:py-36">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-12">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-[#d8a313]">
            <Search size={15} />
            Tư vấn nhanh
          </span>
          <h2 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
            Tìm chiếc xe phù hợp
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
            Chọn nhu cầu và ngân sách. FastLane sẽ gợi ý những mẫu xe đang hoạt động phù hợp nhất.
          </p>

          <div className="mt-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Loại phương tiện</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['ALL', 'Tất cả'],
                ['CAR', 'Ô tô điện'],
                ['BIKE', 'Xe máy điện'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVehicleType(value as 'ALL' | 'CAR' | 'BIKE')}
                  className={`rounded-full border px-4 py-2.5 text-xs font-bold transition ${
                    vehicleType === value
                      ? 'border-[#d8a313] bg-[#d8a313] text-black'
                      : 'border-white/15 text-white/70 hover:border-white/40 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Nhu cầu chính</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {NEED_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNeed(option.value)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left text-sm font-semibold transition ${
                    need === option.value
                      ? 'border-white/50 bg-white text-black'
                      : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                  }`}
                >
                  <option.icon size={18} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-9 block">
            <span className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
              Ngân sách tối đa
              <strong className="text-sm tracking-normal text-white">{currency(budget)} ₫</strong>
            </span>
            <input
              type="range"
              min={10_000_000}
              max={roundedMaximum}
              step={10_000_000}
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
              className="mt-5 w-full accent-[#d8a313]"
            />
          </label>
        </div>

        <div className="rounded-[2rem] bg-white p-5 text-foreground sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b6407]">Đề xuất dành cho bạn</p>
              <h3 className="mt-2 text-2xl font-bold">Có {recommendations.length} lựa chọn phù hợp</h3>
            </div>
            <Sparkles className="text-[#a87908]" />
          </div>

          <div className="mt-6 space-y-3">
            {recommendations.map((vehicle, index) => (
              <Link
                key={vehicle.id}
                href={vehicle.href}
                className="group grid grid-cols-[92px_1fr_auto] items-center gap-4 rounded-2xl border border-black/10 bg-[#f6f6f5] p-3 transition hover:border-[#a87908]/50 hover:bg-[#faf8f1] active:scale-[0.995] sm:grid-cols-[130px_1fr_auto]"
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
                  <img src={vehicle.image} alt="" className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Gợi ý #{index + 1}
                  </p>
                  <p className="mt-1 truncate text-lg font-bold">{vehicle.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {vehicle.range} · {vehicle.power}
                  </p>
                  <p className="mt-2 text-sm font-bold">{currency(vehicle.price)} ₫</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white transition group-hover:bg-foreground group-hover:text-white">
                  <ArrowRight size={16} />
                </span>
              </Link>
            ))}
            {recommendations.length === 0 && (
              <div className="rounded-2xl border border-dashed border-black/15 px-6 py-16 text-center">
                <p className="font-bold">Chưa có mẫu xe trong khoảng ngân sách này.</p>
                <p className="mt-2 text-sm text-muted-foreground">Hãy tăng ngân sách hoặc chọn loại phương tiện khác.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Keep the homepage vehicle experience behind one client boundary. Passing the
 * same catalog to three separate client components makes React serialize the
 * catalog three times in the RSC payload even though every section reads the
 * same records.
 */
export function HomeVehicleExperience({ vehicles }: { vehicles: HomeVehicle[] }) {
  return (
    <>
      <HomeFeaturedVehicles vehicles={vehicles} />
      <HomeVehicleFinder vehicles={vehicles} />
      <HomeVehicleCollection vehicles={vehicles} />
    </>
  )
}
