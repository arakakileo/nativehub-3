import { create } from 'zustand'
import { authClient } from '../lib/auth-client'

interface User {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start loading to check session
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })

      if (result.error) {
        throw new Error(result.error.message || 'Login failed')
      }

      set({
        user: result.data?.user as User,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({
        error: message,
        isLoading: false,
      })
      throw error
    }
  },

  logout: async () => {
    set({ isLoading: true })

    try {
      await authClient.signOut()
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  checkSession: async () => {
    set({ isLoading: true })

    try {
      const session = await authClient.getSession()

      if (session.data?.user) {
        set({
          user: session.data.user as User,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  clearError: () => set({ error: null }),
}))
