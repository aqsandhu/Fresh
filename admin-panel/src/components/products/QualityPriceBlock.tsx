// One quality tier (A/B/C) of the admin product form (moved out of
// pages/Products.tsx, W21).
import React from 'react';
import { Input } from '@/components/ui/Input';
import type { CreateProductData } from '@/types';
import { QUALITY_FIELDS } from './productForm';

const QUALITY_TONE: Record<'A' | 'B' | 'C', string> = {
  A: 'border-emerald-200 bg-emerald-50/40',
  B: 'border-blue-200 bg-blue-50/40',
  C: 'border-amber-200 bg-amber-50/40',
};

/**
 * One product quality tier (A/B/C). A is always shown; B/C open via the
 * "Offer this quality" checkbox. Each tier carries its own consumer price +
 * ½/¼ (or ½ dozen) overrides + single stock, a consumer allow toggle, and a
 * restaurant allow toggle that reveals the tier's restaurant prices. Stock is
 * shared between consumer + restaurant (one bucket per quality).
 */
export const QualityPriceBlock: React.FC<{
  quality: 'A' | 'B' | 'C';
  fd: CreateProductData;
  setFd: React.Dispatch<React.SetStateAction<CreateProductData>>;
  restaurantAllowed: boolean;
  priceError?: string;
}> = ({ quality, fd, setFd, restaurantAllowed, priceError }) => {
  const f = QUALITY_FIELDS[quality];
  const isKg = fd.unitType === 'kg' || fd.unitType === 'gram';
  const isDozen = fd.unitType === 'dozen';
  const set = (key: keyof CreateProductData, val: any) => setFd((prev) => ({ ...prev, [key]: val }));
  const numVal = (key: keyof CreateProductData) => { const v = fd[key] as any; return v == null ? '' : v; };
  const onNum = (key: keyof CreateProductData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, e.target.value === '' ? null : parseFloat(e.target.value));
  const baseNum = Number(fd[f.base]) || 0;

  // B/C open when they carry a base price; A is always open.
  const open = quality === 'A' || fd[f.base] != null;
  const toggleOffer = (on: boolean) => {
    if (on) { set(f.base, 0); }
    else {
      // Clear the whole tier so it is no longer offered anywhere.
      setFd((prev) => ({
        ...prev,
        [f.base]: null, [f.half]: null, [f.quarter]: null, [f.halfDozen]: null, [f.stock]: null,
        [f.restEnabled]: false, [f.restBase]: null, [f.restHalf]: null, [f.restQuarter]: null, [f.restHalfDozen]: null,
      }));
    }
  };

  const fractionInputs = (baseKey: keyof CreateProductData, halfKey: keyof CreateProductData, quarterKey: keyof CreateProductData, halfDozenKey: keyof CreateProductData) => {
    const bn = Number(fd[baseKey]) || 0;
    return (
      <>
        {isKg && fd.allowHalfKg !== false && (
          <Input label="½ kg (Rs.)" type="number" min={0} step={0.01} value={numVal(halfKey)} onChange={onNum(halfKey)}
            placeholder={`auto ${(bn * 0.5).toFixed(0)}`} helperText="Blank = 50%" />
        )}
        {isKg && fd.allowQuarterKg !== false && (
          <Input label="¼ kg (Rs.)" type="number" min={0} step={0.01} value={numVal(quarterKey)} onChange={onNum(quarterKey)}
            placeholder={`auto ${(bn * 0.25).toFixed(0)}`} helperText="Blank = 25%" />
        )}
        {isDozen && (
          <Input label="½ dozen (Rs.)" type="number" min={0} step={0.01} value={numVal(halfDozenKey)} onChange={onNum(halfDozenKey)}
            placeholder={`auto ${(bn * 0.5).toFixed(0)}`} helperText="Blank = 50%" />
        )}
      </>
    );
  };

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${QUALITY_TONE[quality]}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">Quality {quality}</h4>
        {quality !== 'A' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={open} onChange={(e) => toggleOffer(e.target.checked)} className="w-4 h-4 rounded" />
            Offer Quality {quality}
          </label>
        )}
      </div>

      {open && (
        <>
          {/* Consumer */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={fd[f.consumer] !== false} onChange={(e) => set(f.consumer, e.target.checked)} className="w-4 h-4 rounded" />
              Allow for consumers
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label={`Consumer price / ${fd.unitType} (Rs.)`} type="number" min={0} step={0.01}
                value={numVal(f.base)} onChange={onNum(f.base)} error={priceError}
                required={quality === 'A'} />
              {fractionInputs(f.base, f.half, f.quarter, f.halfDozen)}
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">Quality {quality} stock</span>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700">
                  {Number(fd[f.stock]) || 0} {fd.unitType}
                  <span className="ml-1 text-xs text-gray-400">(read-only · managed in Management)</span>
                </div>
              </div>
            </div>
            {(Number(fd[f.stock]) || 0) <= 0 && (
              <p className="text-xs text-red-600">No stock for Quality {quality} yet — add it via Management → Expenses (Stock purchase) before it can sell.</p>
            )}
            {baseNum > 0 && <p className="text-xs text-gray-400">A blank ½/¼ price auto-charges 50% / 25% of the per-unit price.</p>}
          </div>

          {/* Restaurant */}
          <div className="rounded-lg border border-amber-200 bg-white/60 p-3 space-y-2">
            <label className={`flex items-center gap-2 text-sm font-medium ${restaurantAllowed ? 'cursor-pointer text-gray-700' : 'cursor-not-allowed text-gray-400'} select-none`}>
              <input type="checkbox" disabled={!restaurantAllowed} checked={restaurantAllowed && fd[f.restEnabled] === true} onChange={(e) => set(f.restEnabled, e.target.checked)} className="w-4 h-4 rounded" />
              Allow for restaurants
            </label>
            {restaurantAllowed && fd[f.restEnabled] === true && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="Restaurant price (Rs.)" type="number" min={0} step={0.01}
                  value={numVal(f.restBase)} onChange={onNum(f.restBase)} helperText="Blank → consumer price" />
                {fractionInputs(f.restBase, f.restHalf, f.restQuarter, f.restHalfDozen)}
              </div>
            )}
            {!restaurantAllowed && <p className="text-xs text-gray-400">Enable “Category also for restaurants” first.</p>}
          </div>
        </>
      )}
    </div>
  );
};
