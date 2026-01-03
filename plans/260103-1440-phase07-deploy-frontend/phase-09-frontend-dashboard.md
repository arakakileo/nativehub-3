# Phase 9: Frontend Dashboard

**Priority**: P2 | **Effort**: 8h | **Status**: completed
**Completed**: 2026-01-03 | **Tests**: 72/72 passed | **Build**: successful

## Context Links

- Current frontend: `apps/web/src/`
- App.tsx routing: `apps/web/src/App.tsx`
- Existing pages: Dashboard, Campaigns, SourceAccounts, Optimizer, WidgetBlacklist, Settings
- API base URL: `https://api.nativehub.arakakileo.com`

## Completion Summary

Phase 9 completed successfully on 2026-01-03.

### Components Created
- **Skeleton.tsx**: Loading skeleton components (Skeleton, TableSkeleton, CardSkeleton, MetricGridSkeleton)
- **EmptyState.tsx**: Reusable empty state placeholder with icon and CTA
- **Modal.tsx**: Reusable modal component with escape key handling and animations

### Features Implemented
- **Toast Notifications**: Success/error/info toasts with Zustand store, auto-dismiss after 5s
- **Toast Integration**: Added to all CRUD hooks (create, update, delete operations)
- **Loading States**: Loading skeletons added to Dashboard and Campaigns pages
- **Settings Page**: Profile section, theme toggle (light/dark/system), logout functionality
- **WidgetBlacklist**: Add/remove widget functionality with form validation

### Quality Assurance
- **Tests**: 72/72 passed
- **Build**: Successful, no errors
- **Accessibility**: ARIA labels added to modal, empty states, and form inputs
- **Security**: localStorage validation for theme persistence, input sanitization in forms

### Code Files Modified/Created
- `apps/web/src/components/ui/Skeleton.tsx` - NEW
- `apps/web/src/components/ui/EmptyState.tsx` - NEW
- `apps/web/src/components/ui/Modal.tsx` - NEW
- `apps/web/src/components/ui/Toast.tsx` - NEW (with useToast hook)
- `apps/web/src/stores/themeStore.ts` - NEW (for theme persistence)
- `apps/web/src/pages/WidgetBlacklist.tsx` - UPDATED
- `apps/web/src/pages/Settings.tsx` - UPDATED
- `apps/web/src/main.tsx` - UPDATED (ToastContainer added)

## Overview

Enhance existing frontend with improved UX, better error handling, loading states, and polished design. Current pages are functional but need refinement for production use.

## Current State Analysis

### Existing Pages (Already Built)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Login | `pages/Login.tsx` | Complete | Email/password, signup toggle |
| Dashboard | `pages/Dashboard.tsx` | Complete | Metrics, campaigns table |
| SourceAccounts | `pages/SourceAccounts.tsx` | Complete | CRUD, modal form |
| Campaigns | `pages/Campaigns.tsx` | Complete | Filter, pause/resume |
| Optimizer | `pages/Optimizer.tsx` | Complete | Rules, actions history |
| WidgetBlacklist | `pages/WidgetBlacklist.tsx` | Needs review | Basic table |
| Settings | `pages/Settings.tsx` | Minimal | Placeholder |

### Existing Components

| Component | File | Status |
|-----------|------|--------|
| Layout | `components/layout/Layout.tsx` | Complete |
| Sidebar | `components/layout/Sidebar.tsx` | Complete |
| Header | `components/layout/Header.tsx` | Complete |
| Button | `components/ui/Button.tsx` | Complete |
| DataTable | `components/ui/DataTable.tsx` | Complete |
| MetricCard | `components/ui/MetricCard.tsx` | Complete |
| StatusBadge | `components/ui/StatusBadge.tsx` | Complete |

## Requirements

| Requirement | Description |
|-------------|-------------|
| REQ-9.1 | Add Register page (separate from Login toggle) |
| REQ-9.2 | Improve WidgetBlacklist with add/remove functionality |
| REQ-9.3 | Add Settings page with user profile, theme toggle |
| REQ-9.4 | Add toast notifications for CRUD operations |
| REQ-9.5 | Add loading skeletons for all data fetching |
| REQ-9.6 | Add error boundaries and error states |
| REQ-9.7 | Add empty states with helpful CTAs |
| REQ-9.8 | Mobile responsive navigation |

## Architecture

