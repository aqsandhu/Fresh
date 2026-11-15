import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { approvalCodeService, type ApprovalCode, type ApprovalCodeUse } from '@/services/approvalCode.service';
import { formatDateTime } from '@/utils/formatters';

/**
 * "Give approval code": when another admin needs your co-signature, make a
 * one-time code HERE, on your own device, and tell it to them. They type it
 * where your password used to go — your password never touches their screen.
 */
export const ApprovalCodeButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<ApprovalCode | null>(null);
  const [history, setHistory] = useState<ApprovalCodeUse[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open || !issued) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open, issued]);

  const make = async () => {
    setBusy(true);
    try {
      setIssued(await approvalCodeService.create());
      setNow(Date.now());
      setHistory(await approvalCodeService.mine());
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error).message || 'Could not create a code');
    } finally {
      setBusy(false);
    }
  };

  const openModal = async () => {
    setOpen(true);
    setIssued(null);
    try { setHistory(await approvalCodeService.mine()); } catch { /* history is optional */ }
  };

  const secondsLeft = issued ? Math.max(0, Math.round((new Date(issued.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-label="Give approval code"
        title="Give approval code (approve another admin's action from your own phone)"
      >
        <KeyRound className="w-5 h-5" aria-hidden="true" />
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Give approval code" size="sm">
        <div className="space-y-4 text-sm">
          <p className="text-gray-600">
            Another admin needs your approval? Make a code here and tell it to them. They type your phone number and this
            code instead of your password. It works once, for {issued ? Math.round(issued.validSeconds / 60) : 3} minutes.
          </p>
          {issued && secondsLeft > 0 ? (
            <div className="text-center rounded-lg bg-primary-50 py-4" aria-live="polite">
              <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary-700">{issued.code}</p>
              <p className="mt-1 text-xs text-gray-600">Valid for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
            </div>
          ) : (
            <Button onClick={make} isLoading={busy} className="w-full">
              {issued ? 'Code expired — make a new one' : 'Make approval code'}
            </Button>
          )}
          {history.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Your recent codes</p>
              <ul className="space-y-1 text-xs text-gray-600">
                {history.slice(0, 5).map((h) => (
                  <li key={h.createdAt}>
                    {formatDateTime(h.createdAt)} —{' '}
                    {h.usedAt ? <>used by <b>{h.usedByName || 'an admin'}</b> for {h.usedFor || 'an approval'}</> : 'not used'}
                    {h.attempts > 0 ? ` · ${h.attempts} wrong tries` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default ApprovalCodeButton;
