'use client'

import { useState } from 'react'

import type { AccessoryCatalogFacetOption } from '@/lib/catalog/types'

const selectClassName = 'h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

export function AccessoryCategoryVehicleFields({
  categories,
  vehicles,
  vehicleRelevantCategories,
  initialCategory,
  initialVehicle,
}: {
  categories: AccessoryCatalogFacetOption[]
  vehicles: AccessoryCatalogFacetOption[]
  vehicleRelevantCategories: string[]
  initialCategory: string | null
  initialVehicle: string | null
}) {
  const [category, setCategory] = useState(initialCategory ?? '')
  const initialCategorySupportsVehicles = !initialCategory
    || vehicleRelevantCategories.includes(initialCategory)
  const [vehicle, setVehicle] = useState(
    initialCategorySupportsVehicles ? initialVehicle ?? '' : '',
  )
  const vehicleEnabled = !category || vehicleRelevantCategories.includes(category)

  const changeCategory = (nextCategory: string) => {
    setCategory(nextCategory)
    if (nextCategory && !vehicleRelevantCategories.includes(nextCategory)) {
      setVehicle('')
    }
  }

  return (
    <>
      <label>
        <span className="sr-only">Danh mục</span>
        <select
          name="category"
          value={category}
          onChange={(event) => changeCategory(event.target.value)}
          className={selectClassName}
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="sr-only">Dòng xe phù hợp</span>
        <select
          name="vehicle"
          value={vehicle}
          onChange={(event) => setVehicle(event.target.value)}
          disabled={!vehicleEnabled}
          className={selectClassName}
          aria-describedby={!vehicleEnabled ? 'vehicle-not-applicable' : undefined}
        >
          <option value="">
            {vehicleEnabled ? 'Tất cả dòng xe' : 'Không áp dụng cho danh mục này'}
          </option>
          {vehicleEnabled && vehicles.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value} ({option.count})
            </option>
          ))}
        </select>
        {!vehicleEnabled && (
          <span id="vehicle-not-applicable" className="sr-only">
            Danh mục đã chọn không phụ thuộc dòng xe.
          </span>
        )}
      </label>
    </>
  )
}
