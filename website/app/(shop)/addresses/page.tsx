'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Check,
  Camera,
  Loader2,
  Star,
  ArrowLeft,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/store/cartStore'
import { addressesApi } from '@/lib/api'
import api from '@/lib/api'
import { resolveImageUrl } from '@/lib/utils'

interface FullAddress {
  id: string
  address_type: string
  written_address: string
  area_name: string
  city: string
  province: string
  landmark: string
  is_default: boolean
  door_picture_url: string | null
  latitude?: number | null
  longitude?: number | null
  has_location?: boolean
  location_added_by?: string | null
}

export default function AddressesPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [addresses, setAddresses] = useState<FullAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [availableCities, setAvailableCities] = useState<{id: string, name: string, province: string}[]>([])

  // Form fields
  const [formType, setFormType] = useState('home')
  const [formAddress, setFormAddress] = useState('')
  const [formArea, setFormArea] = useState('')
  const [formCity, setFormCity] = useState('Gujrat')
  const [formLandmark, setFormLandmark] = useState('')
  const [formDoorPic, setFormDoorPic] = useState<File | null>(null)
  const [mapLocation, setMapLocation] = useState<{lat: number, lng: number} | null>(null)
  const [showMapPicker, setShowMapPicker] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/addresses')
      return
    }
    loadAddresses()
    loadCities()
  }, [isAuthenticated])

  const loadCities = async () => {
    try {
      const res = await api.get('/site-settings/cities')
      const data = res.data?.data || res.data || []
      setAvailableCities(Array.isArray(data) ? data : [])
    } catch {
      setAvailableCities([{ id: 'default', name: 'Gujrat', province: 'Punjab' }])
    }
  }

  const loadAddresses = async () => {
    try {
      const res = await api.get('/addresses')
      const raw = res.data?.data || res.data || []
      setAddresses(Array.isArray(raw) ? raw : [])
    } catch {
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormType('home')
    setFormAddress('')
    setFormArea('')
    setFormCity('Gujrat')
    setFormLandmark('')
    setFormDoorPic(null)
    setMapLocation(null)
    setShowMapPicker(false)
    setEditingId(null)
    setShowForm(false)
  }

  const openAddForm = () => {
    resetForm()
    setShowForm(true)
  }

  const openEditForm = (addr: FullAddress) => {
    setFormType(addr.address_type || 'home')
    setFormAddress(addr.written_address || '')
    setFormArea(addr.area_name || '')
    setFormCity(addr.city || 'Gujrat')
    setFormLandmark(addr.landmark || '')
    setFormDoorPic(null)
    setMapLocation(addr.latitude && addr.longitude ? { lat: addr.latitude, lng: addr.longitude } : null)
    setShowMapPicker(false)
    setEditingId(addr.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formAddress.trim() || formAddress.trim().length < 5) {
      toast.error('Please enter a valid address (at least 5 characters)')
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('address_type', formType)
      formData.append('written_address', formAddress)
      formData.append('area_name', formArea || 'N/A')
      formData.append('city', formCity)
      formData.append('landmark', formLandmark)
      if (mapLocation) {
        formData.append('latitude', mapLocation.lat.toString())
        formData.append('longitude', mapLocation.lng.toString())
      }
      if (formDoorPic) {
        formData.append('door_picture', formDoorPic)
      }

      if (editingId) {
        // Update existing
        await api.put(`/addresses/${editingId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Address updated!')
      } else {
        // Create new
        formData.append('is_default', addresses.length === 0 ? 'true' : 'false')
        await api.post('/addresses', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        toast.success('Address added!')
      }

      resetForm()
      loadAddresses()
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save address'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return
    try {
      await addressesApi.delete(id)
      setAddresses(prev => prev.filter(a => a.id !== id))
      toast.success('Address deleted')
    } catch {
      toast.error('Failed to delete address')
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await api.put(`/addresses/${id}/set-default`)
      toast.success('Default address updated')
      loadAddresses()
    } catch {
      toast.error('Failed to set default address')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Addresses</h1>
          </div>
          {!showForm && (
            <Button onClick={openAddForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add Address
            </Button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-6 shadow-sm mb-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="home">Home</option>
                    <option value="office">Office</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <Input
                  label="Area Name"
                  placeholder="e.g., Gulberg, DHA"
                  value={formArea}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormArea(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <select
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {availableCities.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Address *</label>
                <textarea
                  rows={3}
                  placeholder="Enter your complete address"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <Input
                label="Landmark (Optional)"
                placeholder="Near mosque, school, etc."
                value={formLandmark}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormLandmark(e.target.value)}
              />

              {/* Door Picture */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Door Picture (Optional)</label>
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer block">
                  <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {formDoorPic ? formDoorPic.name : 'Click to upload a picture of your door'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">This helps our delivery partner find your location</p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFormDoorPic(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {/* Map Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">📍 Pin Map Location (Optional)</label>
                {!showMapPicker && !mapLocation && (
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(true)}
                    className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm border border-primary-200 rounded-lg px-4 py-2.5 hover:bg-primary-50 transition-colors"
                  >
                    <MapPin className="w-4 h-4" />
                    Add Google Map Location
                  </button>
                )}
                {mapLocation && !showMapPicker && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-green-700 flex-1">
                      Location pinned ({mapLocation.lat.toFixed(4)}, {mapLocation.lng.toFixed(4)})
                    </span>
                    <button type="button" onClick={() => { setMapLocation(null); setShowMapPicker(true) }} className="text-sm text-primary-600 hover:underline">Change</button>
                    <button type="button" onClick={() => setMapLocation(null)} className="text-sm text-red-500 hover:underline">Remove</button>
                  </div>
                )}
                {showMapPicker && (
                  <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                    <iframe
                      width="100%"
                      height="300"
                      style={{ border: 0 }}
                      loading="lazy"
                      src={`https://maps.google.com/maps?q=${mapLocation?.lat || 32.5742},${mapLocation?.lng || 74.0789}&z=15&output=embed`}
                    />
                    <div className="p-3 bg-gray-50 space-y-3">
                      <p className="text-xs text-gray-500">Enter your exact coordinates or use &quot;Get My Current Location&quot;</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                          <input
                            type="number" step="any" placeholder="32.5742"
                            value={mapLocation?.lat || ''}
                            onChange={(e) => setMapLocation(prev => ({ lat: parseFloat(e.target.value) || 0, lng: prev?.lng || 74.0789 }))}
                            className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                          <input
                            type="number" step="any" placeholder="74.0789"
                            value={mapLocation?.lng || ''}
                            onChange={(e) => setMapLocation(prev => ({ lat: prev?.lat || 32.5742, lng: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.geolocation) {
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  setMapLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                                  toast.success('Location detected!')
                                },
                                () => toast.error('Could not get your location. Please enter manually.')
                              )
                            } else {
                              toast.error('Geolocation not supported by your browser')
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-primary-700 transition-colors"
                        >
                          <MapPin className="w-4 h-4" />
                          Get My Current Location
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowMapPicker(false)}
                          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          {mapLocation ? 'Done' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">If you skip this, our rider will pin the location on first delivery</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Address' : 'Save Address'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Address List */}
        {addresses.length === 0 && !showForm ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl p-12 shadow-sm text-center"
          >
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No addresses saved</h3>
            <p className="text-gray-500 mb-6">Add your first delivery address to get started</p>
            <Button onClick={openAddForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Address
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {addresses.map((addr, index) => (
              <motion.div
                key={addr.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <MapPin className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold capitalize">{addr.address_type}</span>
                      {addr.is_default && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded font-medium">Default</span>
                      )}
                      {addr.has_location && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          📍 {addr.location_added_by === 'rider' ? 'Rider pinned' : 'Location saved'}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 text-sm">
                      {[addr.written_address, addr.area_name, addr.city].filter(Boolean).join(', ')}
                    </p>
                    {addr.landmark && (
                      <p className="text-gray-500 text-xs mt-1">Near: {addr.landmark}</p>
                    )}
                    {addr.door_picture_url && (
                      <div className="mt-2">
                        <img
                          src={resolveImageUrl(addr.door_picture_url)}
                          alt="Door"
                          className="w-20 h-16 object-cover rounded border"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!addr.is_default && (
                      <button
                        onClick={() => handleSetDefault(addr.id)}
                        title="Set as default"
                        className="p-2 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-lg transition-colors"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEditForm(addr)}
                      title="Edit"
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      title="Delete"
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
