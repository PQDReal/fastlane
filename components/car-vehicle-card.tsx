'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

type CarVehicleCardProps = {
  name: string
  desc?: string
  price: string
  image: string
  href: string
}

function CardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-20 flex flex-col items-center bg-background pb-8"
    >
      <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-slate-200" />
      <div className="mt-5 h-6 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-6 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="mt-8 h-3 w-40 animate-pulse rounded bg-slate-100" />
    </div>
  )
}

export function CarVehicleCard({ name, desc, price, image, href }: CarVehicleCardProps) {
  const [mediaReady, setMediaReady] = useState(false)
  const slug = href.split('/').filter(Boolean).pop()
  const estimateHref = slug
    ? `/cost-estimator?vehicle=${encodeURIComponent(slug)}`
    : '/cost-estimator'

  return (
    <article
      aria-busy={!mediaReady}
      className="group relative flex h-full min-h-[470px] cursor-pointer flex-col items-center pb-8 text-center"
    >
      {!mediaReady && <CardSkeleton />}

      <div
        className={`flex h-full w-full flex-col items-center transition-opacity duration-300 ${
          mediaReady ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <Link href={href} className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gray-50/50 p-4">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="relative z-10 h-full w-full object-contain transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover:scale-[1.05]"
            onLoad={() => setMediaReady(true)}
            onError={() => setMediaReady(true)}
          />
        </Link>

        <div className="mt-4 flex w-full flex-1 flex-col items-center">
          <h3 className="text-lg font-bold uppercase tracking-tight text-foreground sm:text-xl">
            <Link href={href}>{name}</Link>
          </h3>
          {desc && <p className="mt-2 max-w-[280px] line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}

          <div className="group/price relative mt-4">
            <p className="text-lg font-bold text-foreground">{price} ₫</p>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 translate-y-1 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background opacity-0 shadow-lg transition-all duration-150 group-hover/price:translate-y-0 group-hover/price:opacity-100">
              Giá niêm yết tham khảo, đã gồm VAT.
            </span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="group/action relative">
              <Link href={href} className="transition-colors hover:text-brand-600">Chi tiết</Link>
              <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 translate-y-1 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background opacity-0 shadow-lg transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100">Xem thông số, hình ảnh và phiên bản.</span>
            </span>
            <span className="h-3 w-px bg-muted-foreground/40" />
            <span className="group/action relative">
              <Link href={estimateHref} className="transition-colors hover:text-brand-600">Dự toán</Link>
              <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 translate-y-1 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background opacity-0 shadow-lg transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100">Ước tính chi phí lăn bánh cho mẫu xe này.</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
