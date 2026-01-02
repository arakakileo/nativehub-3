import { Bell, Sun } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

export function Header() {
  const user = useAuthStore((s) => s.user)

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        {/* Breadcrumb or page title can go here */}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </button>

        {/* Theme toggle (placeholder) */}
        <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Sun className="h-5 w-5" />
        </button>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <span className="text-sm font-medium">
            {user?.email || 'User'}
          </span>
        </div>
      </div>
    </header>
  )
}
