import { Heart, ShoppingCart, Eye, Star } from 'lucide-react'
import { Button } from './ui/button'

export function AccessoryCard({ name, price, oldPrice, image, rating, stock, discount }: any) {
  return (
    <article className="group flex flex-col bg-background rounded-2xl border border-black/5 overflow-hidden shadow-sm hover:shadow-glass-hover transition-all duration-500 relative">
      {discount && (
        <div className="absolute top-4 left-4 z-20 bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
          -{discount}%
        </div>
      )}
      <button className="absolute top-4 right-4 z-20 h-8 w-8 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-white transition-colors shadow-sm">
        <Heart size={16} />
      </button>
      
      <div className="relative aspect-square w-full bg-muted flex items-center justify-center p-6 overflow-hidden">
        <img src={image} alt={name} className="relative z-10 w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 drop-shadow-md" />
        
        {/* Quick View Overlay */}
        <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
          <Button variant="outline" className="bg-white/95 backdrop-blur-sm border-none shadow-sm hover:bg-white text-sm font-semibold rounded-full px-6 h-10 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
            <Eye size={16} className="mr-2" /> Xem nhanh
          </Button>
        </div>
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-1 mb-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={12} className={i < Math.floor(rating) ? "fill-brand-500 text-brand-500" : "fill-muted text-muted"} />
          ))}
          <span className="text-xs text-muted-foreground ml-2 font-medium">{rating}</span>
        </div>
        
        <h3 className="text-lg font-bold tracking-tight text-foreground line-clamp-2 mb-2">{name}</h3>
        
        <div className="flex items-end gap-3 mt-auto mb-6">
          <p className="text-xl font-bold text-brand-700">{price} ₫</p>
          {oldPrice && (
            <p className="text-sm font-medium text-muted-foreground line-through mb-0.5">{oldPrice} ₫</p>
          )}
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stock > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {stock > 0 ? 'Còn hàng' : 'Hết hàng'}
            </span>
          </div>
          
          <Button variant="default" size="icon" className="bg-foreground text-background hover:bg-foreground/90 rounded-full h-10 w-10 shrink-0" disabled={stock === 0}>
            <ShoppingCart size={16} />
          </Button>
        </div>
      </div>
    </article>
  )
}
