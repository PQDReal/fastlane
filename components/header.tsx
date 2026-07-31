'use client'

import { ChevronDown, LogOut, Menu, Search, ShoppingCart, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { useAppStore } from '@/lib/store'
import { PopupLoginButton } from '@/components/auth/popup-login-button'
import { UserAvatar } from '@/components/auth/user-avatar'
import {
  CART_ANIMATION_CANCEL,
  CART_ANIMATION_COMPLETE,
  CART_ANIMATION_PREPARE,
  type CartAnimationResolutionDetail,
} from '@/lib/cart/animation'

export function MotionDiv(props: HTMLMotionProps<'div'>) {
  return <motion.div {...props} />
}

const links = [
  { name: 'Ô tô điện', path: '/cars' },
  { name: 'Xe máy điện', path: '/bikes' },
  { name: 'Phụ kiện', path: '/accessories' },
  { name: 'Khuyến mãi', path: '/promotions' },
  { name: 'Dự toán chi phí', path: '/cost-estimator' },
  { name: 'Đặt lịch lái thử', path: '/test-drive' },
  { name: 'So sánh xe', path: '/compare' },
]


export function Header() {
  const { user, isLoading: userLoading } = useUser()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const {
    setSearchModalOpen,
    getCartCount,
    loadCart,
    cartLoaded,
    syncCartOwner,
  } = useAppStore()
  const userSubject = typeof user?.sub === 'string' ? user.sub : null
  const cartCount = getCartCount()
  const cartCountRef = useRef(cartCount)
  const pendingCartAnimationsRef = useRef(0)
  const [displayedCartCount, setDisplayedCartCount] = useState(cartCount)
  cartCountRef.current = cartCount

  // Header is transparent on homepage and car/bike detail pages
  const isTransparentPage = pathname === '/' || /^\/(cars|bikes)\/[^\/]+$/.test(pathname)
  const accountLabel = user?.name?.trim() || user?.email?.trim() || 'Tài khoản'

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (userLoading) return

    const ownerChanged = syncCartOwner(userSubject)
    if (userSubject && (ownerChanged || !cartLoaded)) {
      void loadCart(userSubject)
    }
  }, [cartLoaded, loadCart, syncCartOwner, userLoading, userSubject])

  useEffect(() => {
    if (pendingCartAnimationsRef.current === 0) {
      setDisplayedCartCount(cartCount)
    }
  }, [cartCount])

  useEffect(() => {
    const handlePrepare = (_event: Event) => {
      pendingCartAnimationsRef.current += 1
    }
    const handleCancel = (_event: Event) => {
      pendingCartAnimationsRef.current = Math.max(
        0,
        pendingCartAnimationsRef.current - 1,
      )
      if (pendingCartAnimationsRef.current === 0) {
        window.setTimeout(() => {
          setDisplayedCartCount(cartCountRef.current)
        }, 0)
      }
    }
    const handleComplete = (event: Event) => {
      const { quantity } = (
        event as CustomEvent<CartAnimationResolutionDetail>
      ).detail
      pendingCartAnimationsRef.current = Math.max(
        0,
        pendingCartAnimationsRef.current - 1,
      )
      if (pendingCartAnimationsRef.current === 0) {
        setDisplayedCartCount(cartCountRef.current)
      } else {
        setDisplayedCartCount((count) => count + quantity)
      }
    }

    window.addEventListener(CART_ANIMATION_PREPARE, handlePrepare)
    window.addEventListener(CART_ANIMATION_CANCEL, handleCancel)
    window.addEventListener(CART_ANIMATION_COMPLETE, handleComplete)
    return () => {
      window.removeEventListener(CART_ANIMATION_PREPARE, handlePrepare)
      window.removeEventListener(CART_ANIMATION_CANCEL, handleCancel)
      window.removeEventListener(CART_ANIMATION_COMPLETE, handleComplete)
    }
  }, [])

  const headerSolid = scrolled || !isTransparentPage

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${headerSolid ? 'bg-white/95 shadow-glass backdrop-blur-md h-[74px] border-b border-black/5' : 'bg-transparent h-[92px] lg:h-[118px]'}`}>
      <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12 xl:px-14">
        <Link href="/" className="flex shrink-0 items-center gap-3 group" aria-label="FASTLANE - Trang chủ">
          <img src="/images/fastlane-logo.png" alt="Logo" className="h-8 w-auto object-contain transition-transform duration-500 group-hover:scale-105 lg:h-9" />
          <span className="font-display mt-1 text-[27px] font-bold tracking-[0.06em] text-[#9b7200] transition-opacity duration-500 group-hover:opacity-80 lg:text-[34px]">FASTLANE</span>
        </Link>

        <nav className="hidden items-center justify-center gap-6 xl:flex 2xl:gap-12">
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.path}
              className={`group relative whitespace-nowrap text-[14px] font-semibold tracking-wide 2xl:text-[16px] ${headerSolid ? 'text-slate-600' : 'text-white/80'}`}
            >
              <span className="relative inline-grid">
                <span className="col-start-1 row-start-1 transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0">
                  {link.name}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 -translate-x-2 text-[#836100] opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                >
                  {link.name}
                </span>
              </span>
              <span className="absolute -bottom-1 left-0 h-0.5 w-full origin-left scale-x-0 bg-[#836100] transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className={`flex shrink-0 items-center justify-end gap-4 transition-colors duration-500 xl:gap-6 ${headerSolid ? 'text-slate-600' : 'text-white'}`}>
          <button aria-label="Tìm kiếm" className="hover:opacity-70 transition-opacity" onClick={() => setSearchModalOpen(true)}><Search size={23} strokeWidth={2} /></button>
          <Link
            aria-label="Giỏ hàng"
            href="/cart"
            data-cart-animation-target="true"
            className="relative block transition-opacity hover:opacity-70"
          >
            <ShoppingCart size={23} strokeWidth={2} />
            <AnimatePresence initial={false} mode="popLayout">
              {displayedCartCount > 0 && (
                <motion.span
                  key={displayedCartCount}
                  initial={{ opacity: 0, scale: 0.25, y: 5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.4, y: -3 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                >
                  {displayedCartCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          {user ? (
            <div className="relative hidden items-center gap-2.5 sm:flex group cursor-pointer py-2">
              <UserAvatar picture={user.picture} name={user.name} />
              <span className="max-w-24 lg:max-w-32 truncate text-xs font-semibold" title={user.email ?? undefined}>
                {accountLabel}
              </span>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full w-48 origin-top-right rounded-xl bg-white py-2 shadow-xl ring-1 ring-black/5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <Link href="/profile" className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#836100]">
                  Hồ sơ của tôi
                </Link>
                <Link href="/profile?tab=orders" className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#836100]">
                  Lịch sử mua hàng
                </Link>
                <Link href="/profile?tab=car-orders" className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[#836100]">
                  Lịch sử mua xe
                </Link>
                <div className="my-1 border-t border-gray-100"></div>
                <a href="/auth/logout" className="block px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  Đăng xuất
                </a>
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-3">
              {/* <UserRound aria-hidden="true" size={23} strokeWidth={2} /> */}
              <PopupLoginButton className={`whitespace-nowrap rounded-full px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm transition-all active:scale-95 lg:px-7 lg:py-3 lg:text-[11px] ${headerSolid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}>Đăng nhập
              </PopupLoginButton>
            </div>
          )}
          <button className="xl:hidden hover:opacity-70 transition-opacity" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute left-0 top-full w-full border-t border-slate-200 bg-white/95 backdrop-blur-md p-8 shadow-2xl xl:hidden flex flex-col gap-6"
          >
            {links.map((link) => (
              <Link
                onClick={() => setOpen(false)}
                key={link.name}
                className="block text-lg font-medium text-slate-900 hover:text-brand-600 transition-colors"
                href={link.path}
              >
                {link.name}
              </Link>
            ))}
            {user ? <a className="border-t border-slate-200 pt-6 text-lg font-bold text-brand-600" href="/auth/logout">Đăng xuất</a> : <PopupLoginButton onSuccess={()=>setOpen(false)} className="border-t border-slate-200 pt-6 text-left text-lg font-bold text-brand-600">Đăng nhập</PopupLoginButton>}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
