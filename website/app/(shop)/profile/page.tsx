'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Edit2, 
  Plus,
  LogOut,
  ChevronRight,
  Package,
  Heart,
  Settings,
  Loader2,
  Trash2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/store/cartStore'
import { authApi, addressesApi } from '@/lib/api'

interface UserProfile {
  id: string
  name: string
  phone: string
  email: string
}

interface AddressData {
  id: string
  label: string
  fullAddress: string
  isDefault: boolean
}

export default function ProfilePage() {
  const router = useRouter()
  const { user: authUser, isAuthenticated, logout } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [addresses, setAddresses] = useState<AddressData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile')
      return
    }
    loadProfile()
    loadAddresses()
  }, [isAuthenticated])

  const loadProfile = async () => {
    try {
      const res = await authApi.getProfile()
      const data = res.data || res
      setUser({
        id: data.id,
        name: data.full_name || data.name || '',
        phone: data.phone || '',
        email: data.email || '',
      })
      setEditName(data.full_name || data.name || '')
      setEditEmail(data.email || '')
    } catch (err: any) {
      if (err?.response?.status === 401) {
        logout()
        router.push('/login')
      } else {
        // fallback to auth store data
        if (authUser) {
          setUser({
            id: authUser.id,
            name: authUser.name,
            phone: authUser.phone,
            email: authUser.email || '',
          })
          setEditName(authUser.name)
          setEditEmail(authUser.email || '')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const loadAddresses = async () => {
    try {
      const res = await addressesApi.getAll()
      const raw = res.data || res
      const list = Array.isArray(raw) ? raw : []
      setAddresses(list.map((a: any) => ({
        id: a.id,
        label: a.address_type || a.label || 'Address',
        fullAddress: [a.written_address, a.area_name, a.city].filter(Boolean).join(', '),
        isDefault: a.is_default || false,
      })))
    } catch {
      // addresses optional
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await authApi.updateProfile({ full_name: editName, email: editEmail || undefined })
      setUser(prev => prev ? { ...prev, name: editName, email: editEmail } : prev)
      setIsEditing(false)
      toast.success('Profile updated successfully!')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAddress = async (id: string) => {
    try {
      await addressesApi.delete(id)
      setAddresses(prev => prev.filter(a => a.id !== id))
      toast.success('Address deleted')
    } catch {
      toast.error('Failed to delete address')
    }
  }

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully!')
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Could not load profile</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
          My Profile
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Personal Information</h2>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <Edit2 className="w-4 h-4" />
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              <div className="flex items-center gap-6 mb-6">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{user.name}</h3>
                  <p className="text-gray-500">{user.phone}</p>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <Input
                    label="Full Name"
                    value={editName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                  />
                  <Input
                    label="Phone Number"
                    value={user.phone}
                    disabled
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={editEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEmail(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium">{user.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{user.email || 'Not provided'}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Saved Addresses */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Saved Addresses</h2>
                <Link
                  href="/addresses"
                  className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Manage Addresses
                </Link>
              </div>

              {addresses.length === 0 ? (
                <p className="text-gray-500 text-sm">No saved addresses yet</p>
              ) : (
                <div className="space-y-4">
                  {addresses.map((address) => (
                    <div
                      key={address.id}
                      className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{address.label}</span>
                          {address.isDefault && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm mt-1">
                          {address.fullAddress}
                        </p>
                      </div>
                      <Link
                        href="/addresses"
                        className="text-gray-400 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDeleteAddress(address.id)}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right Column - Quick Links */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl p-6 shadow-sm sticky top-24"
            >
              <h2 className="text-xl font-semibold mb-6">Quick Links</h2>
              
              <div className="space-y-2">
                <Link
                  href="/orders"
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary-600" />
                    </div>
                    <span className="font-medium">My Orders</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>

                <Link
                  href="/addresses"
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="font-medium">My Addresses</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>

                <Link
                  href="/wishlist"
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <Heart className="w-5 h-5 text-red-600" />
                    </div>
                    <span className="font-medium">Wishlist</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>

                <Link
                  href="/settings"
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <Settings className="w-5 h-5 text-gray-600" />
                    </div>
                    <span className="font-medium">Settings</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              </div>

              <hr className="my-6" />

              <Button
                variant="outline"
                fullWidth
                onClick={handleLogout}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Logout
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
