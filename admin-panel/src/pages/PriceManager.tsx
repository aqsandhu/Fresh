import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Search, Loader2 } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { productService } from '@/services/product.service';
import type { Product } from '@/types';
import toast from 'react-hot-toast';

// One editable grid where every product's quality prices, unit toggles and
// active/paused status live together. Saving a row PUTs the product, so the
// change propagates everywhere the product is used (consumer, restaurant, OCP).
//
// Note on B/C half/quarter prices: the whole pricing engine derives the half-kg
// and quarter-kg price for the B and C tiers from their per-kg price (½ kg = 50%,
// ¼ kg = 25%). Only quality A has explicit half/quarter overrides (its own DB
// columns). So A's ½/¼ are editable here; B/C's are shown as auto-derived.

type Row = {
  isActive: boolean;
  price: string;        // A per kg/base
  halfKgPrice: string;  // A ½ kg (blank = auto)
  quarterKgPrice: string; // A ¼ kg (blank = auto)
  bEnabled: boolean;
  priceB: string;
  cEnabled: boolean;
  priceC: string;
  allowHalfKg: boolean;
  allowQuarterKg: boolean;
};

const numStr = (v: number | null | undefined): string => (v == null ? '' : String(v));

function toRow(p: Product): Row {
  return {
    isActive: !!p.isActive,
    price: numStr(p.price),
    halfKgPrice: numStr(p.halfKgPrice),
    quarterKgPrice: numStr(p.quarterKgPrice),
    bEnabled: p.priceB != null,
    priceB: numStr(p.priceB),
    cEnabled: p.priceC != null,
    priceC: numStr(p.priceC),
    allowHalfKg: p.allowHalfKg !== false,
    allowQuarterKg: p.allowQuarterKg !== false,
  };
}

const rowEq = (a: Row, b: Row) =>
  a.isActive === b.isActive && a.price === b.price && a.halfKgPrice === b.halfKgPrice &&
  a.quarterKgPrice === b.quarterKgPrice && a.bEnabled === b.bEnabled && a.priceB === b.priceB &&
  a.cEnabled === b.cEnabled && a.priceC === b.priceC && a.allowHalfKg === b.allowHalfKg &&
  a.allowQuarterKg === b.allowQuarterKg;

const derived = (perKg: string, frac: number): string => {
  const n = parseFloat(perKg);
  return Number.isFinite(n) ? `≈ ${(Math.round(n * frac * 100) / 100)}` : '—';
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
    // Don't let a background refetch wipe in-progress edits; we refetch on save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const products = useMemo(() => data?.products || [], [data]);

  // (Re)seed the working copy whenever fresh products arrive.
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
        const numOrNull = (s: string) => {
          const n = parseFloat(s);
          return s.trim() === '' || !Number.isFinite(n) ? null : n;
        };
        return productService.updateProduct(id, {
          isActive: r.isActive,
          price: parseFloat(r.price) || 0,
          halfKgPrice: numOrNull(r.halfKgPrice),
          quarterKgPrice: numOrNull(r.quarterKgPrice),
          priceB: r.bEnabled ? numOrNull(r.priceB) : null,
          priceC: r.cEnabled ? numOrNull(r.priceC) : null,
          allowHalfKg: r.allowHalfKg,
          allowQuarterKg: r.allowQuarterKg,
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
    <Layout title="Price Manager" subtitle="Edit all product prices, qualities, units and status in one place">
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
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="sticky left-0 bg-gray-50 text-left px-3 py-2 min-w-[180px]">Product</th>
                <th className="px-2 py-2">Active</th>
                <th className="px-2 py-2">A /kg</th>
                <th className="px-2 py-2">A ½kg</th>
                <th className="px-2 py-2">A ¼kg</th>
                <th className="px-2 py-2">B</th>
                <th className="px-2 py-2">B /kg</th>
                <th className="px-2 py-2">C</th>
                <th className="px-2 py-2">C /kg</th>
                <th className="px-2 py-2">½kg</th>
                <th className="px-2 py-2">¼kg</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const r = rows[p.id];
                if (!r) return null;
                const isKg = String(p.unitType).toLowerCase() === 'kg';
                const dirty = originals.current[p.id] && !rowEq(r, originals.current[p.id]);
                const cell = 'w-20 px-2 py-1 border border-gray-200 rounded text-right text-sm disabled:bg-gray-100 disabled:text-gray-400';
                return (
                  <tr key={p.id} className={`border-b border-gray-100 ${dirty ? 'bg-amber-50/50' : ''}`}>
                    <td className="sticky left-0 bg-inherit px-3 py-2">
                      <div className="font-medium text-gray-900">{p.nameEn}</div>
                      <div className="text-xs text-gray-400">{p.categoryName} · {p.unitType}{!r.isActive ? ' · paused' : ''}</div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={r.isActive} onChange={(e) => setCell(p.id, { isActive: e.target.checked })} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="number" min={0} step="0.01" value={r.price} onChange={(e) => setCell(p.id, { price: e.target.value })} className={cell} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {isKg ? <input type="number" min={0} step="0.01" value={r.halfKgPrice} placeholder={derived(r.price, 0.5)} onChange={(e) => setCell(p.id, { halfKgPrice: e.target.value })} className={cell} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {isKg ? <input type="number" min={0} step="0.01" value={r.quarterKgPrice} placeholder={derived(r.price, 0.25)} onChange={(e) => setCell(p.id, { quarterKgPrice: e.target.value })} className={cell} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={r.bEnabled} onChange={(e) => setCell(p.id, { bEnabled: e.target.checked })} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="number" min={0} step="0.01" value={r.priceB} disabled={!r.bEnabled} onChange={(e) => setCell(p.id, { priceB: e.target.value })} className={cell} />
                      {isKg && r.bEnabled && <div className="text-[10px] text-gray-400">{derived(r.priceB, 0.5)} / {derived(r.priceB, 0.25)}</div>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={r.cEnabled} onChange={(e) => setCell(p.id, { cEnabled: e.target.checked })} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="number" min={0} step="0.01" value={r.priceC} disabled={!r.cEnabled} onChange={(e) => setCell(p.id, { priceC: e.target.value })} className={cell} />
                      {isKg && r.cEnabled && <div className="text-[10px] text-gray-400">{derived(r.priceC, 0.5)} / {derived(r.priceC, 0.25)}</div>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {isKg ? <input type="checkbox" checked={r.allowHalfKg} onChange={(e) => setCell(p.id, { allowHalfKg: e.target.checked })} className="w-4 h-4" /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {isKg ? <input type="checkbox" checked={r.allowQuarterKg} onChange={(e) => setCell(p.id, { allowQuarterKg: e.target.checked })} className="w-4 h-4" /> : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center text-gray-500 py-10">No products match.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-gray-400 mt-3">
        ½kg / ¼kg checkboxes enable those purchase units for customers. Unticking quality B or C removes that tier from the product.
        For B and C the half/quarter price is derived automatically (50% / 25% of the per-kg price).
      </p>
    </Layout>
  );
};

export default PriceManager;
