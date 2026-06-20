import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Search, Loader2, UtensilsCrossed } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { productService } from '@/services/product.service';
import { categoryService } from '@/services/category.service';
import type { Product } from '@/types';
import toast from 'react-hot-toast';

// One place to edit every product's per-quality prices (A/B/C: per-kg + ½kg +
// ¼kg), the ½/¼ sell toggles, restaurant allow + restaurant prices per quality,
// and active/paused. Saving PUTs only the changed fields, so per-product detail
// set in the product form (consumer enable, etc.) is preserved.

type Row = {
  isActive: boolean;
  allowHalfKg: boolean;
  allowQuarterKg: boolean;
  // Quality A (always offered)
  price: string; halfKgPrice: string; quarterKgPrice: string;
  restA: boolean; restPriceA: string; restHalfA: string; restQuarterA: string;
  // Quality B
  bEnabled: boolean; priceB: string; halfKgPriceB: string; quarterKgPriceB: string;
  restB: boolean; restPriceB: string; restHalfB: string; restQuarterB: string;
  // Quality C
  cEnabled: boolean; priceC: string; halfKgPriceC: string; quarterKgPriceC: string;
  restC: boolean; restPriceC: string; restHalfC: string; restQuarterC: string;
};

const numStr = (v: number | null | undefined): string => (v == null ? '' : String(v));
const numOrNull = (s: string): number | null => {
  const n = parseFloat(s);
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

function toRow(p: Product): Row {
  return {
    isActive: !!p.isActive,
    allowHalfKg: p.allowHalfKg !== false,
    allowQuarterKg: p.allowQuarterKg !== false,
    price: numStr(p.price), halfKgPrice: numStr(p.halfKgPrice), quarterKgPrice: numStr(p.quarterKgPrice),
    restA: p.restaurantEnabledA === true, restPriceA: numStr(p.restaurantPriceA), restHalfA: numStr(p.restaurantHalfKgPriceA), restQuarterA: numStr(p.restaurantQuarterKgPriceA),
    bEnabled: p.priceB != null, priceB: numStr(p.priceB), halfKgPriceB: numStr(p.halfKgPriceB), quarterKgPriceB: numStr(p.quarterKgPriceB),
    restB: p.restaurantEnabledB === true, restPriceB: numStr(p.restaurantPriceB), restHalfB: numStr(p.restaurantHalfKgPriceB), restQuarterB: numStr(p.restaurantQuarterKgPriceB),
    cEnabled: p.priceC != null, priceC: numStr(p.priceC), halfKgPriceC: numStr(p.halfKgPriceC), quarterKgPriceC: numStr(p.quarterKgPriceC),
    restC: p.restaurantEnabledC === true, restPriceC: numStr(p.restaurantPriceC), restHalfC: numStr(p.restaurantHalfKgPriceC), restQuarterC: numStr(p.restaurantQuarterKgPriceC),
  };
}

const rowEq = (a: Row, b: Row) => (Object.keys(a) as (keyof Row)[]).every((k) => a[k] === b[k]);

const placeholderFor = (perKg: string, frac: number): string => {
  const n = parseFloat(perKg);
  return Number.isFinite(n) ? `auto ${Math.round(n * frac * 100) / 100}` : 'auto';
};

export const PriceManager: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const originals = useRef<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['products', 'price-manager'],
    queryFn: () => productService.getProducts({ limit: 500 }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const products = useMemo(() => data?.products || [], [data]);
  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  // Which categories allow restaurants — gates the per-quality restaurant controls.
  const { data: cats } = useQuery({ queryKey: ['categories', 'price-manager'], queryFn: () => categoryService.getCategories() });
  const catAllowsRestaurants = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of cats || []) m[c.id] = c.availableForRestaurants === true;
    return m;
  }, [cats]);

  useEffect(() => {
    const next: Record<string, Row> = {};
    for (const p of products) next[p.id] = toRow(p);
    originals.current = next;
    setRows(JSON.parse(JSON.stringify(next)));
  }, [products]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.categoryName && s.add(p.categoryName));
    return [...s].sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.categoryName !== category) return false;
      if (statusFilter === 'active' && !rows[p.id]?.isActive) return false;
      if (statusFilter === 'paused' && rows[p.id]?.isActive) return false;
      if (q && !String(p.nameEn || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, category, statusFilter, rows]);

  const dirtyIds = useMemo(
    () => Object.keys(rows).filter((id) => originals.current[id] && !rowEq(rows[id], originals.current[id])),
    [rows]
  );

  const setCell = (id: string, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const discard = () => setRows(JSON.parse(JSON.stringify(originals.current)));

  const save = async () => {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    const results = await Promise.allSettled(
      dirtyIds.map((id) => {
        const r = rows[id];
        const p = productById[id];
        const catRest = p ? catAllowsRestaurants[p.categoryId] === true : false;
        const restA = catRest && r.restA;
        const restB = catRest && r.bEnabled && r.restB;
        const restC = catRest && r.cEnabled && r.restC;
        return productService.updateProduct(id, {
          isActive: r.isActive,
          allowHalfKg: r.allowHalfKg,
          allowQuarterKg: r.allowQuarterKg,
          price: parseFloat(r.price) || 0,
          halfKgPrice: numOrNull(r.halfKgPrice),
          quarterKgPrice: numOrNull(r.quarterKgPrice),
          priceB: r.bEnabled ? numOrNull(r.priceB) : null,
          halfKgPriceB: r.bEnabled ? numOrNull(r.halfKgPriceB) : null,
          quarterKgPriceB: r.bEnabled ? numOrNull(r.quarterKgPriceB) : null,
          priceC: r.cEnabled ? numOrNull(r.priceC) : null,
          halfKgPriceC: r.cEnabled ? numOrNull(r.halfKgPriceC) : null,
          quarterKgPriceC: r.cEnabled ? numOrNull(r.quarterKgPriceC) : null,
          restaurantEnabledA: restA,
          restaurantEnabledB: restB,
          restaurantEnabledC: restC,
          availableForRestaurants: restA || restB || restC,
          // Restaurant prices only when that quality is offered to restaurants;
          // otherwise leave them untouched (undefined => not sent => preserved).
          ...(restA ? { restaurantPriceA: numOrNull(r.restPriceA), restaurantHalfKgPriceA: numOrNull(r.restHalfA), restaurantQuarterKgPriceA: numOrNull(r.restQuarterA) } : {}),
          ...(restB ? { restaurantPriceB: numOrNull(r.restPriceB), restaurantHalfKgPriceB: numOrNull(r.restHalfB), restaurantQuarterKgPriceB: numOrNull(r.restQuarterB) } : {}),
          ...(restC ? { restaurantPriceC: numOrNull(r.restPriceC), restaurantHalfKgPriceC: numOrNull(r.restHalfC), restaurantQuarterKgPriceC: numOrNull(r.restQuarterC) } : {}),
        });
      })
    );
    setSaving(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok) toast.success(`${ok} product${ok === 1 ? '' : 's'} updated`);
    if (failed) toast.error(`${failed} failed to update`);
    qc.invalidateQueries({ queryKey: ['products'] });
    refetch();
  };

  return (
    <Layout title="Price Manager" subtitle="Edit every product's quality prices, units, restaurant access and status in one place">
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="paused">Paused only</option>
          </select>
        </div>
      </Card>

      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 mb-3">
        <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 shadow-sm border ${dirtyIds.length ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
          <span className="text-sm text-gray-600">
            {dirtyIds.length ? <><span className="font-semibold text-amber-700">{dirtyIds.length}</span> unsaved change{dirtyIds.length === 1 ? '' : 's'}</> : 'No unsaved changes'}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={discard} disabled={!dirtyIds.length || saving} leftIcon={<RotateCcw className="w-4 h-4" />}>Discard</Button>
            <Button size="sm" onClick={save} disabled={!dirtyIds.length || saving} isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>Save changes</Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No products match.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const r = rows[p.id];
            if (!r) return null;
            const dirty = originals.current[p.id] && !rowEq(r, originals.current[p.id]);
            const catRest = catAllowsRestaurants[p.categoryId] === true;
            return (
              <ProductPriceCard key={p.id} product={p} row={r} dirty={!!dirty} catRest={catRest} set={(patch) => setCell(p.id, patch)} />
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Per quality you set the per-unit price plus optional ½kg / ¼kg overrides (blank = auto 50% / 25%). Tick
        “Restaurants” to also sell that quality to restaurants and set its restaurant rates (blank → consumer price).
        Restaurant access only shows for products whose category allows restaurants. Changes update the consumer +
        restaurant storefronts everywhere.
      </p>
    </Layout>
  );
};

// ── One product card (header + Quality A/B/C rows) ───────────────────────────
function ProductPriceCard({
  product: p, row: r, dirty, catRest, set,
}: {
  product: Product; row: Row; dirty: boolean; catRest: boolean; set: (patch: Partial<Row>) => void;
}) {
  const isKg = String(p.unitType).toLowerCase() === 'kg' || String(p.unitType).toLowerCase() === 'gram';

  return (
    <Card className={`p-4 ${dirty ? 'ring-1 ring-amber-300 bg-amber-50/30' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">{p.nameEn}</h3>
          <p className="text-xs text-gray-400">{p.categoryName} · {p.unitType}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {isKg && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={r.allowHalfKg} onChange={(e) => set({ allowHalfKg: e.target.checked })} className="w-4 h-4 rounded" /> Sell ½kg
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={r.allowQuarterKg} onChange={(e) => set({ allowQuarterKg: e.target.checked })} className="w-4 h-4 rounded" /> Sell ¼kg
              </label>
            </>
          )}
          <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${r.isActive ? 'text-green-700' : 'text-gray-500'}`}>
            <input type="checkbox" checked={r.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="w-4 h-4 rounded" />
            {r.isActive ? 'Active' : 'Paused'}
          </label>
        </div>
      </div>

      <div className="mt-2 divide-y divide-gray-50">
        <QualityEditLine label="A" tone="emerald" isKg={isKg} catRest={catRest} offered enabledToggle={null}
          priceKey="price" halfKey="halfKgPrice" quarterKey="quarterKgPrice" restKey="restA"
          restPriceKey="restPriceA" restHalfKey="restHalfA" restQuarterKey="restQuarterA"
          allowHalf={r.allowHalfKg} allowQuarter={r.allowQuarterKg} r={r} set={set} />
        <QualityEditLine label="B" tone="blue" isKg={isKg} catRest={catRest} offered={r.bEnabled} enabledToggle={(v) => set({ bEnabled: v })}
          priceKey="priceB" halfKey="halfKgPriceB" quarterKey="quarterKgPriceB" restKey="restB"
          restPriceKey="restPriceB" restHalfKey="restHalfB" restQuarterKey="restQuarterB"
          allowHalf={r.allowHalfKg} allowQuarter={r.allowQuarterKg} r={r} set={set} />
        <QualityEditLine label="C" tone="amber" isKg={isKg} catRest={catRest} offered={r.cEnabled} enabledToggle={(v) => set({ cEnabled: v })}
          priceKey="priceC" halfKey="halfKgPriceC" quarterKey="quarterKgPriceC" restKey="restC"
          restPriceKey="restPriceC" restHalfKey="restHalfC" restQuarterKey="restQuarterC"
          allowHalf={r.allowHalfKg} allowQuarter={r.allowQuarterKg} r={r} set={set} />
      </div>
    </Card>
  );
}

function QualityEditLine({
  label, tone, isKg, catRest, offered, enabledToggle,
  priceKey, halfKey, quarterKey, restKey, restPriceKey, restHalfKey, restQuarterKey,
  allowHalf, allowQuarter, r, set,
}: {
  label: 'A' | 'B' | 'C';
  tone: 'emerald' | 'blue' | 'amber';
  isKg: boolean; catRest: boolean; offered: boolean;
  enabledToggle: ((v: boolean) => void) | null;
  priceKey: keyof Row; halfKey: keyof Row; quarterKey: keyof Row; restKey: keyof Row;
  restPriceKey: keyof Row; restHalfKey: keyof Row; restQuarterKey: keyof Row;
  allowHalf: boolean; allowQuarter: boolean;
  r: Row; set: (patch: Partial<Row>) => void;
}) {
  const toneCls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700';
  const dis = !offered;
  const restOn = catRest && offered && (r[restKey] === true);
  const inputCls = 'w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right disabled:bg-gray-100 disabled:text-gray-400';
  const num = (key: keyof Row) => (r[key] as string) ?? '';
  const onNum = (key: keyof Row) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value } as Partial<Row>);

  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 w-24 shrink-0">
          {enabledToggle ? (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={offered} onChange={(e) => enabledToggle(e.target.checked)} className="w-4 h-4 rounded" />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${toneCls}`}>Q{label}</span>
            </label>
          ) : (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${toneCls}`}>Q{label}</span>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500">/unit
          <input type="number" min={0} step="0.01" disabled={dis} value={num(priceKey)} onChange={onNum(priceKey)} className={inputCls} /></label>
        {isKg && allowHalf && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">½kg
            <input type="number" min={0} step="0.01" disabled={dis} value={num(halfKey)} onChange={onNum(halfKey)} placeholder={placeholderFor(num(priceKey), 0.5)} className={inputCls} /></label>
        )}
        {isKg && allowQuarter && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">¼kg
            <input type="number" min={0} step="0.01" disabled={dis} value={num(quarterKey)} onChange={onNum(quarterKey)} placeholder={placeholderFor(num(priceKey), 0.25)} className={inputCls} /></label>
        )}

        <label
          title={!catRest ? 'Enable “Category also for restaurants” on this product’s category first.' : 'Offer this quality to restaurants'}
          className={`flex items-center gap-1.5 text-xs ml-auto ${(!catRest || dis) ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 cursor-pointer'} select-none`}>
          <input type="checkbox" disabled={!catRest || dis} checked={restOn} onChange={(e) => set({ [restKey]: e.target.checked } as Partial<Row>)} className="w-4 h-4 rounded" />
          <UtensilsCrossed className="w-3.5 h-3.5" /> Restaurants
        </label>
      </div>

      {/* Restaurant prices — shown only when this quality is offered to restaurants. */}
      {restOn && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 ml-24 pl-1 border-l-2 border-amber-200">
          <span className="text-xs font-medium text-amber-700">Restaurant</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">/unit
            <input type="number" min={0} step="0.01" value={num(restPriceKey)} onChange={onNum(restPriceKey)} placeholder={`→ ${num(priceKey) || 'consumer'}`} className={inputCls} /></label>
          {isKg && allowHalf && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">½kg
              <input type="number" min={0} step="0.01" value={num(restHalfKey)} onChange={onNum(restHalfKey)} placeholder={placeholderFor(num(restPriceKey), 0.5)} className={inputCls} /></label>
          )}
          {isKg && allowQuarter && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">¼kg
              <input type="number" min={0} step="0.01" value={num(restQuarterKey)} onChange={onNum(restQuarterKey)} placeholder={placeholderFor(num(restPriceKey), 0.25)} className={inputCls} /></label>
          )}
          <span className="text-[11px] text-gray-400">blank → consumer price</span>
        </div>
      )}
    </div>
  );
}

export default PriceManager;
