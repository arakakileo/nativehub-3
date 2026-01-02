import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'

interface User {
  id: string
  email: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setToken: (token: string) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, _password) => {
        set({ isLoading: true, error: null })

        try {
          // TODO: Implement Supabase Auth integration
          // For now, mock login
          const mockToken = 'mock-token-' + Date.now()
          const mockUser = { id: '1', email }

          api.setToken(mockToken)

          set({
            user: mockUser,
            token: mockToken,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          })
          throw error
        }
      },

      logout: () => {
        api.setToken(null)
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        })
      },

      setToken: (token) => {
        api.setToken(token)
        set({ token, isAuthenticated: true })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'nativehub-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setToken(state.token)
        }
      },
    }
  )
)
