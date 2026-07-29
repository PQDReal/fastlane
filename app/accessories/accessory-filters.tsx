'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'

const MAX_BUDGET = 20_000_000
const BUDGET_STEP = 100_000
const DEFAULT_BUDGET = 10_000_000

const formatBudget = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(value)

const clampBudget = (value: number) =>
  Math.min(MAX_BUDGET, Math.max(0, value))

const floorBudget = (value: number) =>
  Math.floor(clampBudget(value) / BUDGET_STEP) *
  BUDGET_STEP

type AccessoryFiltersProps = {
  categories: string[]
  serviceLabels: CatalogServiceLabel[]
  selectedServiceCodes: string[]
}

export function AccessoryFilters({
  categories,
  serviceLabels,
  selectedServiceCodes,
}: AccessoryFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isFiltering, startFiltering] = useTransition()
  const allCategory = categories[0] ?? 'Tất cả'
  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([allCategory])
  const [budget, setBudget] = useState(DEFAULT_BUDGET)
  const [budgetInput, setBudgetInput] = useState(
    formatBudget(DEFAULT_BUDGET),
  )

  const toggleCategory = (category: string) => {
    if (category === allCategory) {
      setSelectedCategories([allCategory])
      return
    }

    setSelectedCategories((current) => {
      const individualCategories = current.filter(
        (item) => item !== allCategory,
      )
      const next = individualCategories.includes(category)
        ? individualCategories.filter(
            (item) => item !== category,
          )
        : [...individualCategories, category]

      return next.length > 0 ? next : [allCategory]
    })
  }

  const commitBudget = (value = budget) => {
    const nextBudget = floorBudget(value)
    setBudget(nextBudget)
    setBudgetInput(formatBudget(nextBudget))
  }

  const updateBudgetInput = (value: string) => {
    const digits = value.replace(/\D/g, '')

    if (digits === '') {
      setBudget(0)
      setBudgetInput('')
      return
    }

    const nextBudget = clampBudget(Number(digits))
    setBudget(nextBudget)
    setBudgetInput(formatBudget(nextBudget))
  }

  const toggleService = (code: string) => {
    const selected = new Set(selectedServiceCodes)
    if (selected.has(code)) selected.delete(code)
    else selected.add(code)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('service')
    params.delete('page')
    for (const value of selected) params.append('service', value)
    const query = params.toString()
    startFiltering(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  return (
    <div className="sticky top-[100px]">
      <h3 className="mb-6 text-lg font-bold tracking-tight text-foreground">
        Danh mục
      </h3>

      <ul className="space-y-3">
        {categories.map((category) => {
          const isChecked =
            selectedCategories.includes(category)

          return (
            <li key={category}>
              <label className="group flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCategory(category)}
                  className="h-4 w-4 cursor-pointer rounded border-muted-foreground/30 text-brand-600 accent-foreground focus:ring-brand-500"
                />
                <span
                  className={`text-sm font-medium transition-colors group-hover:text-foreground ${
                    isChecked
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {category}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <h3 className="mb-5 mt-10 text-lg font-bold tracking-tight text-foreground">
        Khoảng giá
      </h3>

      <div className="space-y-4">
        <output
          htmlFor="accessory-budget-range"
          className="mx-auto block w-fit rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700"
        >
          {formatBudget(floorBudget(budget))} ₫
        </output>

        <input
          id="accessory-budget-range"
          type="range"
          min="0"
          max={MAX_BUDGET}
          step="1"
          value={budget}
          onChange={(event) =>
            setBudget(Number(event.target.value))
          }
          onPointerUp={() => commitBudget()}
          onKeyUp={() => commitBudget()}
          onBlur={() => commitBudget()}
          className="h-2 w-full cursor-pointer accent-foreground"
          aria-label="Ngân sách tối đa"
        />

        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>0 ₫</span>
          <span>{formatBudget(MAX_BUDGET)} ₫</span>
        </div>

        <label
          htmlFor="accessory-budget-input"
          className="block text-sm font-semibold text-foreground"
        >
          Hoặc nhập ngân sách
        </label>
        <div className="relative">
          <input
            id="accessory-budget-input"
            type="text"
            inputMode="numeric"
            value={budgetInput}
            onChange={(event) =>
              updateBudgetInput(event.target.value)
            }
            onBlur={() => commitBudget()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            className="h-11 w-full rounded-xl border border-muted bg-background px-4 pr-10 text-right text-sm font-semibold outline-none transition-colors focus:border-brand-500"
            aria-label="Nhập ngân sách tối đa"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            ₫
          </span>
        </div>
      </div>

      {serviceLabels.length > 0 && (
        <fieldset className="mt-10" disabled={isFiltering}>
          <legend className="mb-5 text-lg font-bold tracking-tight text-foreground">
            Dịch vụ
          </legend>
          <div className="space-y-3">
            {serviceLabels.map((label) => (
              <label key={label.id} className="group flex cursor-pointer items-start gap-3 active:scale-[0.99]">
                <input
                  type="checkbox"
                  checked={selectedServiceCodes.includes(label.code)}
                  onChange={() => toggleService(label.code)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-muted-foreground/30 accent-foreground focus-visible:ring-2 focus-visible:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{label.name}</span>
                  {label.description && (
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{label.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {isFiltering && <p className="mt-3 text-xs text-muted-foreground">Đang lọc phụ kiện…</p>}
        </fieldset>
      )}
    </div>
  )
}
