import { Clock, ArrowRight, Tag } from 'lucide-react'
import { Button } from './ui/button'

export function PromoCard({ title, desc, type, expires, image, cta }: any) {
  return (
    <article className="group flex flex-col sm:flex-row bg-background rounded-3xl border border-black/5 overflow-hidden shadow-sm hover:shadow-glass-hover transition-all duration-700">
      <div className="relative aspect-video sm:aspect-auto sm:w-2/5 overflow-hidden">
        <div className="absolute inset-0 bg-black/10 z-10 group-hover:bg-transparent transition-colors duration-500" />
        <img src={image} alt={title} className="w-full h-full object-cover transition-transform duration-1000 ease-[0.16,1,0.3,1] group-hover:scale-105" />
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
          <Tag size={12} className="text-brand-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-900">{type}</span>
        </div>
      </div>
      
      <div className="p-8 sm:p-10 flex flex-col flex-1">
        <h3 className="text-2xl font-bold tracking-tight text-foreground">{title}</h3>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed flex-1">{desc}</p>
        
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 pt-6 border-t border-muted">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-600 bg-brand-50 px-4 py-2 rounded-lg">
            <Clock size={16} />
            Hết hạn: {expires}
          </div>
          <Button variant="default" className="bg-foreground text-background hover:bg-foreground/90 font-bold rounded-full h-11 px-6 group/btn">
            {cta}
            <ArrowRight size={16} className="ml-2 transition-transform duration-300 group-hover/btn:translate-x-1" />
          </Button>
        </div>
      </div>
    </article>
  )
}
