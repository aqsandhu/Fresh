'use client'

// Checkout "Delivery Time" (moved out of the checkout page, W21): urgent
// delivery when the office offers it, otherwise today / tomorrow slots.
import type { Dispatch, Ref, SetStateAction } from 'react'
import { motion } from 'framer-motion'
import { Clock, Zap, Loader2, CalendarDays } from 'lucide-react'
import { formatPriceShort } from '@/lib/utils'
import SlotTimeLabel from '@/components/checkout/SlotTimeLabel'
import { getSlotAvailability } from '@/lib/timeSlots'
import { pktDisplayDate, pktWallClock } from '@/lib/businessDate'
import type { CheckoutDay, CheckoutSlot, UrgentInfo } from './checkoutTypes'

export default function DeliveryTimeSection({
  deliveryTimeRef,
  urgentInfo,
  urgent,
  setUrgent,
  selectedDay,
  handleDayChange,
  loadingSlots,
  timeSlots,
  slotCutoffPercent,
  selectedTimeSlot,
  setSelectedTimeSlot,
}: {
  /** The page scrolls here when Place Order is pressed without a time. */
  deliveryTimeRef: Ref<HTMLDivElement>
  urgentInfo: UrgentInfo
  urgent: boolean
  setUrgent: Dispatch<SetStateAction<boolean>>
  selectedDay: CheckoutDay
  handleDayChange: (day: CheckoutDay) => void
  loadingSlots: boolean
  timeSlots: CheckoutSlot[]
  slotCutoffPercent: number
  selectedTimeSlot: string
  setSelectedTimeSlot: (slotId: string) => void
}) {
  return (
    <motion.div
      ref={deliveryTimeRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white rounded-xl p-6 shadow-sm scroll-mt-24"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
          <Clock className="w-5 h-5 text-primary-600" />
        </div>
        <h2 className="text-xl font-semibold">Delivery Time</h2>
      </div>

      {urgentInfo.enabled && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setUrgent((v) => !v)}
            className={`w-full flex items-center justify-between rounded-xl border-2 p-4 transition-colors ${
              urgent ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
            }`}
          >
            <span className="flex items-center gap-3 text-left">
              <Zap className={`w-5 h-5 ${urgent ? 'text-amber-600' : 'text-gray-500'}`} />
              <span>
                <span className="block font-semibold text-gray-900">Urgent delivery</span>
                <span className="block text-xs text-gray-500">
                  {urgentInfo.eta ? `Approx. ${urgentInfo.eta}` : 'Fastest available'} · no time slot needed
                </span>
              </span>
            </span>
            <span className="font-bold text-amber-600">{formatPriceShort(urgentInfo.charge)}</span>
          </button>
          {urgent && (
            <p className="mt-2 text-xs text-amber-700">
              Free-delivery offers and coupons don&apos;t apply to urgent delivery.
            </p>
          )}
        </div>
      )}

      {!urgent && (
      <>
      <p className="text-sm font-medium text-gray-800 mb-4">
        {selectedDay === 'today'
          ? 'Today available time slots'
          : 'Tomorrow time slots'}
      </p>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {loadingSlots ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : timeSlots.length === 0 ? (
          <p className="col-span-full text-gray-500 text-sm">
            No time slots available for {selectedDay === 'today' ? 'today' : 'tomorrow'}
          </p>
        ) : (
          timeSlots.map((slot) => {
            const availability = getSlotAvailability(slot, selectedDay, slotCutoffPercent, pktWallClock())
            const slotDisabled =
              slot.available_slots <= 0 || availability.unavailable
            return (
              <label
                key={slot.id}
                className={`flex flex-col items-center p-4 border-2 rounded-xl transition-colors ${
                  slotDisabled
                    ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50'
                    : selectedTimeSlot === slot.id
                    ? 'border-primary-500 bg-primary-50 cursor-pointer'
                    : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="timeSlot"
                  value={slot.id}
                  checked={selectedTimeSlot === slot.id}
                  onChange={(e) => setSelectedTimeSlot(e.target.value)}
                  disabled={slotDisabled}
                  className="sr-only"
                />
                <Clock className={`w-6 h-6 mb-2 ${slotDisabled ? 'text-gray-500' : 'text-primary-600'}`} />
                <span className="font-medium text-center text-sm">
                  <SlotTimeLabel startTime={slot.start_time} endTime={slot.end_time} />
                </span>
                {slot.is_free_delivery_slot && !slotDisabled && (
                  <span className="text-xs text-green-600 mt-1">FREE DELIVERY</span>
                )}
                {slot.available_slots <= 0 && (
                  <span className="text-xs text-red-500 mt-1">FULL</span>
                )}
                {availability.unavailable && slot.available_slots > 0 && (
                  <span className="text-xs text-gray-500 mt-1">
                    {availability.reason === 'expired' ? 'Passed' : 'Unavailable'}
                  </span>
                )}
              </label>
            )
          })
        )}
      </div>

      <div className="flex gap-3 mt-6">
        {(['today', 'tomorrow'] as const).map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => handleDayChange(day)}
            className={`flex-1 flex flex-col items-center py-3 px-4 rounded-xl border-2 transition-colors ${
              selectedDay === day
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            }`}
          >
            <CalendarDays className="w-5 h-5 mb-1" />
            <span className="font-semibold text-sm capitalize">{day}</span>
            <span className="text-xs opacity-75">{pktDisplayDate(day)}</span>
          </button>
        ))}
      </div>
      </>
      )}
    </motion.div>
  )
}
