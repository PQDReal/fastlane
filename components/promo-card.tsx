'use client'

import { Check, Clock, Copy, Tag } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'

type Props = {
  title: string
  desc: string
  type: string
  expires: string
  image: string
  code: string
  discount: string
}

export function PromoCard({ title, desc, type, expires, image, code, discount }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const input = document.createElement('textarea')
      input.value = code
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-black/5 bg-background shadow-sm transition-all duration-700 hover:shadow-glass-hover sm:flex-row">
      <div className="relative aspect-[1239/693] w-full flex-none self-start overflow-hidden bg-slate-100 sm:w-2/5">
        <div className="absolute inset-0 z-10 bg-black/10 transition-colors duration-500 group-hover:bg-transparent" />
        <img src={image} alt={title} className="h-full w-full object-contain transition-transform duration-1000 ease-[0.16,1,0.3,1] group-hover:scale-[1.02]" />
        <div className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-md">
          <Tag size={12} className="text-brand-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-900">{type}</span>
        </div>
        <div className="absolute bottom-4 right-4 z-20 rounded-2xl bg-slate-950/90 px-4 py-3 text-right text-white shadow-lg backdrop-blur-md">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Giá trị ưu đãi</span>
          <strong className="mt-0.5 block text-2xl font-black tracking-tight text-brand-400">{discount}</strong>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-6 sm:p-6">
        <span className="mb-1 font-mono text-xs font-bold tracking-wider text-brand-600">{code}</span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{desc}</p>
        <div className="mt-4 flex flex-col gap-3 border-t border-muted pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600">
            <Clock size={16} />
            Hết hạn: {expires}
          </div>
          <Button type="button" onClick={() => void copyCode()} aria-label={`Sao chép mã khuyến mãi ${code}`} className={`h-11 min-w-40 rounded-full px-6 font-bold transition-colors ${copied ? 'bg-emerald-600 text-white hover:bg-emerald-600' : 'bg-foreground text-background hover:bg-foreground/90'}`}>
            {copied ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
            {copied ? 'Đã sao chép' : code}
          </Button>
        </div>
      </div>
    </article>
  )
}