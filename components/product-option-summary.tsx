import React from 'react'

import type { SelectedProductOption } from '@/lib/cart/types'
import { cn } from '@/lib/utils'

type ProductOptionSummaryProps = {
  options: SelectedProductOption[]
  className?: string
  itemClassName?: string
  labelClassName?: string
}

export function ProductOptionSummary({
  options,
  className,
  itemClassName,
  labelClassName,
}: ProductOptionSummaryProps) {
  if (options.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      {options.map((option) => (
        <p
          key={`${option.groupId}:${option.valueId}`}
          className={cn('text-xs text-slate-500', itemClassName)}
        >
          <span className={cn('font-semibold text-slate-700', labelClassName)}>
            {option.groupName}:
          </span>{' '}
          {option.valueName}
        </p>
      ))}
    </div>
  )
}
