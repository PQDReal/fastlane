'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from './ui/button'
import {
  BatteryCharging,
  Zap,
  Gauge,
  Clock,
  Settings,
  ShieldCheck,
  Sparkles,
  Play
} from 'lucide-react'

// Define supported blocks
export interface LandingBlock {
  id: string
  type: 'HERO_BANNER' | 'TEXT_IMAGE_SPLIT' | 'HIGHLIGHT_GRID' | 'IMAGE_GALLERY' | 'VIDEO_EMBED'
  data: any
}

interface LandingPageRendererProps {
  blocks: LandingBlock[]
}

export default function LandingPageRenderer({ blocks }: LandingPageRendererProps) {
  if (!blocks || blocks.length === 0) return null

  return (
    <div className="w-full flex flex-col overflow-hidden">
      {blocks.map((block, index) => {
        const key = block.id || `block-${index}`
        switch (block.type) {
          case 'HERO_BANNER':
            return <HeroBannerBlock key={key} data={block.data} />
          case 'TEXT_IMAGE_SPLIT':
            return <TextImageSplitBlock key={key} data={block.data} />
          case 'HIGHLIGHT_GRID':
            return <HighlightGridBlock key={key} data={block.data} />
          case 'IMAGE_GALLERY':
            return <ImageGalleryBlock key={key} data={block.data} />
          case 'VIDEO_EMBED':
            return <VideoEmbedBlock key={key} data={block.data} />
          default:
            return null
        }
      })}
    </div>
  )
}

