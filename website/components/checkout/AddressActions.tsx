'use client'

import { useState } from 'react'
import { Edit2, Trash2, Loader2, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { addressesApi } from '@/lib/api'

export type EditableAddress = {
  id: string
  address_type: string
  written_address: string
  area_name: string
  city: string
  is_default: boolean
  landmark?: string
}

interface AddressActionsProps {
  address: EditableAddress
  /** Replace this address in the parent list after save. */
  onUpdated: (updated: EditableAddress) => void
  /** Remove this address from the parent list after delete. */
  onDeleted: (id: string) => void
}

/**
 * Inline edit + delete controls for a saved address row. Used by the
 * checkout page so the user doesn't have to leave the flow to fix or
 * remove an address.
 */
export default function AddressActions({
  address,
  onUpdated,
  onDeleted,
}: AddressActionsProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState({
    written_address: address.written_address || '',
    area_name: address.area_name || '',
    city: address.city || 'Gujrat',
    landmark: address.landmark || '',
    address_type: address.address_type || 'home',
  })

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditing(true)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditing(false)
    setDraft({
      written_address: address.written_address || '',
      area_name: address.area_name || '',
      city: address.city || 'Gujrat',
      landmark: address.landmark || '',
      address_type: address.address_type || 'home',
    })
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draft.written_address.trim() || draft.written_address.trim().length < 5) {
      toast.error('Address must be at least 5 characters')
      return
    }
    setSaving(true)
    try {
      await addressesApi.update(address.id, {
        address_type: draft.address_type,
        written_address: draft.written_address.trim(),
        area_name: draft.area_name.trim() || 'N/A',
        city: draft.city,
        landmark: draft.landmark.trim(),
      } as any)
      onUpdated({
        ...address,
        address_type: draft.address_type,
        written_address: draft.written_address.trim(),
        area_name: draft.area_name.trim() || 'N/A',
        city: draft.city,
        landmark: draft.landmark.trim(),
      })
      setEditing(false)
      toast.success('Address updated')
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not update address'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

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
    return (
      <div className="mt-3 space-y-3 rounded-lg border border-primary-200 bg-white p-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={draft.address_type}
              onChange={(e) =>
                setDraft((d) => ({ ...d, address_type: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="office">Office</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Area Name"
            value={draft.area_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDraft((d) => ({ ...d, area_name: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Full Address *
          </label>
          <textarea
            rows={2}
            value={draft.written_address}
            onChange={(e) =>
              setDraft((d) => ({ ...d, written_address: e.target.value }))
            }
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Input
          label="Landmark"
          value={draft.landmark}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setDraft((d) => ({ ...d, landmark: e.target.value }))
          }
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <button
        type="button"
        onClick={handleStartEdit}
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
