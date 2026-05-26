'use client'

import { useState } from 'react'
import { Edit2, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { addressesApi } from '@/lib/api'
import AddressForm, { type SavedAddress, type AddressFormInitial } from './AddressForm'

export type EditableAddress = SavedAddress

interface AddressActionsProps {
  address: EditableAddress
  /** Cities passed through to the embedded edit form. */
  availableCities: { id: string; name: string; province: string }[]
  /** Replace this address in the parent list after save. */
  onUpdated: (updated: EditableAddress) => void
  /** Remove this address from the parent list after delete. */
  onDeleted: (id: string) => void
}

/**
 * Inline edit + delete controls for a saved address. Edit uses the full
 * AddressForm (same fields as Add-New) so users can change door picture and
 * GPS location too.
 */
export default function AddressActions({
  address,
  availableCities,
  onUpdated,
  onDeleted,
}: AddressActionsProps) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok =
      typeof window !== 'undefined'
        ? window.confirm('Delete this saved address? This cannot be undone.')
        : false
    if (!ok) return
    setDeleting(true)
    try {
      await addressesApi.delete(address.id)
      onDeleted(address.id)
      toast.success('Address deleted')
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not delete address'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  if (editing) {
    const initial: AddressFormInitial = {
      id: address.id,
      address_type: address.address_type,
      written_address: address.written_address,
      area_name: address.area_name,
      city: address.city,
      landmark: address.landmark,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      door_picture_url: address.door_picture_url ?? null,
    }
    return (
      <div className="mt-3 rounded-lg border border-primary-200 bg-white p-3">
        <AddressForm
          initial={initial}
          availableCities={availableCities}
          onSaved={(updated) => {
            onUpdated({ ...address, ...updated })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setEditing(true)
        }}
        className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
      >
        <Edit2 className="w-3.5 h-3.5" /> Edit
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium disabled:opacity-60"
      >
        {deleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        Delete
      </button>
    </div>
  )
}
