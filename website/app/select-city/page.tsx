'use client'

import { useMemo, useState } from 'react'
import { MapPin, Search, Store } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'

export default function SelectCityPage() {
  const { cities, selectedCityId, setCity, isLoading } = useCityContext()
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Select your city</h1>
          <p className="text-gray-600">
            Choose your delivery city to see products, categories, and offers available near you.
          </p>
          <p className="text-gray-500 font-urdu mt-2" dir="rtl">
            اپنی شہر منتخب کریں
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or province..."
              autoFocus
              className="w-full rounded-xl border border-gray-200 py-3 pl-11 pr-4 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-gray-500">Loading cities...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              No cities found. Try a different search.
            </div>
          ) : (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              {filtered.map((city) => {
                const active = city.id === selectedCityId
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => setCity(city)}
                    className={`w-full flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all ${
                      active
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{city.name}</p>
                      {city.province && (
                        <p className="text-sm text-gray-500">{city.province}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
