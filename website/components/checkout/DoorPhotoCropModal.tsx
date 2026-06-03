'use client'

import { useCallback, useEffect, useState } from 'react'
import { Crop, ImageIcon, Loader2, X } from 'lucide-react'
import { processDoorPhoto } from '@/lib/doorPhoto'

type Props = {
  open: boolean
  file: File | null
  previewUrl: string | null
  onCancel: () => void
  onConfirm: (file: File) => void
}

/**
 * Full-screen door photo review — matches customer-app DoorPhotoCropModal.
 */
export default function DoorPhotoCropModal({
  open,
  file,
  previewUrl,
  onCancel,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open])

  const finish = useCallback(
    async (doCrop: boolean) => {
      if (!file) return
      setBusy(true)
      try {
        const out = await processDoorPhoto(file, doCrop)
        onConfirm(out)
      } finally {
        setBusy(false)
      }
    },
    [file, onConfirm]
  )

  if (!open || !previewUrl) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900">
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-60"
          aria-label="Cancel"
        >
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-base font-semibold text-white">Door photo</h2>
        <div className="h-10 w-10" />
      </header>

      <div className="relative mx-auto flex w-full max-h-[55vh] min-h-[240px] flex-1 items-center justify-center bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Door preview"
          className="max-h-full max-w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-xl border-2 border-white/95 shadow-lg"
            style={{ width: 'min(78vw, 320px)', height: 'min(78vw, 320px)' }}
          />
        </div>
      </div>

      <p className="mt-4 px-6 text-center text-sm leading-relaxed text-slate-400">
        Crop to the square frame with &quot;Crop &amp; use&quot;, or keep the whole image with
        &quot;Use full photo&quot;.
      </p>

      <div className="mt-auto space-y-3 p-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => void finish(false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60"
        >
          <ImageIcon className="h-5 w-5" />
          Use full photo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void finish(true)}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3.5 text-base font-bold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Crop className="h-5 w-5" />
              Crop &amp; use
            </>
          )}
        </button>
      </div>
    </div>
  )
}
