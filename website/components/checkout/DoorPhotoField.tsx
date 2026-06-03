'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { resolveImageUrl } from '@/lib/utils'
import DoorPhotoCropModal from './DoorPhotoCropModal'

type Props = {
  value: File | null
  onChange: (file: File | null) => void
  existingUrl?: string | null
}

/** Door picture upload + crop flow — matches customer-app CheckoutAddressForm. */
export default function DoorPhotoField({ value, onChange, existingUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  useEffect(() => {
    if (!cropPreviewUrl) return
    return () => URL.revokeObjectURL(cropPreviewUrl)
  }, [cropPreviewUrl])

  const openPicker = () => inputRef.current?.click()

  const onFileSelected = (file: File | null) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setCropFile(file)
    setCropPreviewUrl(url)
  }

  const closeCrop = () => {
    setCropFile(null)
    if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl)
    setCropPreviewUrl(null)
  }

  const displayUrl = previewUrl || (existingUrl && !value ? resolveImageUrl(existingUrl) : null)

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-700">
        Door Picture (Optional)
      </label>

      {existingUrl && !value && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImageUrl(existingUrl) || existingUrl}
            alt="Current door"
            className="h-14 w-14 rounded-md object-cover"
          />
          <span className="flex-1 text-xs text-gray-600">
            Current door picture. Upload a new one below to replace it.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={openPicker}
        className="block w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center transition-colors hover:border-primary-400 min-h-[100px]"
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="Door" className="h-[120px] w-full object-cover" />
        ) : (
          <div className="px-4 py-8">
            <Camera className="mx-auto mb-2 h-7 w-7 text-gray-400" />
            <p className="text-sm text-gray-500">Tap to upload a picture of your door</p>
            <p className="mt-1 text-xs text-gray-400">
              Helps our delivery partner find your location
            </p>
          </div>
        )}
      </button>

      {value && (
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPicker}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Change photo
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm font-medium text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0] || null)
          e.target.value = ''
        }}
      />

      <DoorPhotoCropModal
        open={Boolean(cropFile && cropPreviewUrl)}
        file={cropFile}
        previewUrl={cropPreviewUrl}
        onCancel={closeCrop}
        onConfirm={(file) => {
          onChange(file)
          closeCrop()
        }}
      />
    </div>
  )
}
