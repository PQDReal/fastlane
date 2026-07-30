export const CART_ANIMATION_PREPARE = 'fastlane:cart-animation-prepare'
export const CART_ANIMATION_LAUNCH = 'fastlane:cart-animation-launch'
export const CART_ANIMATION_CANCEL = 'fastlane:cart-animation-cancel'
export const CART_ANIMATION_COMPLETE = 'fastlane:cart-animation-complete'

export type CartAnimationOrigin = {
  x: number
  y: number
}

export type CartAnimationPrepareDetail = {
  id: string
  origin: CartAnimationOrigin
  sourceElement?: HTMLElement
}

export type CartAnimationResolutionDetail = {
  id: string
  quantity: number
}

function animationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function prepareCartAnimation(element: HTMLElement) {
  if (typeof window === 'undefined') return ''

  const rect = element.getBoundingClientRect()
  const id = animationId()
  const detail: CartAnimationPrepareDetail = {
    id,
    sourceElement: element,
    origin: {
      x: rect.left + rect.width * 0.72,
      y: rect.bottom - Math.min(8, rect.height * 0.16),
    },
  }

  window.dispatchEvent(
    new CustomEvent<CartAnimationPrepareDetail>(
      CART_ANIMATION_PREPARE,
      { detail },
    ),
  )
  return id
}

export function launchCartAnimation(id: string, quantity: number) {
  if (typeof window === 'undefined' || !id) return
  window.dispatchEvent(
    new CustomEvent<CartAnimationResolutionDetail>(
      CART_ANIMATION_LAUNCH,
      { detail: { id, quantity } },
    ),
  )
}

export function cancelCartAnimation(id: string) {
  if (typeof window === 'undefined' || !id) return
  window.dispatchEvent(
    new CustomEvent<{ id: string }>(
      CART_ANIMATION_CANCEL,
      { detail: { id } },
    ),
  )
}
