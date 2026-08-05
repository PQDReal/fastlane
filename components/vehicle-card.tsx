import Link from 'next/link'
import Image from 'next/image'

export function VehicleCard({ name, desc, price, image, href = '#' }: any) {
  const slug = href.split('/').filter(Boolean).pop()
  const estimateHref = slug
    ? `/cost-estimator?vehicle=${encodeURIComponent(slug)}`
    : '/cost-estimator'

  return (
    <article className="group h-full flex flex-col items-center text-center cursor-pointer pb-8">
      <Link href={href} className="relative aspect-[4/3] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-gray-50/50 p-4">
        <Image
          src={image} 
          alt={name} 
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="relative z-10 w-full h-full object-contain transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover:scale-[1.05]" 
        />
      </Link>
      
      <div className="flex flex-col items-center mt-4 w-full flex-1">
        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground uppercase">
          <Link href={href}>{name}</Link>
        </h3>
        {desc && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2 max-w-[280px]">{desc}</p>}
        
        <div className="group/price relative mt-4">
          <p className="text-lg font-bold text-foreground">{price} ₫</p>
          <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-150 group-hover/price:translate-y-0 group-hover/price:opacity-100 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background shadow-lg">
            Giá niêm yết tham khảo, đã gồm VAT.
          </span>
        </div>
        
        <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          <span className="group/action relative">
            <Link href={href} className="hover:text-brand-600 transition-colors">Chi tiết</Link>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background shadow-lg">Xem thông số, hình ảnh và phiên bản.</span>
          </span>
          <span className="w-px h-3 bg-muted-foreground/40"></span>
          <span className="group/action relative">
            <Link href={estimateHref} className="hover:text-brand-600 transition-colors">Dự toán</Link>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-150 group-hover/action:translate-y-0 group-hover/action:opacity-100 rounded-lg bg-foreground px-3 py-2 text-xs font-medium normal-case tracking-normal text-background shadow-lg">Ước tính chi phí lăn bánh cho mẫu xe này.</span>
          </span>
        </div>
      </div>
    </article>
  )
}
