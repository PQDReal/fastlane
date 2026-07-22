import { ArrowRight } from 'lucide-react'

export function ProductCard({ name, desc, price, image, hot }: { name: string; desc: string; price: string; image: string; hot?: boolean }) {
  return (
    <article className="group flex flex-col cursor-pointer">
      <div className="relative aspect-[4/3] w-full rounded-[2rem] bg-background overflow-hidden flex items-center justify-center p-8 transition-all duration-700 group-hover:shadow-glass-hover">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-muted via-background to-background opacity-50" />
        {hot && <span className="absolute left-6 top-6 z-10 text-[10px] uppercase tracking-widest font-bold text-brand-600 bg-brand-50 px-4 py-1.5 rounded-full">Bán chạy</span>}
        <img src={image} alt={name} className="relative z-10 w-full h-auto object-contain transition-transform duration-1000 ease-[0.16,1,0.3,1] group-hover:scale-105 drop-shadow-xl" />
      </div>
      
      <div className="mt-8 flex flex-col px-2">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{name}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2 max-w-sm">{desc}</p>
          </div>
          <div className="flex items-center justify-center h-12 w-12 rounded-full border border-muted-foreground/20 text-foreground transition-all duration-500 group-hover:bg-foreground group-hover:text-background shrink-0 group-hover:border-transparent">
            <ArrowRight size={18} className="transition-transform duration-500 group-hover:translate-x-1" />
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-muted/50 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Giá khởi điểm</p>
          <p className="text-lg font-bold text-foreground">Từ {price} ₫</p>
        </div>
      </div>
    </article>
  )
}
