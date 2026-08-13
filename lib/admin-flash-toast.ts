import type { ToastKind } from '@/components/ui/toast'

export const ADMIN_FLASH_TOAST_KEY = 'fastlane.admin.flash-toast.v1'

export type AdminFlashToast = {
  kind: ToastKind
  title: string
  message?: string
}

type FlashToastStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

function isToastKind(value: unknown): value is ToastKind {
  return value === 'success' || value === 'error' || value === 'warning'
}

export function storeAdminFlashToast(
  storage: FlashToastStorage,
  toast: AdminFlashToast,
) {
  try {
    storage.setItem(ADMIN_FLASH_TOAST_KEY, JSON.stringify(toast))
    return true
  } catch {
    return false
  }
}

export function consumeAdminFlashToast(
  storage: FlashToastStorage,
): AdminFlashToast | null {
  let serialized: string | null
  try {
    serialized = storage.getItem(ADMIN_FLASH_TOAST_KEY)
    storage.removeItem(ADMIN_FLASH_TOAST_KEY)
  } catch {
    return null
  }
  if (!serialized) return null

  try {
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const toast = value as Record<string, unknown>
    if (!isToastKind(toast.kind) || typeof toast.title !== 'string' || !toast.title.trim()) return null
    if (toast.message !== undefined && typeof toast.message !== 'string') return null
    return {
      kind: toast.kind,
      title: toast.title,
      ...(toast.message ? { message: toast.message } : {}),
    }
  } catch {
    return null
  }
}