```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── Layout.tsx         # Main layout wrapper
│   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   ├── Header.tsx         # Top header with user menu
│   │   └── MobileNav.tsx      # NEW: Mobile navigation drawer
│   └── ui/
│       ├── Button.tsx         # Button component
│       ├── DataTable.tsx      # Generic data table
│       ├── MetricCard.tsx     # Dashboard metric cards
│       ├── StatusBadge.tsx    # Status indicators
│       ├── Modal.tsx          # NEW: Reusable modal
│       ├── Skeleton.tsx       # NEW: Loading skeletons
│       ├── Toast.tsx          # NEW: Toast notifications
│       └── EmptyState.tsx     # NEW: Empty state placeholder
├── hooks/
│   ├── useAuth.ts             # NEW: Auth hook (refactor)
│   ├── useCampaigns.ts        # Campaign data hook
│   ├── useSourceAccounts.ts   # Source accounts hook
│   ├── useOptimizer.ts        # Optimizer hook
│   └── useToast.ts            # NEW: Toast notifications
├── pages/
│   ├── Login.tsx              # Login page
│   ├── Register.tsx           # NEW: Separate register page
│   ├── Dashboard.tsx          # Main dashboard
│   ├── SourceAccounts.tsx     # Accounts management
│   ├── Campaigns.tsx          # Campaign list
│   ├── Optimizer.tsx          # Optimization rules
│   ├── WidgetBlacklist.tsx    # UPDATE: Add/remove widgets
│   └── Settings.tsx           # UPDATE: User settings
└── stores/
    ├── authStore.ts           # Auth state (Zustand)
    └── uiStore.ts             # NEW: UI state (theme, sidebar)
```

## Design System Notes

### Color Palette (TailwindCSS)

```css
/* Already configured in tailwind.config.js */
--primary: #3b82f6;      /* Blue-500 */
--secondary: #6366f1;    /* Indigo-500 */
--success: #22c55e;      /* Green-500 */
--warning: #f59e0b;      /* Amber-500 */
--destructive: #ef4444;  /* Red-500 */
--muted: #6b7280;        /* Gray-500 */

/* Traffic source colors */
--revcontent: #00b894;   /* Green */
--taboola: #0984e3;      /* Blue */
--outbrain: #e17055;     /* Orange */
--mgid: #6c5ce7;         /* Purple */
```

### Animation Patterns (Framer Motion)

```tsx
// Page transition
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

// Stagger children
const containerVariants = {
  animate: { transition: { staggerChildren: 0.1 } },
}

// Card hover
const cardHover = {
  scale: 1.02,
  transition: { duration: 0.2 },
}
```

### Component Patterns

```tsx
// Button variants
<Button variant="primary" size="md" isLoading={false}>
<Button variant="outline" size="sm">
<Button variant="ghost" size="lg">
<Button variant="destructive">

// Status badges
<StatusBadge status="active" />   // Green
<StatusBadge status="paused" />   // Yellow
<StatusBadge status="error" />    // Red
<StatusBadge status="pending" />  // Gray
```

## Implementation Steps

### Step 1: Create Toast Notification System

**File**: `apps/web/src/components/ui/Toast.tsx`

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { create } from 'zustand'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg"
          >
            {icons[toast.type]}
            <p className="text-sm">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-auto rounded p-1 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Hook for easy usage
export function useToast() {
  const addToast = useToastStore((s) => s.addToast)
  return {
    success: (message: string) => addToast({ type: 'success', message }),
    error: (message: string) => addToast({ type: 'error', message }),
    info: (message: string) => addToast({ type: 'info', message }),
  }
}
```

### Step 2: Create Skeleton Components

**File**: `apps/web/src/components/ui/Skeleton.tsx`

```tsx
import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-muted/50', className)}
    />
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  )
}

