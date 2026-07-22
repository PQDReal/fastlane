'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface AuthUser {
  email?: string | null
  name?: string | null
}

const AuthUserContext = createContext<AuthUser | undefined>(undefined)

export function AuthUserProvider({ children, user }: { children: ReactNode; user?: AuthUser }) {
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>
}

export function useAuthUser() {
  return useContext(AuthUserContext)
}
