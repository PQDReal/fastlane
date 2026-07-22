'use client'

import { Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion'

export function MotionDiv(props: HTMLMotionProps<'div'>) {
  return <motion.div {...props} />
}

const links = [
  'Ô tô điện',
  'Xe máy điện',
  'Phụ kiện',
  'Khuyến mãi',
  'So sánh xe',
  'Đặt lịch lái thử',
  'Hỗ trợ',
]

export interface HeaderUser {
  email?: string | null
  name?: string | null
}

export function Header({ user }: { user?: HeaderUser }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const accountLabel =
    user?.name?.trim() || user?.email?.trim() || 'Tài khoản'

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/95 shadow-glass backdrop-blur-md h-[74px] border-b border-black/5' : 'bg-transparent h-[100px]'}`}>
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-6 lg:px-12">
        <a href="/" className="flex shrink-0 items-center gap-3 group" aria-label="FASTLANE - Trang chủ">
          <img src="/images/fastlane-logo.png" alt="Logo" className="h-7 w-auto object-contain transition-transform duration-500 group-hover:scale-105" />
          <span className="font-display text-2xl font-bold tracking-widest text-[#836100] transition-opacity duration-500 group-hover:opacity-80 mt-1">FASTLANE</span>
        </a>

        <nav className="ml-auto hidden items-center gap-10 xl:flex">
          {links.map((link) => (
            <a
              key={link}
              href="#"
              className={`relative text-[13px] font-semibold tracking-wide transition-colors group ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}
            >
              {link}
              <span className={`absolute -bottom-1 left-0 h-px transition-all duration-300 w-0 group-hover:w-full ${scrolled ? 'bg-slate-900' : 'bg-white'}`}></span>
            </a>
          ))}
        </nav>

        <div className={`ml-auto flex items-center gap-6 xl:ml-12 transition-colors duration-500 ${scrolled ? 'text-slate-600' : 'text-white'}`}>
          <button aria-label="Tìm kiếm" className="hover:opacity-70 transition-opacity"><Search size={18} strokeWidth={2} /></button>
          <button aria-label="Giỏ hàng" className="hidden sm:block hover:opacity-70 transition-opacity"><ShoppingCart size={18} strokeWidth={2} /></button>
          <UserRound aria-hidden="true" className="hidden sm:block" size={18} strokeWidth={2} />
          {user ? (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="max-w-36 truncate text-xs font-semibold" title={user.email ?? undefined}>
                {accountLabel}
              </span>
              <a
                className={`rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest shadow-sm transition-all active:scale-95 ${scrolled ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}
                href="/auth/logout"
              >
                Đăng xuất
              </a>
            </div>
          ) : (
            <a
              className={`hidden rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest shadow-sm transition-all active:scale-95 sm:block ${scrolled ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-900 hover:bg-white/90'}`}
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
              <a
                onClick={() => setOpen(false)}
                key={link}
                className="block text-lg font-medium text-slate-900 hover:text-brand-600 transition-colors"
                href="#"
              >
                {link}
              </a>
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