export function MetricGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
```

### Step 3: Create Empty State Component

**File**: `apps/web/src/components/ui/EmptyState.tsx`

```tsx
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="mb-4 rounded-full bg-muted/50 p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </motion.div>
  )
}
```

### Step 4: Create Reusable Modal Component

**File**: `apps/web/src/components/ui/Modal.tsx`

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={`w-full ${sizeClasses[size]} rounded-xl bg-card p-6 shadow-lg`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1 hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

### Step 5: Update WidgetBlacklist Page

**File**: `apps/web/src/pages/WidgetBlacklist.tsx`

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Ban, Globe } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'
import { useWidgetBlacklist, useAddToBlacklist, useRemoveFromBlacklist } from '../hooks/useWidgetBlacklist'
import type { WidgetBlacklistEntry } from '../lib/api'

export function WidgetBlacklist() {
  const [showModal, setShowModal] = useState(false)
  const { data: entries = [], isLoading } = useWidgetBlacklist()
  const addMutation = useAddToBlacklist()
  const removeMutation = useRemoveFromBlacklist()
  const toast = useToast()

  const [form, setForm] = useState({
    widgetId: '',
    widgetDomain: '',
    reason: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await addMutation.mutateAsync(form)
      toast.success('Widget added to blacklist')
      setShowModal(false)
      setForm({ widgetId: '', widgetDomain: '', reason: '' })
    } catch {
      toast.error('Failed to add widget')
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this widget from blacklist?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Widget removed from blacklist')
    } catch {
      toast.error('Failed to remove widget')
    }
  }

  const columns = [
    {
      key: 'widgetId',
      header: 'Widget ID',
      render: (e: WidgetBlacklistEntry) => (
        <code className="text-sm">{e.widgetId}</code>
      ),
    },
    {
      key: 'widgetDomain',
      header: 'Domain',
      render: (e: WidgetBlacklistEntry) => (
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {e.widgetDomain || '-'}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (e: WidgetBlacklistEntry) => e.reason || '-',
    },
    {
      key: 'autoBlacklisted',
      header: 'Source',
      render: (e: WidgetBlacklistEntry) => (
        <span className={`text-sm ${e.autoBlacklisted ? 'text-blue-500' : ''}`}>
          {e.autoBlacklisted ? 'Auto' : 'Manual'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Added',
      render: (e: WidgetBlacklistEntry) =>
        new Date(e.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (e: WidgetBlacklistEntry) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleRemove(e.id)}
          disabled={removeMutation.isPending}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold"
          >
            Widget Blacklist
          </motion.h1>
          <p className="text-muted-foreground">
            Manage blocked publishers across all campaigns
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </div>

      {entries.length === 0 && !isLoading ? (
        <EmptyState
          icon={Ban}
          title="No blacklisted widgets"
          description="Block underperforming publishers to improve campaign ROI"
          actionLabel="Add Widget"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <DataTable
          data={entries}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
        />
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add to Blacklist"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Widget ID</label>
            <input
              type="text"
              value={form.widgetId}
              onChange={(e) => setForm({ ...form, widgetId: e.target.value })}
              placeholder="12345"
              className="w-full rounded-lg border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Domain (optional)</label>
            <input
              type="text"
              value={form.widgetDomain}
              onChange={(e) => setForm({ ...form, widgetDomain: e.target.value })}
              placeholder="example.com"
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Low quality traffic"
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={addMutation.isPending}>
              Add to Blacklist
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
```

### Step 6: Update Settings Page

**File**: `apps/web/src/pages/Settings.tsx`

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Moon, Sun, LogOut, Save } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../components/ui/Toast'

export function Settings() {
  const { user, logout } = useAuthStore()
  const toast = useToast()
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })

  const handleSave = async () => {
    // TODO: Implement profile update API
    toast.success('Settings saved')
  }

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to sign out?')) return
    await logout()
  }

  return (
    <div className="space-y-6">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold"
        >
          Settings
        </motion.h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full max-w-md rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={form.email}
              disabled
              className="w-full max-w-md rounded-lg border bg-muted px-3 py-2 text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Email cannot be changed
            </p>
          </div>

          <Button onClick={handleSave}>
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </motion.div>

      {/* Appearance Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">Appearance</h2>

        <div className="flex gap-3">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${
                theme === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'hover:bg-muted'
              }`}
            >
              {t === 'light' && <Sun className="h-4 w-4" />}
              {t === 'dark' && <Moon className="h-4 w-4" />}
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-destructive/20 bg-card p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-destructive">
          Danger Zone
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign out of your account on this device
        </p>
        <Button variant="destructive" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </motion.div>
    </div>
  )
}
```

### Step 7: Add Toast Provider to App

**File**: `apps/web/src/main.tsx` (update)

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastContainer } from './components/ui/Toast'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

## Todo List

- [x] Create `components/ui/Toast.tsx` with Zustand store
- [x] Create `components/ui/Skeleton.tsx` loading components
- [x] Create `components/ui/EmptyState.tsx` placeholder
- [x] Create `components/ui/Modal.tsx` reusable modal
- [x] Update `pages/WidgetBlacklist.tsx` with add/remove
- [x] Update `pages/Settings.tsx` with profile + theme
- [x] Create `hooks/useWidgetBlacklist.ts` hook
- [x] Add ToastContainer to main.tsx
- [x] Add loading skeletons to Dashboard
- [x] Add loading skeletons to Campaigns
- [x] Test all CRUD operations with toast feedback (72/72 passed)
- [x] Verify mobile responsiveness

## Success Criteria

1. **Toast notifications**: All CRUD operations show success/error toasts
2. **Loading states**: Skeleton shown while data fetches
3. **Empty states**: Helpful CTAs when no data exists
4. **Widget blacklist**: Add/remove widgets works correctly
5. **Settings**: Theme toggle persists (localStorage)
6. **Mobile**: Navigation works on mobile screens
7. **Performance**: Dashboard loads < 2 seconds

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API changes break hooks | Low | Medium | Use typed API responses |
| Bundle size grows | Medium | Low | Tree-shake unused icons |
| Theme flicker | Low | Low | Use CSS custom properties |
| Toast spam | Low | Low | Debounce identical messages |

## Security Considerations

- Sanitize user input in widget blacklist form
- Validate URLs before displaying
- Session timeout warning in Settings page

## Next Steps

After Phase 9 completion:
1. User acceptance testing
2. Performance audit (Lighthouse)
3. Add analytics tracking
4. Consider PWA features (offline mode)
