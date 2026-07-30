'use client'

import { Share2 } from 'lucide-react'
import { useRef, useState } from 'react'

import {
  ToastViewport,
  type ToastMessage,
} from '../../../components/ui/toast'

export function BikeShareButton({
  productName,
}: {
  productName: string
}) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextToastId = useRef(0)

  const dismiss = (id: number) => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== id),
    )
  }

  const showToast = (
    kind: ToastMessage['kind'],
    title: string,
    message?: string,
  ) => {
    const id = ++nextToastId.current

    setToasts([{ id, kind, title, message }])
    window.setTimeout(() => dismiss(id), 3500)
  }

  const share = async () => {
    const url = window.location.href
    const title = `${productName} | FastLane`

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Khám phá xe máy điện ${productName} tại FastLane.`,
          url,
        })
        return
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      showToast(
        'success',
        'Đã sao chép liên kết',
        `Bạn có thể chia sẻ trang ${productName}.`,
      )
    } catch {
      showToast(
        'error',
        'Không thể sao chép liên kết',
        'Vui lòng sao chép địa chỉ trên thanh trình duyệt.',
      )
    }
  }

  return (
    <>
      <ToastViewport
        toasts={toasts}
        onClose={dismiss}
      />
      <button
        type="button"
        onClick={() => void share()}
        aria-label={`Chia sẻ ${productName}`}
        title="Chia sẻ mẫu xe"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-white hover:text-black active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <Share2 size={18} />
      </button>
    </>
  )
}
