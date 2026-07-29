'use client'

import { UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'

type UserAvatarProps = {
  picture?: string | null
  name?: string | null
  className?: string
  iconClassName?: string
  iconSize?: number
}

export function UserAvatar({
  picture,
  name,
  className = 'h-7 w-7',
  iconClassName = 'text-slate-500',
  iconSize = 14,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [picture])

  const canShowImage = Boolean(picture?.trim()) && !imageFailed

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 shadow-sm ring-1 ring-black/5`}
    >
      {canShowImage ? (
        <img
          src={picture!}
          alt={name ? `Ảnh đại diện của ${name}` : 'Ảnh đại diện tài khoản'}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <UserRound
          aria-hidden="true"
          size={iconSize}
          strokeWidth={2.5}
          className={iconClassName}
        />
      )}
    </span>
  )
}
