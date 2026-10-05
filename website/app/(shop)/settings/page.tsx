'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Bell,
  Shield,
  Globe,
  Smartphone,
  ChevronRight,
  Lock,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

// Every control here is wired to `PUT /auth/profile` (notification_enabled,
// preferred_language). Settings the backend cannot honour are not shown at all
// — a disabled "coming soon" toggle is not a feature.

interface ProfilePrefs {
  notificationEnabled: boolean
  preferredLanguage: 'en' | 'ur'
}

function useProfilePrefs() {
  const [prefs, setPrefs] = useState<ProfilePrefs | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/auth/me')
      .then((res) => {
        const u = res.data?.data?.user || res.data?.data || {}
        if (cancelled) return
        setPrefs({
          notificationEnabled: u.notification_enabled !== false,
          preferredLanguage: u.preferred_language === 'ur' ? 'ur' : 'en',
        })
      })
      .catch(() => {
        if (!cancelled) setPrefs({ notificationEnabled: true, preferredLanguage: 'en' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = async (patch: Partial<ProfilePrefs>) => {
    if (!prefs) return
    const next = { ...prefs, ...patch }
    setPrefs(next)
    setSaving(true)
    try {
      await authApi.updateProfile({
        ...(patch.notificationEnabled !== undefined ? { notification_enabled: patch.notificationEnabled } : {}),
        ...(patch.preferredLanguage !== undefined ? { preferred_language: patch.preferredLanguage } : {}),
      })
      toast.success('Saved')
    } catch (err: any) {
      setPrefs(prefs)
      toast.error(err?.response?.data?.message || 'Could not save setting')
    } finally {
      setSaving(false)
    }
  }

  return { prefs, saving, update }
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{label}</p>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`ml-3 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-4 hover:bg-gray-50"
    >
      <span className="font-medium text-gray-900">{label}</span>
      <ChevronRight className="w-5 h-5 text-gray-400" />
    </Link>
  )
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const { prefs, saving, update } = useProfilePrefs()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          Settings
        </h1>

        {/* User Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-sm mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-600">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user?.name || 'User'}</h2>
              <p className="text-gray-500">{user?.phone || ''}</p>
            </div>
          </div>
        </motion.div>

        <div className="space-y-8">
          {/* Privacy & Security — includes the PIN Security entry point */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm overflow-hidden"
          >
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary-600" />
                <h2 className="font-semibold text-gray-900">Privacy & Security</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              <Link
                href="/settings/pin"
                className="flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">PIN Security</p>
                    <p className="text-sm text-gray-500">Set or change your 4-digit login PIN</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
              <LinkRow href="/addresses" label="Saved addresses & map pins" />
              <LinkRow href="/delete-account" label="Delete my account" />
            </div>
          </motion.div>

          {/* Notifications (coming soon) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm overflow-hidden"
          >
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-primary-600" />
                <h2 className="font-semibold text-gray-900">Notifications</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              <ToggleRow
                label="Order updates"
                description="Status changes, rider on the way and delivery alerts"
                checked={prefs?.notificationEnabled ?? true}
                disabled={!prefs || saving}
                onChange={(next) => update({ notificationEnabled: next })}
              />
            </div>
          </motion.div>

          {/* Preferences (coming soon) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm overflow-hidden"
          >
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary-600" />
                <h2 className="font-semibold text-gray-900">Preferences</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Language for messages</p>
                  <p className="text-sm text-gray-500">SMS / WhatsApp updates are sent in this language</p>
                </div>
                <div className="ml-3 inline-flex rounded-full bg-gray-100 p-1" role="radiogroup" aria-label="Language">
                  {(['en', 'ur'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      role="radio"
                      aria-checked={prefs?.preferredLanguage === lang}
                      disabled={!prefs || saving}
                      onClick={() => update({ preferredLanguage: lang })}
                      className={`px-3 py-1 text-sm rounded-full transition-colors disabled:opacity-50 ${
                        prefs?.preferredLanguage === lang ? 'bg-white shadow text-primary-700 font-semibold' : 'text-gray-600'
                      }`}
                    >
                      {lang === 'en' ? 'English' : 'اردو'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* App Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-sm mt-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <Smartphone className="w-6 h-6 text-gray-400" />
            <div>
              <h3 className="font-semibold text-gray-900">App Information</h3>
              <p className="text-sm text-gray-500">Version 1.0.0</p>
            </div>
          </div>
          <div className="space-y-2">
            <LinkRow href="/terms" label="Terms of Service" />
            <LinkRow href="/privacy" label="Privacy Policy" />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
