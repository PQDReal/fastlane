'use client'

import { ChevronDown, LogOut, Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { useAppStore } from '@/lib/store'

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
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const { setSearchModalOpen, setCartDrawerOpen, getCartCount } = useAppStore()
  const isHomePage = pathname === '/'
  const accountLabel = user?.name?.trim() || user?.email?.trim() || 'Tài khoản'

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const headerSolid = scrolled || !isHomePage

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${headerSolid ? 'bg-white/95 shadow-glass backdrop-blur-md h-[74px] border-b border-black/5' : 'bg-transparent h-[100px]'}`}>
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 lg:px-8 xl:px-12 gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-3 group" aria-label="FASTLANE - Trang chủ">
          <img src="/images/fastlane-logo.png" alt="Logo" className="h-8 w-auto object-contain transition-transform duration-500 group-hover:scale-105" />
          <span className="font-display text-[32px] font-bold tracking-[0.08em] text-[#836100] transition-opacity duration-500 group-hover:opacity-80 mt-1">FASTLANE</span>
        </Link>

        <nav className="hidden items-center justify-center gap-4 xl:gap-6 xl:flex">
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.path}
              className={`relative text-[13px] font-semibold tracking-wide transition-colors whitespace-nowrap group ${headerSolid ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}
            >
              {link.name}
              <span className={`absolute -bottom-1 left-0 h-px transition-all duration-300 w-0 group-hover:w-full ${headerSolid ? 'bg-slate-900' : 'bg-white'}`}></span>
            </Link>
          ))}
        </nav>

        <div className={`flex shrink-0 items-center justify-end gap-3 xl:gap-5 transition-colors duration-500 ${headerSolid ? 'text-slate-600' : 'text-white'}`}>
          <button aria-label="Tìm kiếm" className="hover:opacity-70 transition-opacity" onClick={() => setSearchModalOpen(true)}><Search size={18} strokeWidth={2} /></button>
          <button aria-label="Giỏ hàng" className="relative hidden sm:block hover:opacity-70 transition-opacity" onClick={() => setCartDrawerOpen(true)}>
            <ShoppingCart size={18} strokeWidth={2} />
            {getCartCount() > 0 && (
              <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {getCartCount()}
              </span>
            )}
          </button>
          {user ? (
            <div className="relative hidden items-center gap-2.5 sm:flex group cursor-pointer py-2">
              {user.picture ? (
                <img src={user.picture} alt={user.name || ''} className="h-7 w-7 rounded-full object-cover shadow-sm ring-1 ring-black/5" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center ring-1 ring-black/5">
                  <UserRound aria-hidden="true" size={14} strokeWidth={2.5} className="text-slate-500" />
                </div>
              )}
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
                <div className="my-1 border-t border-gray-100"></div>
                <a href="/auth/logout" className="block px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  Đăng xuất
                </a>
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-3">
              <UserRound aria-hidden="true" size={18} strokeWidth={2} />
              <a
                className={`rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest shadow-sm transition-all active:scale-95 whitespace-nowrap ${headerSolid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}
                href="/auth/login"
              >
                Đăng nhập
              </a>
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
            <a
              className="border-t border-slate-200 pt-6 text-lg font-bold text-brand-600"
              href={user ? '/auth/logout' : '/auth/login'}
            >
              {user ? 'Đăng xuất' : 'Đăng nhập'}
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
