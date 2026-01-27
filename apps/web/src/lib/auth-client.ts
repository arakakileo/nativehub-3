import { createAuthClient } from "better-auth/react"

const API_URL = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "http://localhost:3001"

export const authClient = createAuthClient({
  baseURL: API_URL,
})

// Export commonly used auth functions and hooks
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient
