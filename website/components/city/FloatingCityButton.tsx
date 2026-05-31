'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MapPin, Search, X } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'

export default function FloatingCityButton() {
  const pathname = usePathname()
  const { cities, selectedCity, setCity, isLoading } = useCityContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cities
    return cities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.province.toLowerCase().includes(q)
    )
  }, [cities, query])

  if (pathname.startsWith('/select-city') || !selectedCity) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 z-50 flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-primary-700 transition-colors"
        aria-label="Change delivery city"
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="max-w-[120px] truncate">{selectedCity.name}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Change city</h2>
                <p className="text-sm text-gray-500">Cart is saved separately for each city</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search city..."
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-5 space-y-2">
              {isLoading ? (
                <p className="text-center text-sm text-gray-500 py-8">Loading cities...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">No cities found</p>
              ) : (
                filtered.map((city) => {
                  const active = city.id === selectedCity.id
                  return (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => {
                        if (!active) setCity(city)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-medium text-gray-900">{city.name}</p>
                      {city.province && (
                        <p className="text-sm text-gray-500">{city.province}</p>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
