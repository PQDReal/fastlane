'use client'

import { ChevronDown, LogOut, Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export interface HeaderUser {
  email?: string | null
  name?: string | null
}

export function Header({ user }: { user?: HeaderUser }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
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
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-6 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-3 group" aria-label="FASTLANE - Trang chủ">
          <img src="/images/fastlane-logo.png" alt="Logo" className="h-7 w-auto object-contain transition-transform duration-500 group-hover:scale-105" />
          <span className="font-display text-2xl font-bold tracking-widest text-[#836100] transition-opacity duration-500 group-hover:opacity-80 mt-1">FASTLANE</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-10 xl:flex">
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.path}
              className={`relative text-[13px] font-semibold tracking-wide transition-colors group ${headerSolid ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}
            >
              {link.name}
              <span className={`absolute -bottom-1 left-0 h-px transition-all duration-300 w-0 group-hover:w-full ${headerSolid ? 'bg-slate-900' : 'bg-white'}`}></span>
            </Link>
          ))}
        </nav>

        <div className={`ml-auto flex items-center gap-6 xl:ml-12 transition-colors duration-500 ${headerSolid ? 'text-slate-600' : 'text-white'}`}>
          <button aria-label="Tìm kiếm" className="hover:opacity-70 transition-opacity"><Search size={18} strokeWidth={2} /></button>
          <button aria-label="Giỏ hàng" className="hidden sm:block hover:opacity-70 transition-opacity"><ShoppingCart size={18} strokeWidth={2} /></button>
          <UserRound aria-hidden="true" className="hidden sm:block" size={18} strokeWidth={2} />
          {user ? (
            <details className="group/account relative hidden sm:block">
              <summary
                className={`flex max-w-56 cursor-pointer list-none items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold shadow-sm transition-all marker:content-none [&::-webkit-details-marker]:hidden ${headerSolid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}
                title={user.email ?? undefined}
              >
                <span className="max-w-36 truncate">{accountLabel}</span>
                <ChevronDown className="shrink-0 transition-transform group-open/account:rotate-180" size={14} />
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.75rem)] min-w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tài khoản</p>
                  <p className="mt-1 max-w-48 truncate text-xs text-slate-600" title={user.email ?? undefined}>
                    {user.email || accountLabel}
                  </p>
                </div>
                <a className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50" href="/auth/logout">
                  <LogOut size={16} />
                  Đăng xuất
                </a>
              </div>
            </details>
          ) : (
            <a
              className={`hidden rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest shadow-sm transition-all active:scale-95 sm:block ${headerSolid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}
              href="/auth/login"
            >
              Đăng nhập
            </a>
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
