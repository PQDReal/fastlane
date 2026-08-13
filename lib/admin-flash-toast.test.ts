import { describe, expect, it } from 'vitest'

import {
  ADMIN_FLASH_TOAST_KEY,
  consumeAdminFlashToast,
  storeAdminFlashToast,
} from '@/lib/admin-flash-toast'

function storage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(ADMIN_FLASH_TOAST_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('admin flash toast', () => {
  it('carries one success notification across navigation', () => {
    const target = storage()
    storeAdminFlashToast(target, {
      kind: 'success',
      title: 'Đã cập nhật phụ kiện',
      message: 'Thay đổi đã được lưu thành công.',
    })

    expect(consumeAdminFlashToast(target)).toEqual({
      kind: 'success',
      title: 'Đã cập nhật phụ kiện',
      message: 'Thay đổi đã được lưu thành công.',
    })
    expect(consumeAdminFlashToast(target)).toBeNull()
  })

  it('removes malformed payloads without showing a toast', () => {
    const target = storage('{"kind":"unknown","title":42}')

    expect(consumeAdminFlashToast(target)).toBeNull()
    expect(target.getItem(ADMIN_FLASH_TOAST_KEY)).toBeNull()
  })

  it('does not turn a successful save into an error when storage is unavailable', () => {
    const unavailable = {
      getItem: () => { throw new Error('Storage disabled') },
      setItem: () => { throw new Error('Storage disabled') },
      removeItem: () => { throw new Error('Storage disabled') },
    }

    expect(storeAdminFlashToast(unavailable, {
      kind: 'success',
      title: 'Đã cập nhật phụ kiện',
    })).toBe(false)
    expect(consumeAdminFlashToast(unavailable)).toBeNull()
  })
})
