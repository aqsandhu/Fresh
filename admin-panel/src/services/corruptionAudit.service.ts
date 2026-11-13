import { api } from './api';
import type { ApiResponse } from '@/types';

// Keys arrive camelCased by the api layer (snake_case on the wire).

export interface AuditAiSettings {
  provider: string;
  model: string;
  baseUrl: string;
  language: string;
  hasKey: boolean;
  keyUnreadable: boolean;
  ready: boolean;
  providers: { id: string; label: string; needsBaseUrl: boolean }[];
  languages: string[];
}

export type Strength = 'weak' | 'moderate' | 'strong';

export interface AuditSignal {
  id: string;
  code: string;
  title: string;
  category: string;
  subject: string;
  strength: Strength;
  amount: number;
  n: number;
  facts: Record<string, number | string | boolean | null>;
  examples: string[];
  innocent: string[];
}

export interface AuditPerson {
  key: string;
  alias: string;
  name: string;
  type: 'admin' | 'rider' | 'ocp';
  role: string;
  isOwner: boolean;
  riskPercent: number;
  ruleScore: number;
  ceiling: number;
  aiPercent: number | null;
  band: 'none' | 'low' | 'review' | 'high' | 'very_high';
  confidence: 'low' | 'medium' | 'high';
  signalIds: string[];
  reasoning: string;
  innocentExplanations: string[];
  nextChecks: string[];
  adjustments: string[];
  amountAtStake: number;
}

export interface AuditFinding { code: string; title: string; detail: string; severity: 'low' | 'medium' | 'high'; amount: number }

export interface AuditRunSummary {
  id: string;
  periodFrom: string;
  periodTo: string;
  status: 'running' | 'done' | 'failed';
  aiUsed: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  cityName: string | null;
  signalCount?: number;
  topRisk?: number;
}

export interface AuditRun extends AuditRunSummary {
  evidence: {
    period: { from: string; to: string; days: number; cityName: string | null };
    totals: Record<string, number>;
    subjects: { key: string; name: string; alias: string; type: string; role: string; activity: Record<string, number> }[];
    signals: AuditSignal[];
  } | null;
  result: {
    summary: string;
    people: AuditPerson[];
    systemFindings: AuditFinding[];
    collusion: { names: string[]; aliases: string[]; reasoning: string; signalIds: string[] }[];
    dataGaps: string[];
    aiUsed: boolean;
    aiNote: string | null;
  } | null;
}

export interface CashAdminRow {
  id: string;
  name: string;
  isOwner: boolean;
  riderCash: number;
  ocpCash: number;
  officeCash: number;
  collected: number;
  handed: number;
  balance: number;
  lastHandoverAt: string | null;
}

export interface CashHandoverRow { id: string; adminId: string; adminName: string | null; amount: number; note: string | null; handedAt: string; receivedByName: string | null }

const BASE = '/admin/corruption-audit';

export const corruptionAuditService = {
  getSettings: async (): Promise<AuditAiSettings> => {
    const res = await api.get<ApiResponse<AuditAiSettings>>(`${BASE}/settings`);
    return res.data as AuditAiSettings;
  },
  saveSettings: async (d: { provider: string; model: string; baseUrl: string; language: string; apiKey?: string; clearKey?: boolean }): Promise<AuditAiSettings> => {
    const res = await api.put<ApiResponse<AuditAiSettings>>(`${BASE}/settings`, d);
    return res.data as AuditAiSettings;
  },
  testSettings: async (): Promise<string> => {
    const res = await api.post<ApiResponse<unknown>>(`${BASE}/settings/test`, {});
    return (res as { message?: string })?.message || 'The key works.';
  },
  run: async (d: { from: string; to: string; cityId?: string; useAi: boolean }): Promise<{ id: string }> => {
    const res = await api.post<ApiResponse<{ id: string }>>(`${BASE}/run`, d);
    return res.data as { id: string };
  },
  listRuns: async (): Promise<AuditRunSummary[]> => {
    const res = await api.get<ApiResponse<AuditRunSummary[]>>(`${BASE}/runs`);
    return res.data || [];
  },
  getRun: async (id: string): Promise<AuditRun> => {
    const res = await api.get<ApiResponse<AuditRun>>(`${BASE}/runs/${id}`);
    return res.data as AuditRun;
  },
  getCash: async (): Promise<{ admins: CashAdminRow[]; handovers: CashHandoverRow[] }> => {
    const res = await api.get<ApiResponse<{ admins: CashAdminRow[]; handovers: CashHandoverRow[] }>>(`${BASE}/cash`);
    return res.data || { admins: [], handovers: [] };
  },
  recordHandover: async (d: { adminId: string; amount: number; note?: string }): Promise<void> => {
    await api.post<ApiResponse<unknown>>(`${BASE}/cash-handovers`, d);
  },
  cities: async (): Promise<{ id: string; name: string }[]> => {
    const res = await api.get<ApiResponse<{ id: string; name: string }[]>>('/admin/cities');
    return res.data || [];
  },
};
