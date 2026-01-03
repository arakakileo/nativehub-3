import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Bell, Clock, Shield, Moon, Sun, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'

export function Settings() {
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useThemeStore()
  const [saved, setSaved] = useState(false)

  const [settings, setSettings] = useState({
    optimizerInterval: 60,
    emailNotifications: true,
    slackWebhook: '',
    defaultCpaTarget: 10,
    autoBlacklist: true,
    blacklistThreshold: 50,
  })

  const handleSave = () => {
    // TODO: Save to backend
    setSaved(true)
    toast.success('Settings saved')
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold"
        >
          Settings
        </motion.h1>
        <p className="text-muted-foreground">
          Configure your NativeHub preferences
        </p>
      </div>

      {/* Account */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Account</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full rounded-lg border bg-muted px-3 py-2 text-muted-foreground"
            />
          </div>
        </div>
      </motion.div>

      {/* Appearance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <Moon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Appearance</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              {[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value as 'light' | 'dark' | 'system')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${
                    theme === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Optimizer Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Optimizer</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Optimization Interval (minutes)
            </label>
            <select
              value={settings.optimizerInterval}
              onChange={(e) =>
                setSettings({ ...settings, optimizerInterval: Number(e.target.value) })
              }
              className="w-full rounded-lg border bg-background px-3 py-2"
            >
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={120}>Every 2 hours</option>
              <option value={360}>Every 6 hours</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Default CPA Target ($)
            </label>
            <input
              type="number"
              value={settings.defaultCpaTarget}
              onChange={(e) =>
                setSettings({ ...settings, defaultCpaTarget: Number(e.target.value) })
              }
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-Blacklist</p>
              <p className="text-sm text-muted-foreground">
                Automatically blacklist underperforming widgets
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.autoBlacklist}
                onChange={(e) =>
                  setSettings({ ...settings, autoBlacklist: e.target.checked })
                }
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          {settings.autoBlacklist && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Blacklist Threshold ($ spend with 0 conversions)
              </label>
              <input
                type="number"
                value={settings.blacklistThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, blacklistThreshold: Number(e.target.value) })
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-3">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive daily optimization reports
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) =>
                  setSettings({ ...settings, emailNotifications: e.target.checked })
                }
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Slack Webhook URL (optional)
            </label>
            <input
              type="url"
              value={settings.slackWebhook}
              onChange={(e) =>
                setSettings({ ...settings, slackWebhook: e.target.value })
              }
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
          </div>
        </div>
      </motion.div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="min-w-[120px]">
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
