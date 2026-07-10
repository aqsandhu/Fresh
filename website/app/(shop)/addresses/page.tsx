'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Star,
  ArrowLeft,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/cartStore'
import { addressesApi } from '@/lib/api'
import api from '@/lib/api'
import { resolveImageUrl } from '@/lib/utils'
import AddressForm, { type AddressFormInitial } from '@/components/checkout/AddressForm'
import { useCityContext } from '@/context/CityContext'
import { addressMatchesSelectedCity } from '@/lib/cityStorage'

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
  const { selectedCity } = useCityContext()
  const [addresses, setAddresses] = useState<FullAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formInitial, setFormInitial] = useState<AddressFormInitial | undefined>(undefined)

  const serviceCities = selectedCity
    ? [{ id: selectedCity.id, name: selectedCity.name, province: selectedCity.province || '' }]
    : []

  const cityAddresses = useMemo(
    () =>
      selectedCity?.name
        ? addresses.filter((a) => addressMatchesSelectedCity(a.city, selectedCity.name))
        : addresses,
    [addresses, selectedCity?.name]
  )

  const loadAddresses = useCallback(async () => {
    try {
      const res = await api.get('/addresses')
      const raw = res.data?.data || res.data || []
      setAddresses(Array.isArray(raw) ? raw : [])
    } catch {
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/addresses')
      return
    }
    loadAddresses()
    // selectedCity?.id keyed on purpose: cityAddresses re-filters per city and a
    // fresh fetch keeps the list current when the user switches city.
  }, [isAuthenticated, selectedCity?.id, router, loadAddresses])

  const closeForm = () => {
    setFormInitial(undefined)
    setShowForm(false)
  }

  const openAddForm = () => {
    setFormInitial(undefined)
    setShowForm(true)
  }

  const openEditForm = (addr: FullAddress) => {
    setFormInitial({
      id: addr.id,
      address_type: addr.address_type || 'home',
      written_address: addr.written_address || '',
      area_name: addr.area_name || '',
      city: addr.city || selectedCity?.name || 'Gujrat',
      landmark: addr.landmark || '',
      latitude: addr.latitude ?? null,
      longitude: addr.longitude ?? null,
      door_picture_url: addr.door_picture_url,
      is_default: addr.is_default,
    })
    setShowForm(true)
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
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">
                {formInitial?.id ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button onClick={closeForm} className="p-1 hover:bg-gray-100 rounded" type="button">
                <X className="w-5 h-5" />
              </button>
            </div>

            <AddressForm
              key={formInitial?.id || 'new'}
              initial={formInitial}
              availableCities={serviceCities}
              defaultOnCreate={cityAddresses.length === 0 && !formInitial?.id}
              onSaved={() => {
                closeForm()
                loadAddresses()
              }}
              onCancel={closeForm}
            />
          </motion.div>
        )}

        {/* Address List */}
        {cityAddresses.length === 0 && !showForm ? (
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
            {cityAddresses.map((addr, index) => (
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
                        <Image
                          src={resolveImageUrl(addr.door_picture_url)}
                          alt="Door"
                          width={80}
                          height={64}
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
