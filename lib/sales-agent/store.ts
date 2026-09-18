'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SalesAgentStore {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  position: { x: number; y: number }
  setPosition: (position: { x: number; y: number }) => void
}

export const useSalesAgentStore = create<SalesAgentStore>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
      position: { x: 0, y: 0 },
      setPosition: (position) => set({ position }),
    }),
    { name: 'sales-agent-position' }
  )
)

export const salesAgentUiEnabled = process.env.NEXT_PUBLIC_SALES_AGENT_ENABLED === 'true'
