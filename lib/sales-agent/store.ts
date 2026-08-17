'use client'

import { create } from 'zustand'

type SalesAgentStore = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useSalesAgentStore = create<SalesAgentStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))

export const salesAgentUiEnabled = process.env.NEXT_PUBLIC_SALES_AGENT_ENABLED === 'true'
