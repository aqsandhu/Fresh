'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Settings, 
  Bell, 
  Shield, 
  Globe, 
  Moon,
  Smartphone,
  ChevronRight,
  Loader2,
  Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/cartStore'

interface SettingSection {
  id: string
  title: string
  icon: typeof Settings
  items: SettingItem[]
}

interface SettingItem {
  id: string
  label: string
  description?: string
  type: 'toggle' | 'select' | 'link'
  value?: boolean | string
  options?: { value: string; label: string }[]
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState<string | null>(null)
  
  // Settings state
  const [settings, setSettings] = useState({
    notifications: {
      orderUpdates: true,
      promotions: true,
      deliveryAlerts: true,
      emailNotifications: false,
    },
    preferences: {
      language: 'en',
      darkMode: false,
    },
    privacy: {
      shareLocation: true,
      analytics: true,
    },
  })

  const handleToggle = async (section: string, key: string) => {
    const settingId = `${section}.${key}`
    setSaving(settingId)
    
    try {
      setSettings(prev => ({
        ...prev,
        [section]: {
          ...(prev as any)[section],
          [key]: !(prev as any)[section][key],
        },
      }))
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      toast.success('Setting updated')
    } catch (error) {
      toast.error('Failed to update setting')
    } finally {
      setSaving(null)
    }
  }

  const handleSelect = async (section: string, key: string, value: string) => {
    const settingId = `${section}.${key}`
    setSaving(settingId)
    
    try {
      setSettings(prev => ({
        ...prev,
        [section]: {
          ...prev[section as keyof typeof prev],
          [key]: value,
        },
      }))
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      toast.success('Setting updated')
    } catch (error) {
      toast.error('Failed to update setting')
    } finally {
      setSaving(null)
    }
  }

  const settingSections: SettingSection[] = [
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      items: [
        { id: 'orderUpdates', label: 'Order Updates', description: 'Get notified about your order status', type: 'toggle', value: settings.notifications.orderUpdates },
        { id: 'promotions', label: 'Promotions & Offers', description: 'Receive special deals and discounts', type: 'toggle', value: settings.notifications.promotions },
        { id: 'deliveryAlerts', label: 'Delivery Alerts', description: 'Notifications when delivery is nearby', type: 'toggle', value: settings.notifications.deliveryAlerts },
        { id: 'emailNotifications', label: 'Email Notifications', description: 'Receive updates via email', type: 'toggle', value: settings.notifications.emailNotifications },
      ],
    },
    {
      id: 'preferences',
      title: 'Preferences',
      icon: Globe,
      items: [
        { 
          id: 'language', 
          label: 'Language', 
          type: 'select', 
          value: settings.preferences.language,
          options: [
            { value: 'en', label: 'English' },
            { value: 'ur', label: 'اردو (Urdu)' },
          ],
        },
        { id: 'darkMode', label: 'Dark Mode', description: 'Use dark theme', type: 'toggle', value: settings.preferences.darkMode },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy & Security',
      icon: Shield,
      items: [
        { id: 'shareLocation', label: 'Share Location', description: 'Allow access to your location for delivery', type: 'toggle', value: settings.privacy.shareLocation },
        { id: 'analytics', label: 'Analytics', description: 'Help us improve by sharing usage data', type: 'toggle', value: settings.privacy.analytics },
      ],
    },
  ]

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

        {/* Settings Sections */}
        <div className="space-y-8">
          {settingSections.map((section, index) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-sm overflow-hidden"
            >
              <div className="p-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <section.icon className="w-5 h-5 text-primary-600" />
                  <h2 className="font-semibold text-gray-900">{section.title}</h2>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {section.items.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      {item.description && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
                    </div>
                    
                    {item.type === 'toggle' && (
                      <button
                        onClick={() => handleToggle(section.id, item.id)}
                        disabled={saving === `${section.id}.${item.id}`}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          item.value ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        {saving === `${section.id}.${item.id}` ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin absolute top-1 left-1" />
                        ) : (
                          <span
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                              item.value ? 'left-7' : 'left-1'
                            }`}
                          />
                        )}
                      </button>
                    )}
                    
                    {item.type === 'select' && item.options && (
                      <select
                        value={item.value as string}
                        onChange={(e) => handleSelect(section.id, item.id, e.target.value)}
                        disabled={saving === `${section.id}.${item.id}`}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {item.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
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
            <a href="#" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
              <span className="text-gray-600">Terms of Service</span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </a>
            <a href="#" className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
              <span className="text-gray-600">Privacy Policy</span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
