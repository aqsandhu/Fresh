import React from 'react';
import { Input } from './Input';

interface Props {
  phone: string;
  password: string;
  onPhone: (v: string) => void;
  onPassword: (v: string) => void;
}

/**
 * Second-admin co-signature for money leaving the business (expenses, rider
 * and worker payments). Shown only after the server asks for it, so everyday
 * small entries stay a two-field form.
 */
export const ApproverFields: React.FC<Props> = ({ phone, password, onPhone, onPassword }) => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
    <p className="text-sm text-amber-900">A second admin must approve this. They press the key button at the top of THEIR admin panel and tell you the 6-digit code (it works once, for 3 minutes). Type their phone number and that code. Passwords are not accepted.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input label="Approver phone" value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="03xxxxxxxxx" autoComplete="off" />
      <Input label="Approval code (6 digits)" type="text" inputMode="numeric" maxLength={6} value={password} onChange={(e) => onPassword(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
    </div>
  </div>
);

export default ApproverFields;
