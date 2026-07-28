import Link from 'next/link'

export function ProductCard({ name, desc, price, image, hot, href = '#' }: { name: string; desc: string; price: string; image: string; hot?: boolean; href?: string }) {
  return (
    <article className="group h-full flex flex-col items-center text-center relative pb-8">
      <Link href={href} className="absolute inset-0 z-10" aria-label={`Xem chi tiết ${name}`} />
      <div className="relative aspect-[4/3] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-gray-50/50">
        {hot && <span className="absolute left-4 top-4 z-20 text-[10px] uppercase tracking-widest font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">Bán chạy</span>}
        <img 
          src={image} 
          alt={name} 
          className="relative z-10 w-full h-[80%] object-contain transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover:scale-[1.05]" 
        />
      </div>
      
      <div className="flex flex-col items-center mt-4 w-full flex-1">
        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground uppercase">
          <Link href={href}>{name}</Link>
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2 max-w-[280px]">{desc}</p>
        
        <p className="mt-4 text-lg font-bold text-foreground">{price} ₫</p>
        
        <div className="mt-6 flex items-center justify-center gap-5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest relative z-20">
          <Link href={href} className="hover:text-brand-600 transition-colors">Chi tiết</Link>
          <span className="w-px h-3 bg-muted-foreground/40"></span>
          <Link href={`/cost-estimator`} className="hover:text-brand-600 transition-colors">Dự toán</Link>
        </div>
      </div>
    </article>
  )
}
