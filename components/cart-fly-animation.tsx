'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ShoppingCart } from 'lucide-react'
import {
  CART_ANIMATION_CANCEL,
  CART_ANIMATION_COMPLETE,
  CART_ANIMATION_LAUNCH,
  CART_ANIMATION_PREPARE,
  type CartAnimationOrigin,
  type CartAnimationPrepareDetail,
  type CartAnimationResolutionDetail,
} from '@/lib/cart/animation'

type FlyingCart = {
  id: string
  origin: CartAnimationOrigin
  sourceElement?: HTMLElement
  target?: CartAnimationOrigin
  quantity: number
  phase: 'emerging' | 'flying' | 'cancelled'
  preparedAt: number
}

const FLYING_CART_SIZE = 44
const VIEWPORT_EDGE_GAP = 12
const RESTING_OFFSET = { x: 7, y: -18 }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function cubicPoint(
  start: CartAnimationOrigin,
  controlOne: CartAnimationOrigin,
  controlTwo: CartAnimationOrigin,
  end: CartAnimationOrigin,
  progress: number,
) {
  const remaining = 1 - progress
  return {
    x:
      remaining ** 3 * start.x
      + 3 * remaining ** 2 * progress * controlOne.x
      + 3 * remaining * progress ** 2 * controlTwo.x
      + progress ** 3 * end.x,
    y:
      remaining ** 3 * start.y
      + 3 * remaining ** 2 * progress * controlOne.y
      + 3 * remaining * progress ** 2 * controlTwo.y
      + progress ** 3 * end.y,
  }
}

