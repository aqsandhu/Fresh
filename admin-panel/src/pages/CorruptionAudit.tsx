import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, Bot, ChevronDown, ChevronRight, History, Loader2, Play, ScanSearch, Settings2, ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  corruptionAuditService as svc,
  type AuditAiSettings, type AuditPerson, type AuditRun, type AuditSignal, type Strength,
} from '@/services/corruptionAudit.service';
import { addDays, periodFor, pkDate, type AuditPreset } from '@/utils/auditPeriod';

// ============================================================================
// AI Audit (super admin only). Pick a period, the server reads the books for
// it, builds the evidence, and the AI the owner configured here judges it.
// The page always shows the evidence behind a figure — a percentage alone is
// never shown — and says plainly when the data was too thin to judge.
// ============================================================================

type Tab = 'audit' | 'cash' | 'history';
type Preset = AuditPreset;

const rs = (n: unknown) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const errMsg = (e: unknown, fallback: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const BAND: Record<AuditPerson['band'], { label: string; bar: string; chip: string }> = {
  none: { label: 'No concern', bar: 'bg-green-500', chip: 'bg-green-50 text-green-700' },
  low: { label: 'Low', bar: 'bg-lime-500', chip: 'bg-lime-50 text-lime-800' },
  review: { label: 'Needs review', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800' },
  high: { label: 'High', bar: 'bg-orange-500', chip: 'bg-orange-50 text-orange-800' },
  very_high: { label: 'Very high', bar: 'bg-red-600', chip: 'bg-red-50 text-red-700' },
};
const STRENGTH: Record<Strength, string> = {
  weak: 'bg-gray-100 text-gray-700', moderate: 'bg-amber-100 text-amber-800', strong: 'bg-red-100 text-red-700',
};
const SEVERITY = { low: 'bg-gray-400', medium: 'bg-amber-500', high: 'bg-red-500' } as const;
const TYPE_LABEL: Record<string, string> = { admin: 'Admin', rider: 'Rider', ocp: 'Collection point' };
const LANG_LABEL: Record<string, string> = { roman_urdu: 'Roman Urdu', english: 'English', urdu: 'اردو (Urdu)' };

/** "loweredSharePct" → "Lowered share %". */
const factLabel = (k: string) => {
  const words = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().trim().replace(/\bpct\b/g, '%');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const factValue = (v: unknown) => (v === null || v === undefined ? 'not enough data' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? v.toLocaleString('en-PK') : String(v));

// ── AI settings ──────────────────────────────────────────────────────────────
function SettingsModal({ settings, onClose }: { settings: AuditAiSettings; onClose: () => void }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(settings.provider || settings.providers[0]?.id || '');
  const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [language, setLanguage] = useState(settings.language);
  const [apiKey, setApiKey] = useState('');
  const needsBase = settings.providers.find((p) => p.id === provider)?.needsBaseUrl;

  const save = useMutation({
    mutationFn: (clearKey: boolean) => svc.saveSettings({ provider, model: model.trim(), baseUrl: baseUrl.trim(), language, apiKey: apiKey.trim() || undefined, clearKey: clearKey || undefined }),
    onSuccess: (s) => { qc.setQueryData(['audit-settings'], s); setApiKey(''); toast.success('AI settings saved'); },
    onError: (e) => toast.error(errMsg(e, 'Could not save')),
  });
  const test = useMutation({
    mutationFn: async () => { await svc.saveSettings({ provider, model: model.trim(), baseUrl: baseUrl.trim(), language, apiKey: apiKey.trim() || undefined }); return svc.testSettings(); },
    onSuccess: (m) => { toast.success(m); setApiKey(''); qc.invalidateQueries({ queryKey: ['audit-settings'] }); },
    onError: (e) => toast.error(errMsg(e, 'The AI did not answer'), { duration: 8000 }),
  });
  const valid = provider && model.trim() && (settings.hasKey || apiKey.trim()) && (!needsBase || baseUrl.trim());

  return (
    <Modal isOpen onClose={onClose} title="AI for the audit"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div>{settings.hasKey && <Button variant="ghost" onClick={() => save.mutate(true)} disabled={save.isPending}>Remove saved key</Button>}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => test.mutate()} disabled={!valid || test.isPending} isLoading={test.isPending}>Save &amp; test</Button>
            <Button onClick={() => save.mutate(false)} disabled={!valid || save.isPending} isLoading={save.isPending}>Save</Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label htmlFor="audit-ai-company" className="block text-sm font-medium text-gray-700 mb-1">AI company</label>
          <select id="audit-ai-company" value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {settings.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <Input label="Model name" value={model} onChange={(e) => setModel(e.target.value)} placeholder="exactly as the company writes it"
          helperText="Copy the model id from the company's website or dashboard. A stronger model judges better." />
        {needsBase || baseUrl ? (
          <Input label={needsBase ? 'Base URL' : 'Base URL (optional)'} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
        ) : null}
        <Input label="API key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={settings.hasKey ? 'A key is saved — leave empty to keep it' : 'Paste the key'}
          helperText="Stored encrypted on the server. It is never shown again and never sent to this browser." />
        {settings.keyUnreadable && <p className="text-sm text-red-600">The saved key can no longer be read (the server secret changed). Enter it again.</p>}
        <div>
          <label htmlFor="audit-ai-language" className="block text-sm font-medium text-gray-700 mb-1">Language of the AI's report</label>
          <select id="audit-ai-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {settings.languages.map((l) => <option key={l} value={l}>{LANG_LABEL[l] || l}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-500">
          What the AI receives: figures and patterns only. Staff, riders and customers are sent as codes (A1, R2, C5) — no names, no phone numbers, and no text typed by staff.
        </p>
      </div>
    </Modal>
  );
}

// ── One person's verdict ─────────────────────────────────────────────────────
function SignalCard({ s }: { s: AuditSignal }) {
  const facts = Object.entries(s.facts || {});
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-gray-400">{s.id}</span>
        <span className="font-medium text-gray-900 text-sm">{s.title}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STRENGTH[s.strength]}`}>{s.strength} evidence</span>
        {s.amount > 0 && <span className="text-xs text-gray-600">{rs(s.amount)}</span>}
        <span className="text-xs text-gray-400">{s.n} event(s)</span>
      </div>
      {facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-gray-500">{factLabel(k)}</dt><dd className="text-gray-800 font-medium text-right">{factValue(v)}</dd></div>
          ))}
        </dl>
      )}
      {s.examples.length > 0 && (
        <ul className="mt-2 text-xs text-gray-600 space-y-0.5 list-disc pl-4">{s.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {s.innocent.length > 0 && (
        <p className="mt-2 text-xs text-gray-500"><span className="font-medium text-gray-600">Can be innocent:</span> {s.innocent.join(' ')}</p>
      )}
    </div>
  );
}

function PersonRow({ p, signals, open, onToggle }: { p: AuditPerson; signals: AuditSignal[]; open: boolean; onToggle: () => void }) {
  const band = BAND[p.band];
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{p.name} <span className="text-xs font-normal text-gray-500">· {p.role || TYPE_LABEL[p.type]}</span></p>
          <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${band.bar}`} style={{ width: `${Math.max(2, p.riskPercent)}%` }} /></div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-900 leading-none">{p.riskPercent}%</p>
          <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${band.chip}`}>{band.label}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>Confidence: <b className="text-gray-700">{p.confidence}</b></span>
            <span>AI said: <b className="text-gray-700">{p.aiPercent === null ? 'not used' : `${p.aiPercent}%`}</b></span>
            <span>Fixed rule: <b className="text-gray-700">{p.ruleScore}%</b></span>
            <span>Most this evidence can support: <b className="text-gray-700">{p.ceiling}%</b></span>
            {p.amountAtStake > 0 && <span>Money involved: <b className="text-gray-700">{rs(p.amountAtStake)}</b></span>}
          </div>
          {p.adjustments.length > 0 && (
            <ul className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 space-y-0.5">{p.adjustments.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          <p className="text-sm text-gray-800 whitespace-pre-line">{p.reasoning}</p>
          {signals.length > 0 && <div className="space-y-2">{signals.map((s) => <SignalCard key={s.id} s={s} />)}</div>}
          {p.innocentExplanations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Ordinary explanations to rule out first</p>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">{p.innocentExplanations.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {p.nextChecks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">What to check next</p>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">{p.nextChecks.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RunResult({ run }: { run: AuditRun }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const result = run.result;
  const signals = useMemo(() => run.evidence?.signals || [], [run.evidence]);
  if (!result || !run.evidence) return null;
  const flagged = result.people.filter((p) => p.signalIds.length > 0);
  const quiet = result.people.filter((p) => p.signalIds.length === 0);
  const totals = run.evidence.totals || {};

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-primary-600" />
          <h3 className="font-semibold text-gray-900">{run.periodFrom} → {run.periodTo}{run.cityName ? ` · ${run.cityName}` : ' · all cities'}</h3>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${run.aiUsed ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
            {run.aiUsed ? `Judged by ${run.aiModel}` : 'Fixed rules only (no AI)'}
          </span>
        </div>
        <p className="text-sm text-gray-800 whitespace-pre-line">{result.summary}</p>
        {result.aiNote && <p className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{result.aiNote}</p>}
        <p className="mt-3 text-xs text-gray-500">
          A percentage here is how strongly the records say a person&apos;s actions should be looked into. It is not proof and not a verdict — open the person, read the evidence and rule out the ordinary explanations before you act.
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Delivered</p><p className="text-lg font-bold">{totals.ordersDelivered || 0}</p><p className="text-[11px] text-gray-400">{rs(totals.salesValue)}</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Waste (selling price)</p><p className="text-lg font-bold">{rs(totals.wasteValue)}</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Refunds</p><p className="text-lg font-bold">{rs(totals.refundsValue)}</p><p className="text-[11px] text-gray-400">{totals.refunds || 0} refund(s)</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Missing at shelf counts</p><p className="text-lg font-bold text-red-600">{rs(totals.shelfShortageValue)}</p><p className="text-[11px] text-gray-400">{totals.shelfCounts || 0} count(s)</p></Card>
      </div>

      <Card className="p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">People</h3>
          <p className="text-xs text-gray-500">{flagged.length ? `${flagged.length} with something measured, highest first.` : 'Nothing unusual was measured for anyone in this period.'}</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {flagged.map((p) => (
            <PersonRow key={p.key} p={p} signals={signals.filter((s) => p.signalIds.includes(s.id) || s.subject === p.key)} open={open === p.key} onToggle={() => setOpen(open === p.key ? null : p.key)} />
          ))}
        </ul>
        {quiet.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={() => setShowQuiet(!showQuiet)} className="text-sm text-primary-700 hover:underline">
              {showQuiet ? 'Hide' : 'Show'} {quiet.length} people with nothing unusual
            </button>
            {showQuiet && <p className="mt-2 text-sm text-gray-600">{quiet.map((p) => `${p.name} (${TYPE_LABEL[p.type]})`).join(' · ')}</p>}
          </div>
        )}
      </Card>

      {result.collusion.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Patterns that fit together</h3>
          <ul className="space-y-2">{result.collusion.map((c, i) => (
            <li key={i} className="text-sm"><span className="font-medium text-gray-900">{c.names.join(' + ')}</span> <span className="font-mono text-xs text-gray-400">{c.signalIds.join(', ')}</span><p className="text-gray-700">{c.reasoning}</p></li>
          ))}</ul>
        </Card>
      )}

      {result.systemFindings.length > 0 && (
        <Card className="p-0">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Problems that belong to no one person</h3></div>
          <ul className="divide-y divide-gray-100">{result.systemFindings.map((f, i) => (
            <li key={i} className="px-4 py-3 text-sm flex gap-2">
              <span className={`mt-1.5 inline-block w-2 h-2 rounded-full shrink-0 ${SEVERITY[f.severity] || SEVERITY.low}`} />
              <span><span className="font-medium text-gray-900">{f.title}.</span> <span className="text-gray-700">{f.detail}</span></span>
            </li>
          ))}</ul>
        </Card>
      )}

      {result.dataGaps.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" /> What this audit could not see</h3>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">{result.dataGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

// ── Audit tab ────────────────────────────────────────────────────────────────
function AuditTab({ runId, setRunId }: { runId: string | null; setRunId: (id: string | null) => void }) {
  const qc = useQueryClient();
  const today = pkDate();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [cityId, setCityId] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: settings } = useQuery({ queryKey: ['audit-settings'], queryFn: svc.getSettings });
  const { data: cities = [] } = useQuery({ queryKey: ['audit-cities'], queryFn: svc.cities });
  const { data: run } = useQuery({
    queryKey: ['audit-run', runId],
    queryFn: () => svc.getRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 2500 : false),
  });
  useEffect(() => { if (run && run.status !== 'running') qc.invalidateQueries({ queryKey: ['audit-runs'] }); }, [run, qc]);

  const period = periodFor(preset, today, month, from, to);
  const validPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;
  const start = useMutation({
    mutationFn: () => svc.run({ from: period.from, to: period.to, cityId: cityId || undefined, useAi: useAi && Boolean(settings?.ready) }),
    onSuccess: (r) => setRunId(r.id),
    onError: (e) => toast.error(errMsg(e, 'Could not start the audit')),
  });
  const running = start.isPending || run?.status === 'running';
  const presets: { key: Preset; label: string }[] = [
    { key: 'this_week', label: 'This week' }, { key: 'last_week', label: 'Last week' },
    { key: 'this_month', label: 'This month' }, { key: 'last_month', label: 'Last month' },
    { key: 'month', label: 'A month' }, { key: 'dates', label: 'Between dates' },
  ];
  const providerLabel = settings?.providers.find((p) => p.id === settings.provider)?.label;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 flex-wrap">
            {presets.map((p) => (
              <button key={p.key} type="button" onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${preset === p.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{p.label}</button>
            ))}
          </div>
          {preset === 'month' && (
            <input type="month" aria-label="Month" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          )}
          {preset === 'dates' && (
            <>
              <input type="date" aria-label="From date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400">to</span>
              <input type="date" aria-label="To date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </>
          )}
          {cities.length > 1 && (
            <select aria-label="City" value={cityId} onChange={(e) => setCityId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">All cities</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            <p>Period: <b className="text-gray-900">{validPeriod ? `${period.from} → ${period.to}` : 'choose the dates'}</b></p>
            <p className="flex items-center gap-1.5 mt-1">
              <Bot className="w-4 h-4 text-gray-400" />
              {settings?.ready ? <>AI: <b className="text-gray-900">{providerLabel} · {settings.model}</b></> : <span className="text-amber-700">AI is not set up — the audit will use the fixed rules only.</span>}
              <button type="button" onClick={() => setSettingsOpen(true)} className="text-primary-700 hover:underline inline-flex items-center gap-1 ml-1"><Settings2 className="w-3.5 h-3.5" /> AI settings</button>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {settings?.ready && (
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Let the AI judge</label>
            )}
            <Button onClick={() => start.mutate()} disabled={!validPeriod || running} isLoading={running} leftIcon={<Play className="w-4 h-4" />}>Run audit</Button>
          </div>
        </div>
      </Card>

      {run?.status === 'running' && (
        <Card className="py-12 text-center text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto mb-3" />
          Reading the books for this period{useAi && settings?.ready ? ' and asking the AI to judge them' : ''}… this can take a minute or two.
        </Card>
      )}
      {run?.status === 'failed' && <Card className="p-4 text-sm text-red-700 bg-red-50">The audit did not finish: {run.error || 'unknown error'}</Card>}
      {run?.status === 'done' && <RunResult run={run} />}
      {!runId && (
        <Card className="py-10 text-center text-sm text-gray-500">
          <ScanSearch className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          Choose a period and run the audit. It checks waste, weight edits, refunds, cancellations, coupons, prices, expenses, salaries, and the cash held by admins, riders and collection points.
        </Card>
      )}
      {settingsOpen && settings && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ── Cash hand-over tab ───────────────────────────────────────────────────────
function CashTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['audit-cash'], queryFn: svc.getCash });
  const [adminId, setAdminId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const staff = (data?.admins || []).filter((a) => !a.isOwner);
  const record = useMutation({
    mutationFn: () => svc.recordHandover({ adminId, amount: parseFloat(amount) || 0, note: note.trim() || undefined }),
    onSuccess: () => { toast.success('Hand-over recorded'); setAmount(''); setNote(''); qc.invalidateQueries({ queryKey: ['audit-cash'] }); },
    onError: (e) => toast.error(errMsg(e, 'Could not record it')),
  });

  if (isLoading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold text-gray-900">Record cash an admin handed to you</h3>
        <p className="text-xs text-gray-500 mb-3">Only you record this, when the cash is in your hand. The audit then knows how much each admin should still be holding.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="handover-admin" className="block text-sm font-medium text-gray-700 mb-1">Admin</label>
            <select id="handover-admin" value={adminId} onChange={(e) => setAdminId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[200px]">
              <option value="">Select admin</option>
              {staff.map((a) => <option key={a.id} value={a.id}>{a.name} — holds {rs(a.balance)}</option>)}
            </select>
          </div>
          <div className="w-40"><Input label="Amount (Rs.)" type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="flex-1 min-w-[180px]"><Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button onClick={() => record.mutate()} disabled={!adminId || !(parseFloat(amount) > 0) || record.isPending} isLoading={record.isPending}>Record</Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Cash each admin should still be holding</h3><p className="text-xs text-gray-500">Everything they ever collected minus everything recorded as handed to you.</p></div>
        {(data?.admins || []).length === 0 ? <p className="px-4 py-6 text-sm text-gray-500 text-center">No admins yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="text-left px-4 py-2">Admin</th><th className="text-right px-4 py-2">From riders</th><th className="text-right px-4 py-2">From OCPs</th><th className="text-right px-4 py-2">At office</th><th className="text-right px-4 py-2">Handed to you</th><th className="text-right px-4 py-2">Still holds</th><th className="text-left px-4 py-2">Last hand-over</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.admins || []).map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">{a.name}{a.isOwner && <span className="ml-1 text-[11px] text-gray-400">(super admin)</span>}</td>
                    <td className="px-4 py-2 text-right">{rs(a.riderCash)}</td>
                    <td className="px-4 py-2 text-right">{rs(a.ocpCash)}</td>
                    <td className="px-4 py-2 text-right">{rs(a.officeCash)}</td>
                    <td className="px-4 py-2 text-right">{a.isOwner ? '—' : rs(a.handed)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${!a.isOwner && a.balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>{a.isOwner ? '—' : rs(a.balance)}</td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{a.isOwner ? '—' : when(a.lastHandoverAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(data?.handovers || []).length > 0 && (
        <Card className="p-0">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Recent hand-overs</h3></div>
          <ul className="divide-y divide-gray-100">{(data?.handovers || []).map((h) => (
            <li key={h.id} className="px-4 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1"><span className="text-gray-500 whitespace-nowrap">{when(h.handedAt)}</span><span className="font-medium text-gray-900">{h.adminName || 'Unknown'}</span><span>{rs(h.amount)}</span>{h.note && <span className="text-gray-500">{h.note}</span>}</li>
          ))}</ul>
        </Card>
      )}
    </div>
  );
}

function HistoryTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['audit-runs'], queryFn: svc.listRuns });
  if (isLoading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>;
  if (data.length === 0) return <Card className="py-10 text-center text-sm text-gray-500">No audits have been run yet.</Card>;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-gray-100">{data.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50">
            <span className="font-medium text-gray-900">{r.periodFrom} → {r.periodTo}</span>
            <span className="text-gray-500">{r.cityName || 'all cities'}</span>
            <span className="text-gray-500">{r.status === 'done' ? `${r.signalCount || 0} signal(s), highest ${r.topRisk || 0}%` : r.status === 'running' ? 'running…' : `failed: ${r.error || ''}`}</span>
            <span className="text-gray-400">{r.aiUsed ? r.aiModel : 'rules only'}</span>
            <span className="text-gray-400 ml-auto whitespace-nowrap">{when(r.createdAt)}</span>
          </button>
        </li>
      ))}</ul>
    </Card>
  );
}

export const CorruptionAudit: React.FC = () => {
  const [tab, setTab] = useState<Tab>('audit');
  const [runId, setRunId] = useState<string | null>(null);
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'audit', label: 'Audit', icon: <ScanSearch className="w-4 h-4" /> },
    { key: 'cash', label: 'Cash hand-over', icon: <Banknote className="w-4 h-4" /> },
    { key: 'history', label: 'Earlier audits', icon: <History className="w-4 h-4" /> },
  ];
  return (
    <Layout title="AI Audit" subtitle="Corruption-risk audit of a period — who to look at, why, and how sure the records are">
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'audit' && <AuditTab runId={runId} setRunId={setRunId} />}
      {tab === 'cash' && <CashTab />}
      {tab === 'history' && <HistoryTab onOpen={(id) => { setRunId(id); setTab('audit'); }} />}
    </Layout>
  );
};

export default CorruptionAudit;
