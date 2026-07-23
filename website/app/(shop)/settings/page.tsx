'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Bell,
  Shield,
  Globe,
  Smartphone,
  ChevronRight,
  Moon,
  Lock,
} from 'lucide-react'
import { useAuthStore } from '@/store/cartStore'

// Non-functional settings (previously wrote only to localStorage without any
// effect) are shown disabled with a "Coming soon" badge instead of pretending
// to work. Functional items are real links to real pages.

function ComingSoonRow({
  label,
  description,
}: {
  label: string
  description?: string
}) {
  return (
    <div className="p-4 flex items-center justify-between opacity-70">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{label}</p>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <span className="ml-3 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
        Coming soon
      </span>
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
              <ComingSoonRow
                label="Share Location"
                description="Allow access to your location for delivery"
              />
              <ComingSoonRow
                label="Analytics"
                description="Help us improve by sharing usage data"
              />
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
              <ComingSoonRow label="Order Updates" description="Get notified about your order status" />
              <ComingSoonRow label="Promotions & Offers" description="Receive special deals and discounts" />
              <ComingSoonRow label="Delivery Alerts" description="Notifications when delivery is nearby" />
              <ComingSoonRow label="Email Notifications" description="Receive updates via email" />
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
              <ComingSoonRow label="Language" description="English / اردو" />
              <div className="p-4 flex items-center justify-between opacity-70">
                <div className="flex items-center gap-3 flex-1">
                  <Moon className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Dark Mode</p>
                    <p className="text-sm text-gray-500">Use dark theme</p>
                  </div>
                </div>
                <span className="ml-3 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  Coming soon
                </span>
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