/* 1. HERO_BANNER BLOCK */
function HeroBannerBlock({ data }: { data: any }) {
  const {
    title = 'Chạm vào tương lai',
    subtitle = 'Đột phá công nghệ xanh vượt trội.',
    backgroundImage = '',
    ctaLabel = 'Đặt mua ngay',
    ctaLink = '#deposit',
    textColor = 'light',
  } = data

  const isLight = textColor === 'light'

  return (
    <section className="relative min-h-[75vh] w-full flex items-center justify-center py-20 px-6 sm:px-12 bg-slate-900 overflow-hidden">
      {/* Background Image */}
      {backgroundImage ? (
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImage}
            alt={title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-slate-950/20" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-900/40 to-slate-950 z-0" />
      )}

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
        <h1 className={`text-4xl sm:text-6xl font-extrabold tracking-tight ${isLight ? 'text-white' : 'text-slate-900'} leading-tight`}>
          {title}
        </h1>
        <p className={`text-lg sm:text-2xl max-w-2xl mx-auto font-medium ${isLight ? 'text-slate-200' : 'text-slate-700'}`}>
          {subtitle}
        </p>
        <div className="pt-4">
          <Button asChild className="rounded-full bg-brand-600 font-bold text-white hover:bg-brand-700 px-8 py-6 text-md shadow-lg shadow-brand-500/20 active:scale-95 transition">
            <Link href={ctaLink}>{ctaLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

/* 2. TEXT_IMAGE_SPLIT BLOCK */
function TextImageSplitBlock({ data }: { data: any }) {
  const {
    title = 'Thiết kế thời thượng',
    description = 'Từng đường nét tinh xảo, tối ưu hóa khí động học đem lại sự sang trọng và trải nghiệm lái tối tân.',
    image = '',
    imagePosition = 'right',
    backgroundColor = '#ffffff',
  } = data

  const isLeft = imagePosition === 'left'

  return (
    <section className="py-20 px-6 sm:px-12 w-full" style={{ backgroundColor }}>
      <div className="max-w-[1440px] mx-auto grid md:grid-cols-2 gap-12 items-center">
        {/* Image Column */}
        <div className={`w-full flex justify-center ${isLeft ? 'md:order-1' : 'md:order-2'}`}>
          {image ? (
            <div className="relative w-full max-w-lg aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border border-slate-100 bg-slate-50">
              <img
                src={image}
                alt={title}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
          ) : (
            <div className="w-full max-w-lg aspect-[4/3] rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              Chưa tải hình ảnh lên
            </div>
          )}
        </div>

        {/* Text Column */}
        <div className={`space-y-6 ${isLeft ? 'md:order-2' : 'md:order-1'}`}>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
            {title}
          </h2>
          <p className="text-md sm:text-lg text-slate-600 leading-relaxed font-medium">
            {description}
          </p>
        </div>
      </div>
    </section>
  )
}

/* 3. HIGHLIGHT_GRID BLOCK */
function HighlightGridBlock({ data }: { data: any }) {
  const {
    title = 'Đặc quyền công nghệ vượt trội',
    items = [
      { label: 'Quãng đường', value: '198 km', description: 'Mỗi lần sạc đầy pin LFP thế hệ mới' },
      { label: 'Tốc độ tối đa', value: '78 km/h', description: 'Vận hành mạnh mẽ, tăng tốc êm ái' },
      { label: 'Thời gian sạc', value: '6 giờ', description: 'Sạc tiêu chuẩn tại nhà hoặc trạm sạc' }
    ]
  } = data

  // Dynamic icon helper
  const getIcon = (label: string) => {
    const l = label.toLowerCase()
    if (l.includes('quãng đường') || l.includes('km') || l.includes('pin') || l.includes('điện')) return <BatteryCharging className="h-6 w-6 text-brand-600" />
    if (l.includes('tốc độ') || l.includes('nhanh') || l.includes('km/h')) return <Gauge className="h-6 w-6 text-brand-600" />
    if (l.includes('sạc') || l.includes('giờ') || l.includes('thời gian')) return <Clock className="h-6 w-6 text-brand-600" />
    if (l.includes('công suất') || l.includes('động cơ') || l.includes('w')) return <Zap className="h-6 w-6 text-brand-600" />
    if (l.includes('an toàn') || l.includes('phanh') || l.includes('khóa')) return <ShieldCheck className="h-6 w-6 text-brand-600" />
    return <Sparkles className="h-6 w-6 text-brand-600" />
  }

  return (
    <section className="py-20 px-6 sm:px-12 w-full bg-slate-50 border-y border-slate-100">
      <div className="max-w-[1440px] mx-auto space-y-12">
        {title && (
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h2>
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item: any, i: number) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm flex flex-col items-start gap-4 hover:shadow-md transition">
              <div className="p-3 bg-brand-50 rounded-xl">
                {getIcon(item.label || item.value)}
              </div>
              <div>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{item.value}</p>
                <p className="text-sm font-bold text-slate-800 uppercase tracking-wide mt-1">{item.label}</p>
                {item.description && (
                  <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* 4. IMAGE_GALLERY BLOCK */
function ImageGalleryBlock({ data }: { data: any }) {
  const {
    title = 'Bộ sưu tập hình ảnh',
    images = []
  } = data

  if (!images || images.length === 0) return null

  return (
    <section className="py-20 px-6 sm:px-12 w-full bg-white">
      <div className="max-w-[1440px] mx-auto space-y-10">
        {title && (
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h2>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((img: string, i: number) => (
            <div key={i} className="aspect-[4/3] rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-slate-50">
              <img
                src={img}
                alt={`${title} - ${i + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* 5. VIDEO_EMBED BLOCK */
function VideoEmbedBlock({ data }: { data: any }) {
  const {
    title = 'Khám phá video thực tế',
    videoUrl = ''
  } = data

  const getYoutubeId = (url: string) => {
    if (!url) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
  }

  const embedId = getYoutubeId(videoUrl)

  return (
    <section className="py-20 px-6 sm:px-12 w-full bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto space-y-8 text-center">
        {title && (
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
        )}

        {embedId ? (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-black">
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${embedId}`}
              title={title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Play className="h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Chưa có liên kết video YouTube hợp lệ</p>
          </div>
        )}
      </div>
    </section>
  )
}
