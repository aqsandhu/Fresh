import { api } from './api';
import type { ApiResponse } from '@/types';

export type Quality = 'A' | 'B' | 'C';

export interface StockQuality {
  quality: Quality;
  onHand: number;
  reserved: number;
  available: number;
  central: number;
  movable: number;
  ocps: { ocpId: string; name: string; qty: number }[];
}
export interface StockProduct {
  id: string;
  name: string;
  unitType: string;
  categoryName: string;
  qualities: StockQuality[];
}
export interface StockOverview {
  products: StockProduct[];
  ocps: { id: string; name: string }[];
}
export interface StockMovement {
  id: string;
  quality: string;
  delta: number;
  reason: string;
  note?: string | null;
  ocpName?: string | null;
  proofUrl?: string | null;
  evidenceQuantity?: number | null;
  approvedAt?: string | null;
  approvedByName?: string | null;
  createdAt: string;
}
export interface WasteReportRow {
  id: string;
  productId: string;
  productName: string;
  quality: string;
  delta: number;
  note?: string | null;
  proofUrl?: string | null;
  evidenceQuantity?: number | null;
  approvedAt?: string | null;
  createdAt: string;
  createdByName?: string | null;
  approvedByName?: string | null;
}

export const stockService = {
  overview: async (search?: string): Promise<StockOverview> => {
    const res = await api.get<ApiResponse<StockOverview>>('/admin/stock', search ? { search } : undefined);
    return res.data || { products: [], ocps: [] };
  },
  movements: async (productId: string): Promise<StockMovement[]> => {
    const res = await api.get<ApiResponse<StockMovement[]>>(`/admin/stock/${productId}/movements`);
    return res.data || [];
  },
  wasteReport: async (date?: string): Promise<WasteReportRow[]> => {
    const res = await api.get<ApiResponse<WasteReportRow[]>>('/admin/stock/waste-report', date ? { date } : undefined);
    return res.data || [];
  },
  add: async (p: { productId: string; quality: Quality; quantity: number }) =>
    api.post('/admin/stock/add', { product_id: p.productId, quality: p.quality, quantity: p.quantity }),
  waste: async (p: { productId: string; quality: Quality; quantity: number; note: string; proofFile: File; evidenceQuantity: number; approvalPhone?: string; approvalPassword?: string }) => {
    const form = new FormData();
    form.append('product_id', p.productId);
    form.append('quality', p.quality);
    form.append('quantity', String(p.quantity));
    form.append('note', p.note);
    form.append('evidence_quantity', String(p.evidenceQuantity));
    if (p.approvalPhone) form.append('approval_phone', p.approvalPhone);
    if (p.approvalPassword) form.append('approval_password', p.approvalPassword);
    form.append('proof', p.proofFile);
    return api.postForm('/admin/stock/waste', form);
  },
  convert: async (p: { productId: string; fromQuality: Quality; toQuality: Quality; quantity: number; note: string; approvalPhone?: string; approvalPassword?: string }) =>
    api.post('/admin/stock/convert', {
      product_id: p.productId,
      from_quality: p.fromQuality,
      to_quality: p.toQuality,
      quantity: p.quantity,
      note: p.note,
      approval_phone: p.approvalPhone,
      approval_password: p.approvalPassword,
    }),
  shift: async (p: { productId: string; ocpId: string; quality: Quality; quantity: number }) =>
    api.post('/admin/stock/shift', { product_id: p.productId, ocp_id: p.ocpId, quality: p.quality, quantity: p.quantity }),
  returnFromOcp: async (p: { productId: string; ocpId: string; quality: Quality; quantity: number }) =>
    api.post('/admin/stock/return', { product_id: p.productId, ocp_id: p.ocpId, quality: p.quality, quantity: p.quantity }),
  transfer: async (p: { productId: string; fromOcpId: string; toOcpId: string; quality: Quality; quantity: number }) =>
    api.post('/admin/stock/transfer', { product_id: p.productId, from_ocp_id: p.fromOcpId, to_ocp_id: p.toOcpId, quality: p.quality, quantity: p.quantity }),
};
