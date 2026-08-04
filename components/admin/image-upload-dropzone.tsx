'use client'

import { useState, useRef, ChangeEvent, DragEvent, ReactNode } from 'react'
import { Upload, Loader2, ImagePlus } from 'lucide-react'

interface ImageUploadDropzoneProps {
  onUploadSuccess: (urls: string[]) => void
  onError?: (errorMessage: string) => void
  folder?: string
  compact?: boolean
  label?: string
  disabled?: boolean
  children?: ReactNode | ((state: { isUploading: boolean }) => ReactNode)
}

export function ImageUploadDropzone({
  onUploadSuccess,
  onError,
  folder = 'fastlane/products',
  compact = false,
  label = 'Tải ảnh từ máy',
  disabled = false,
  children,
}: ImageUploadDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(
      (file) => file.size > 0 && file.type.startsWith('image/'),
    )

    if (validFiles.length === 0) {
      onError?.('Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG, WebP, GIF, AVIF).')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      validFiles.forEach((file) => formData.append('file', file))
      if (folder) formData.append('folder', folder)

      const res = await fetch('/api/v1/admin/upload', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || 'Tải ảnh lên thất bại.')
      }

      if (json.data && Array.isArray(json.data)) {
        const uploadedUrls = json.data.map((item: { url: string }) => item.url)
        onUploadSuccess(uploadedUrls)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh lên thất bại.'
      onError?.(msg)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isUploading) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (!disabled && !isUploading && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  if (children) {
    const renderedChildren = typeof children === 'function' ? children({ isUploading }) : children

    return (
      <div className="relative inline-flex">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif"
          multiple
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled && !isUploading) fileInputRef.current?.click()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (!disabled && !isUploading) fileInputRef.current?.click()
            }
          }}
          className={`relative cursor-pointer transition ${isUploading ? 'cursor-wait opacity-80' : ''}`}
        >
          {renderedChildren}
          {isUploading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-white/85 shadow-inner backdrop-blur-[1px]">
              <Loader2 size={16} className="animate-spin text-brand-600" />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="inline-flex items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif"
          multiple
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed ${
            isUploading
              ? 'border-brand-400 bg-brand-50/80 text-brand-700 animate-pulse shadow-sm'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 size={13} className="animate-spin text-brand-600" />
              <span className="font-bold text-brand-700">Đang tải lên...</span>
            </>
          ) : (
            <>
              <Upload size={13} className="text-brand-600" />
              {label}
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
      className={`group relative flex flex-col items-center justify-center rounded-md border border-dashed p-3 text-center transition cursor-pointer ${
        isDragOver
          ? 'border-brand-500 bg-brand-50/50'
          : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50/50'
      } ${disabled || isUploading ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition group-hover:scale-110">
        {isUploading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ImagePlus size={14} />
        )}
      </div>
      <p className="mt-1 text-[11px] font-medium text-slate-700">
        {isUploading ? (
          <span className="text-brand-600 font-semibold">Đang tải ảnh...</span>
        ) : (
          <>
            <span className="font-bold text-brand-700">Kéo thả</span> hoặc{' '}
            <span className="underline">chọn file từ máy</span>
          </>
        )}
      </p>
    </div>
  )
}
