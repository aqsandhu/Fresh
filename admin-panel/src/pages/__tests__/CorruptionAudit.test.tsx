import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CorruptionAudit } from '../CorruptionAudit';
import { corruptionAuditService } from '@/services/corruptionAudit.service';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('@/services/corruptionAudit.service', () => ({
  corruptionAuditService: {
    getSettings: jest.fn(), saveSettings: jest.fn(), testSettings: jest.fn(), run: jest.fn(),
    listRuns: jest.fn(), getRun: jest.fn(), getCash: jest.fn(), recordHandover: jest.fn(), cities: jest.fn(),
  },
}));
const svc = corruptionAuditService as jest.Mocked<typeof corruptionAuditService>;

const settings = {
  provider: 'anthropic', model: 'some-model', baseUrl: '', language: 'roman_urdu', hasKey: true, keyUnreadable: false, ready: true,
  providers: [{ id: 'anthropic', label: 'Anthropic (Claude)', needsBaseUrl: false }, { id: 'custom', label: 'Other', needsBaseUrl: true }],
  languages: ['roman_urdu', 'english'],
};
const run = {
  id: 'run-1', periodFrom: '2026-10-14', periodTo: '2026-11-12', status: 'done' as const, aiUsed: true, aiProvider: 'anthropic', aiModel: 'some-model',
  error: null, createdAt: '2026-11-12T10:00:00Z', finishedAt: '2026-11-12T10:01:00Z', cityName: null,
  evidence: {
    period: { from: '2026-10-14', to: '2026-11-12', days: 30, cityName: null },
    totals: { ordersDelivered: 182, salesValue: 269814, wasteValue: 55400, refundsValue: 14700, refunds: 15, shelfCounts: 1, shelfShortageValue: 19200 },
    subjects: [],
    signals: [{
      id: 'S5', code: 'weight_bills_lowered', title: 'Lowers bills after weighing far more often than raising them', category: 'stock',
      subject: 'admin:1', strength: 'strong' as const, amount: 9860, n: 12,
      facts: { loweredSharePct: 91.67, peersLoweredSharePct: null }, examples: ['2026-10-18 order #ORD-1: Rs 2,400 → Rs 1,500 for Customer 13'],
      innocent: ['The ordered weight is an estimate.'],
    }],
  },
  result: {
    summary: 'Aik admin ke pattern ko dekhna zaroori hai.',
    people: [
      {
        key: 'admin:1', alias: 'A2', name: 'Shakeel Shady', type: 'admin' as const, role: 'Admin', isOwner: false, riskPercent: 70, ruleScore: 60, ceiling: 70,
        aiPercent: 99, band: 'high' as const, confidence: 'medium' as const, signalIds: ['S5'], reasoning: 'Bills 11 dafa kam kiye gaye.',
        innocentExplanations: ['Scale ka farq.'], nextChecks: ['Customer ko phone karein.'],
        adjustments: ['AI said 99% — lowered to 70%, the most this evidence can support.'], amountAtStake: 9860,
      },
      {
        key: 'admin:2', alias: 'A1', name: 'Hamza Honest', type: 'admin' as const, role: 'Admin', isOwner: false, riskPercent: 2, ruleScore: 2, ceiling: 5,
        aiPercent: null, band: 'none' as const, confidence: 'medium' as const, signalIds: [], reasoning: '', innocentExplanations: [], nextChecks: [], adjustments: [], amountAtStake: 0,
      },
    ],
    systemFindings: [{ code: 'shelf_shortage', title: 'Stock missing from the shelf', detail: 'Rs 19,200 short.', severity: 'high' as const, amount: 19200 }],
    collusion: [],
    dataGaps: ['No hand-over recorded.'],
    aiUsed: true, aiNote: null,
  },
};

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CorruptionAudit /></QueryClientProvider>
);

describe('AI Audit page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    svc.getSettings.mockResolvedValue(settings);
    svc.cities.mockResolvedValue([]);
    svc.listRuns.mockResolvedValue([]);
    svc.run.mockResolvedValue({ id: 'run-1' });
    svc.getRun.mockResolvedValue(run);
    svc.getCash.mockResolvedValue({
      admins: [{ id: 'a', name: 'Shakeel Shady', isOwner: false, riderCash: 26880, ocpCash: 0, officeCash: 15000, collected: 41880, handed: 0, balance: 41880, lastHandoverAt: null }],
      handovers: [],
    });
  });

  it('runs an audit for the chosen period and shows the verdict with its evidence', async () => {
    renderPage();
    await screen.findByText(/Anthropic \(Claude\) · some-model/);
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
    fireEvent.click(screen.getByRole('button', { name: /Run audit/ }));

    await waitFor(() => expect(svc.run).toHaveBeenCalled());
    await waitFor(() => expect(svc.getRun).toHaveBeenCalled(), { timeout: 4000 });
    await screen.findByText('Aik admin ke pattern ko dekhna zaroori hai.', {}, { timeout: 4000 });
    const sent = svc.run.mock.calls[0][0];
    expect(sent.useAi).toBe(true);
    expect(sent.from.slice(8)).toBe('01');
    expect(sent.from <= sent.to).toBe(true);

    // The disclaimer is always there; an honest person is not listed as a concern.
    expect(screen.getByText(/It is not proof and not a verdict/)).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.queryByText('Hamza Honest')).toBeNull();
    expect(screen.getByText(/Show 1 people with nothing unusual/)).toBeTruthy();

    // Opening the person shows why, what the guard changed, and the evidence.
    fireEvent.click(screen.getByText(/Shakeel Shady/));
    expect(screen.getByText(/AI said 99% — lowered to 70%/)).toBeTruthy();
    expect(screen.getByText('Lowered share %')).toBeTruthy();
    expect(screen.getByText('not enough data')).toBeTruthy();
    expect(screen.getByText(/order #ORD-1/)).toBeTruthy();
    expect(screen.getByText('Customer ko phone karein.')).toBeTruthy();
    expect(screen.getByText('No hand-over recorded.')).toBeTruthy();
    expect(screen.getByText(/Stock missing from the shelf/)).toBeTruthy();
  });

  it('says so when AI is not set up and runs on the fixed rules', async () => {
    svc.getSettings.mockResolvedValue({ ...settings, ready: false, hasKey: false });
    renderPage();
    await screen.findByText(/AI is not set up/);
    fireEvent.click(screen.getByRole('button', { name: /Run audit/ }));
    await waitFor(() => expect(svc.run).toHaveBeenCalled());
    expect(svc.run.mock.calls[0][0].useAi).toBe(false);
  });

  it('records cash handed to the owner', async () => {
    svc.recordHandover.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Cash hand-over/ }));
    await screen.findByText('Cash each admin should still be holding');
    fireEvent.change(screen.getByLabelText('Admin'), { target: { value: 'a' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(svc.recordHandover).toHaveBeenCalledWith({ adminId: 'a', amount: 5000, note: undefined }));
  });
});