function targetPosition() {
  const target = document.querySelector<HTMLElement>(
    '[data-cart-animation-target="true"]',
  )
  if (!target) return null

  const rect = target.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function trackedSourcePosition(element?: HTMLElement) {
  if (!element?.isConnected) return null

  const rect = element.getBoundingClientRect()
  const halfCartSize = FLYING_CART_SIZE / 2
  return {
    x: clamp(
      rect.left + rect.width * 0.72,
      VIEWPORT_EDGE_GAP + halfCartSize - RESTING_OFFSET.x,
      window.innerWidth
        - VIEWPORT_EDGE_GAP
        - halfCartSize
        - RESTING_OFFSET.x,
    ),
    y: clamp(
      rect.bottom - Math.min(8, rect.height * 0.16),
      VIEWPORT_EDGE_GAP + halfCartSize - RESTING_OFFSET.y,
      window.innerHeight
        - VIEWPORT_EDGE_GAP
        - halfCartSize
        - RESTING_OFFSET.y,
    ),
  }
}

export function CartFlyAnimation() {
  const [items, setItems] = useState<FlyingCart[]>([])
  const itemsRef = useRef<FlyingCart[]>([])
  const timers = useRef(new Map<string, number>())
  const completedIds = useRef(new Set<string>())
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const removeTimer = (id: string) => {
      const timer = timers.current.get(id)
      if (timer !== undefined) window.clearTimeout(timer)
      timers.current.delete(id)
    }

    const handlePrepare = (event: Event) => {
      const { id, origin, sourceElement } = (
        event as CustomEvent<CartAnimationPrepareDetail>
      ).detail
      completedIds.current.delete(id)
      const nextItems = [
        ...itemsRef.current.filter((item) => item.id !== id),
        {
          id,
          origin: trackedSourcePosition(sourceElement) ?? origin,
          sourceElement,
          quantity: 1,
          phase: 'emerging',
          preparedAt: performance.now(),
        } satisfies FlyingCart,
      ]
      itemsRef.current = nextItems
      setItems(nextItems)
    }

    const handleLaunch = (event: Event) => {
      const { id, quantity } = (
        event as CustomEvent<CartAnimationResolutionDetail>
      ).detail

      const item = itemsRef.current.find((entry) => entry.id === id)
      if (!item) return

      removeTimer(id)
      const target = targetPosition()
      if (!target) {
        const nextItems = itemsRef.current.filter(
          (entry) => entry.id !== id,
        )
        itemsRef.current = nextItems
        setItems(nextItems)
        window.dispatchEvent(
          new CustomEvent<CartAnimationResolutionDetail>(
            CART_ANIMATION_COMPLETE,
            { detail: { id, quantity } },
          ),
        )
        return
      }

      const nextItems = itemsRef.current.map((entry) => (
        entry.id === id
          ? {
              ...entry,
              origin: trackedSourcePosition(entry.sourceElement) ?? entry.origin,
              phase: 'flying' as const,
              target,
              quantity,
            }
          : entry
      ))
      itemsRef.current = nextItems
      setItems(nextItems)
    }

    const handleCancel = (event: Event) => {
      const { id } = (event as CustomEvent<{ id: string }>).detail
      removeTimer(id)
      const cancelledItems = itemsRef.current.map((item) => (
        item.id === id ? { ...item, phase: 'cancelled' } : item
      )) as FlyingCart[]
      itemsRef.current = cancelledItems
      setItems(cancelledItems)
      const timer = window.setTimeout(() => {
        timers.current.delete(id)
        const nextItems = itemsRef.current.filter((item) => item.id !== id)
        itemsRef.current = nextItems
        setItems(nextItems)
      }, shouldReduceMotion ? 20 : 260)
      timers.current.set(id, timer)
    }

    window.addEventListener(CART_ANIMATION_PREPARE, handlePrepare)
    window.addEventListener(CART_ANIMATION_LAUNCH, handleLaunch)
    window.addEventListener(CART_ANIMATION_CANCEL, handleCancel)
    return () => {
      window.removeEventListener(CART_ANIMATION_PREPARE, handlePrepare)
      window.removeEventListener(CART_ANIMATION_LAUNCH, handleLaunch)
      window.removeEventListener(CART_ANIMATION_CANCEL, handleCancel)
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    }
  }, [shouldReduceMotion])

  useEffect(() => {
    let animationFrame: number | null = null

    const updateTrackedOrigins = () => {
      animationFrame = null
      let changed = false
      const nextItems = itemsRef.current.map((item) => {
        if (item.phase !== 'emerging') return item
        const nextOrigin = trackedSourcePosition(item.sourceElement)
        if (
          !nextOrigin
          || (
            Math.abs(nextOrigin.x - item.origin.x) < 0.5
            && Math.abs(nextOrigin.y - item.origin.y) < 0.5
          )
        ) {
          return item
        }
        changed = true
        return { ...item, origin: nextOrigin }
      })

      if (!changed) return
      itemsRef.current = nextItems
      setItems(nextItems)
    }

    const scheduleTrackedOriginUpdate = () => {
      if (animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(updateTrackedOrigins)
    }

    window.addEventListener('scroll', scheduleTrackedOriginUpdate, true)
    window.addEventListener('resize', scheduleTrackedOriginUpdate)
    return () => {
      window.removeEventListener('scroll', scheduleTrackedOriginUpdate, true)
      window.removeEventListener('resize', scheduleTrackedOriginUpdate)
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [])

  const finishFlight = (item: FlyingCart) => {
    if (item.phase !== 'flying' || completedIds.current.has(item.id)) return
    completedIds.current.add(item.id)
    const nextItems = itemsRef.current.filter(
      (entry) => entry.id !== item.id,
    )
    itemsRef.current = nextItems
    setItems(nextItems)
    window.dispatchEvent(
      new CustomEvent<CartAnimationResolutionDetail>(
        CART_ANIMATION_COMPLETE,
        {
          detail: {
            id: item.id,
            quantity: item.quantity,
          },
        },
      ),
    )
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[120] overflow-hidden"
    >
      <AnimatePresence>
        {items.map((item) => {
          const halfCartSize = FLYING_CART_SIZE / 2
          const start = {
            x: item.origin.x - halfCartSize,
            y: item.origin.y - halfCartSize,
          }
          const target = {
            x: (item.target?.x ?? item.origin.x) - halfCartSize,
            y: (item.target?.y ?? item.origin.y) - halfCartSize,
          }
          const deltaX = target.x - start.x
          const deltaY = target.y - start.y
          const distance = Math.hypot(deltaX, deltaY)
          const flightDuration = clamp(0.7 + distance / 1750, 0.88, 1.3)
          const flightStart = {
            x: start.x + RESTING_OFFSET.x,
            y: start.y + RESTING_OFFSET.y,
          }
          const controlOne = {
            x: flightStart.x + deltaX * 0.14,
            y: flightStart.y + deltaY * 0.23,
          }
          const controlTwo = {
            x: flightStart.x + deltaX * 0.72,
            y: target.y + clamp(distance * 0.1, 44, 92),
          }
          const pathTimes = Array.from({ length: 11 }, (_, index) => index / 10)
          const pathProgress = pathTimes.map((time) => time ** 1.65)
          const flightPath = pathProgress.map((progress) => cubicPoint(
            flightStart,
            controlOne,
            controlTwo,
            target,
            progress,
          ))
          const isInitialEmergence = item.phase === 'emerging'
            && performance.now() - item.preparedAt < 700

          const animate = shouldReduceMotion
            ? item.phase === 'flying'
              ? {
                  x: target.x,
                  y: target.y,
                  opacity: 1,
                  scale: 0.52,
                }
              : item.phase === 'cancelled'
                ? { opacity: 0, scale: 0.7 }
                : { x: start.x, y: start.y - 10, opacity: 1, scale: 1 }
            : item.phase === 'flying'
              ? {
                  x: flightPath.map((point) => point.x),
                  y: flightPath.map((point) => point.y),
                  opacity: pathProgress.map(() => 1),
                  scale: pathProgress.map((progress) => (
                    progress < 0.3
                      ? 1 + (progress / 0.3) * 0.08
                      : 1.08 - ((progress - 0.3) / 0.7) * 0.56
                  )),
                  rotate: pathProgress.map(
                    (progress) => -7 * Math.sin(Math.PI * progress),
                  ),
                }
              : item.phase === 'cancelled'
                ? {
                    x: start.x,
                    y: start.y + 12,
                    opacity: 0,
                    scale: 0.55,
                    rotate: -12,
                  }
                : isInitialEmergence
                  ? {
                      x: [start.x, start.x - 2, start.x + RESTING_OFFSET.x],
                      y: [start.y + 18, start.y - 9, start.y + RESTING_OFFSET.y],
                      opacity: [0, 1, 1],
                      scale: [0.35, 1.14, 1],
                      rotate: [-18, 7, 0],
                    }
                  : {
                      x: start.x + RESTING_OFFSET.x,
                      y: start.y + RESTING_OFFSET.y,
                      opacity: 1,
                      scale: 1,
                      rotate: 0,
                    }

          return (
            <motion.div
              key={item.id}
              initial={{
                x: start.x,
                y: start.y + 18,
                opacity: 0,
                scale: 0.35,
                rotate: -18,
              }}
              animate={animate}
              exit={{
                opacity: 0,
                scale: 0.44,
                transition: { duration: shouldReduceMotion ? 0.01 : 0.12 },
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0.12 }
                  : item.phase === 'flying'
                    ? {
                        duration: flightDuration,
                        times: pathTimes,
                        ease: 'linear',
                      }
                    : item.phase === 'cancelled'
                      ? { duration: 0.24, ease: [0.7, 0, 0.84, 0] }
                      : isInitialEmergence
                        ? {
                          duration: 0.68,
                          times: [0, 0.72, 1],
                          ease: [0.16, 1, 0.3, 1],
                        }
                        : { duration: 0.12, ease: 'linear' }
              }
              onAnimationComplete={() => finishFlight(item)}
              className="absolute left-0 top-0"
            >
              <motion.span
                className="absolute bottom-[-7px] left-1/2 h-3 w-9 -translate-x-1/2 rounded-[50%] bg-brand-500/30 blur-[2px]"
                animate={
                  shouldReduceMotion
                    ? undefined
                    : {
                        scaleX: [0.55, 1.15, 0.75],
                        opacity: item.phase === 'flying'
                          ? [0.7, 0.25, 0]
                          : [0.25, 0.7, 0.35],
                      }
                }
                transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.span
                animate={
                  shouldReduceMotion || item.phase !== 'emerging'
                    ? undefined
                    : {
                        x: [-1, 2, -1],
                        y: [1, -5, 1],
                        rotate: [-2, 2, -2],
                      }
                }
                transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex h-11 w-11 items-center justify-center rounded-full border border-brand-500/25 bg-white text-slate-950 shadow-[0_10px_28px_rgba(15,23,42,0.24)]"
              >
                <ShoppingCart className="h-5 w-5" strokeWidth={2.2} />
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
              </motion.span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
