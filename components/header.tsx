'use client'

import { Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react'
import { useState } from 'react'

const links = [
  'Ô tô điện',
  'Xe máy điện',
  'Phụ kiện',
  'Khuyến mãi',
  'Tin tức',
  'Đặt lịch lái thử',
  'Hỗ trợ',
]

export interface HeaderUser {
  email?: string | null
  name?: string | null
}

export function Header({ user }: { user?: HeaderUser }) {
  const [open, setOpen] = useState(false)
  const accountLabel =
    user?.name?.trim() || user?.email?.trim() || 'Tài khoản'

  return (
    <header className="sticky top-0 z-50 h-[74px] border-b bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-4 lg:px-6">
        <a href="#" className="flex shrink-0 items-center" aria-label="FASTLANE - Trang chủ">
          <img
            src="/images/fastlane-logo.png"
            alt="FASTLANE"
            className="h-8 w-auto object-contain sm:h-9"
          />
          <span className='ml-2 text-[13px] font-medium'>FASTLANE</span>
        </a>

        <nav className="ml-auto hidden items-center gap-7 xl:flex">
          {links.map((link, index) => (
            <a
              key={link}
              href="#"
              className={`whitespace-nowrap text-[13px] font-medium ${index === 0 ? 'border-b-2 border-navy pb-2' : 'hover:text-blue'
                }`}
            >
              {link}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 xl:ml-7">
          <Search size={19} />
          <ShoppingCart className="hidden sm:block" size={19} />
          <UserRound className="hidden sm:block" size={19} />
          {user ? (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="max-w-36 truncate text-xs font-semibold" title={user.email ?? undefined}>
                {accountLabel}
              </span>
              <a className="rounded-full border border-navy px-4 py-2 text-xs font-bold text-navy" href="/auth/logout">
                Đăng xuất
              </a>
            </div>
          ) : (
            <a className="hidden rounded-full bg-navy px-4 py-2 text-xs font-bold text-white sm:block" href="/auth/login">
              Đăng nhập
            </a>
          )}
          <button className="xl:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="absolute left-0 top-full w-full border-t bg-white p-5 shadow-xl xl:hidden">
          {links.map((link) => (
            <a
              onClick={() => setOpen(false)}
              key={link}
              className="block border-b py-3 text-sm font-semibold"
              href="#"
            >
              {link}
            </a>
          ))}
          <a
            className="block pt-4 text-sm font-bold text-blue"
            href={user ? '/auth/logout' : '/auth/login'}
          >
            {user ? 'Đăng xuất' : 'Đăng nhập'}
          </a>
        </nav>
      )}
    </header>
  )
}
