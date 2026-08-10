import { cn } from '@/lib/utils'
import type { AdminOrderStatusPresentation } from '@/lib/orders/admin-status-presentation'

export function AdminOrderStatusBadge({
  presentation,
  className,
}: {
  presentation: AdminOrderStatusPresentation
  className?: string
}) {
  return <span className={cn(
    'inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[11px] font-bold uppercase leading-4 tracking-wide',
    presentation.className,
    className,
  )}>
    {presentation.label}
  </span>
}
