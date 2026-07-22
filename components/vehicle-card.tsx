import { ArrowRight, Info, Scale, Calculator, Calendar } from 'lucide-react'
import { Button } from './ui/button'

export function VehicleCard({ name, desc, price, image, range, battery, horsepower, seats }: any) {
  return (
    <article className="group flex flex-col bg-background rounded-[2rem] border border-black/5 overflow-hidden shadow-sm hover:shadow-glass-hover transition-all duration-700">
      <div className="relative aspect-[16/9] w-full bg-muted flex items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-muted to-muted opacity-50" />
        <img src={image} alt={name} className="relative z-10 w-full h-auto object-contain transition-transform duration-1000 ease-[0.16,1,0.3,1] group-hover:scale-105 drop-shadow-xl" />
      </div>
      
      <div className="p-8 flex flex-col flex-1">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">{name}</h3>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{desc}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Từ</p>
            <p className="text-lg font-bold text-foreground mt-1">{price} ₫</p>
          </div>
        </div>
        
        <div className="mt-8 grid grid-cols-4 gap-2 border-y border-muted py-6">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground tracking-tighter">{range}<span className="text-[10px] text-muted-foreground ml-1">km</span></p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Quãng đường</p>
          </div>
          <div className="text-center border-l border-muted">
            <p className="text-lg font-bold text-foreground tracking-tighter">{battery}<span className="text-[10px] text-muted-foreground ml-1">kWh</span></p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Dung lượng pin</p>
          </div>
          <div className="text-center border-l border-muted">
            <p className="text-lg font-bold text-foreground tracking-tighter">{horsepower}<span className="text-[10px] text-muted-foreground ml-1">hp</span></p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Công suất</p>
          </div>
          <div className="text-center border-l border-muted">
            <p className="text-lg font-bold text-foreground tracking-tighter">{seats}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Chỗ ngồi</p>
          </div>
        </div>
        
        <div className="mt-8 grid grid-cols-2 gap-3 mt-auto">
          <Button variant="default" className="w-full bg-foreground text-background hover:bg-foreground/90 font-bold h-11"><Info size={16} className="mr-2"/> Chi tiết</Button>
          <Button variant="outline" className="w-full font-bold h-11"><Calendar size={16} className="mr-2"/> Lái thử</Button>
          <Button variant="outline" className="w-full font-bold h-11 border-muted-foreground/20"><Scale size={16} className="mr-2"/> So sánh</Button>
          <Button variant="outline" className="w-full font-bold h-11 border-muted-foreground/20"><Calculator size={16} className="mr-2"/> Dự toán</Button>
        </div>
      </div>
    </article>
  )
}
