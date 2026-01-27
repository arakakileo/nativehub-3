import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../stores/authStore'

export function Login() {
  const navigate = useNavigate()
  const { login, checkSession, isLoading, isAuthenticated, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Check session on mount
  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/')
    } catch {
      // Error is handled by store
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary">NativeHub</h1>
          <span className="ml-2 rounded bg-primary/10 px-2 py-1 text-sm font-medium text-primary">
            3.0
          </span>
          <p className="mt-2 text-muted-foreground">
            Native Ads Management Platform
          </p>
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4" />
                {error}
                <button
                  type="button"
                  onClick={clearError}
                  className="ml-auto hover:underline"
                >
                  Dismiss
                </button>
              </motion.div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border bg-background px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border bg-background px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          © 2024 NativeHub. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
