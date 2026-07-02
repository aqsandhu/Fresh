'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { AlertTriangle, Trash2, ShieldCheck, LogIn, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/cartStore'
import { authApi } from '@/lib/api'

/**
 * Public account-deletion page. Google Play's Data Safety form requires a
 * web URL where users can delete their account without reinstalling the
 * app; Apple points reviewers here too. Logged-in users can delete
 * directly; others get the exact steps.
 */
export default function DeleteAccountPage() {
  const router = useRouter()
  const { isAuthenticated, user, logout } = useAuthStore()
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirmChecked || deleting) return
    setDeleting(true)
    try {
      await authApi.deleteAccount()
      logout()
      toast.success('Your account has been deleted')
      router.push('/')
    } catch {
      toast.error('Account delete nahi ho saka — dobara koshish karein ya support se rabta karein')
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto max-w-2xl px-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Delete Your Account</h1>
        <p className="mt-1 text-lg font-bold text-gray-500 font-urdu" dir="rtl">
          اپنا اکاؤنٹ ختم کریں
        </p>

        {/* What happens */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ShieldCheck className="h-5 w-5 text-primary-600" />
            What gets deleted
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-600">
            <li>Your name, phone number, and email</li>
            <li>All saved delivery addresses</li>
            <li>Your login (PIN) and notification tokens</li>
          </ul>
          <p className="mt-3 text-sm text-gray-500">
            Order and payment records are kept for legal book-keeping, but they are
            fully anonymized — they no longer identify you. Deletion is immediate
            and <span className="font-semibold text-gray-700">cannot be undone</span>.
            The same phone number can register a fresh account later.
          </p>
        </div>

        {isAuthenticated ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Delete the account for {user?.name || 'this user'}
            </h2>
            <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-red-900">
                I understand this permanently deletes my account and personal data.
              </span>
            </label>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmChecked || deleting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleting ? 'Deleting…' : 'Delete my account permanently'}
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">How to delete your account</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
              <li>
                <Link
                  href="/login?redirect=/delete-account"
                  className="font-semibold text-primary-600 hover:underline"
                >
                  Log in
                </Link>{' '}
                with your phone number, then return to this page and press the delete button.
              </li>
              <li>
                Or in the Fresh Bazar app: <span className="font-medium text-gray-800">
                Profile → Settings → Delete Account</span>.
              </li>
              <li>
                Or email us at{' '}
                <a href="mailto:support@freshbazar.pk" className="font-semibold text-primary-600 hover:underline">
                  support@freshbazar.pk
                </a>{' '}
                from any address, mentioning your registered phone number — we delete the
                account within 7 days.
              </li>
            </ol>
            <Link
              href="/login?redirect=/delete-account"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700"
            >
              <LogIn className="h-4 w-4" />
              Log in to continue
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
