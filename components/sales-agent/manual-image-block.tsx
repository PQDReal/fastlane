import React from 'react'
import Image from 'next/image'

interface ManualImageBlockProps {
  imageUrl: string
  caption?: string
}

export function ManualImageBlock({ imageUrl, caption }: ManualImageBlockProps) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="relative aspect-video w-full bg-slate-50">
        <Image
          src={imageUrl}
          alt={caption || 'Minh họa hướng dẫn sử dụng'}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
      {caption && (
        <div className="bg-slate-50 px-3 py-2 text-center border-t border-slate-100">
          <p className="text-xs text-slate-500">{caption}</p>
        </div>
      )}
    </div>
  )
}
