import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Phone, Mail, CreditCard, Upload, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { riderService } from '@/services/rider.service';
import { VEHICLE_TYPES } from '@/lib/riderLabels';
import { isRequired, isValidPhone, isValidCNIC } from '@/utils/validators';
import { resolveImageUrl } from '@/utils/formatters';
import type { CreateRiderData, Rider } from '@/types';

const EMPTY: CreateRiderData = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  cnic: '',
  vehicleType: 'bike',
  vehicleNumber: '',
  drivingLicenseNumber: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  bankAccountTitle: '',
  bankAccountNumber: '',
  bankName: '',
};

interface Props {
  isOpen: boolean;
  /** Rider being edited (the full record is re-fetched on open). */
  editing?: Rider | null;
  /** Prefill for a new rider (e.g. from a rider application). */
  prefill?: Partial<CreateRiderData>;
  onClose: () => void;
  onSaved?: (rider: Rider) => void;
}

/**
 * Add / edit a rider. Editing loads the FULL record (license, emergency and
 * bank details are not in the list rows) and sends every optional field, so
 * clearing a box really clears the value on the server.
 */
export const RiderFormModal: React.FC<Props> = ({ isOpen, editing, prefill, onClose, onSaved }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateRiderData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState(0);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Reset only when the modal opens (or switches rider) — not on every parent
  // re-render, which would wipe what the admin is typing (prefill objects are
  // usually created inline).
  const openKey = isOpen ? `open:${editing?.id ?? 'new'}` : 'closed';
  const prefillRef = React.useRef(prefill);
  prefillRef.current = prefill;
  const editingRef = React.useRef(editing);
  editingRef.current = editing;

  useEffect(() => {
    if (openKey === 'closed') return;
    const editing = editingRef.current;
    const prefill = prefillRef.current;
    setErrors({});
    setTab(0);
    setImage(null);
    if (!editing) {
      setForm({ ...EMPTY, ...(prefill || {}) });
      setPreview(null);
      return;
    }
    setPreview(editing.avatarUrl ? resolveImageUrl(editing.avatarUrl) : null);
    const fromRow = (r: Rider): CreateRiderData => ({
      fullName: r.fullName || '',
      phone: r.phone || '',
      email: r.email || '',
      password: '',
      cnic: r.cnic || '',
      vehicleType: (r.vehicleType as CreateRiderData['vehicleType']) || 'bike',
      vehicleNumber: r.vehicleNumber || '',
      drivingLicenseNumber: r.drivingLicenseNumber || '',
      emergencyContactName: r.emergencyContactName || '',
      emergencyContactPhone: r.emergencyContactPhone || '',
      bankAccountTitle: r.bankAccountTitle || '',
      bankAccountNumber: r.bankAccountNumber || '',
      bankName: r.bankName || '',
    });
    setForm(fromRow(editing));
    let cancelled = false;
    setLoadingRecord(true);
    riderService
      .getRiderById(editing.id)
      .then((full) => {
        if (!cancelled) setForm(fromRow(full));
      })
      .catch(() => toast.error('Could not load the full rider record — some fields may be empty'))
      .finally(() => !cancelled && setLoadingRecord(false));
    return () => {
      cancelled = true;
    };
  }, [openKey]);

  const set = (key: keyof CreateRiderData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!isRequired(form.fullName)) e.fullName = 'Full name is required';
    else if (form.fullName.trim().length < 3) e.fullName = 'Full name must be at least 3 characters';
    if (!isRequired(form.phone)) e.phone = 'Phone number is required';
    else if (!isValidPhone(form.phone)) e.phone = 'Enter a valid Pakistani number (e.g. 03001234567)';
    if (!editing && !form.password) e.password = 'Password is required for a new rider';
    else if (form.password && form.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (!isRequired(form.cnic)) e.cnic = 'CNIC is required';
    else if (!isValidCNIC(form.cnic)) e.cnic = 'Enter a valid CNIC (12345-1234567-1)';
    if (!isRequired(form.vehicleNumber)) e.vehicleNumber = 'Vehicle number is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (form.emergencyContactPhone && !isValidPhone(form.emergencyContactPhone)) {
      e.emergencyContactPhone = 'Enter a valid phone number';
    }
    setErrors(e);
    if (e.emergencyContactPhone && Object.keys(e).length === 1) setTab(1);
    return Object.keys(e).length === 0;
  };

  const mutation = useMutation({
    mutationFn: (data: FormData) => (editing ? riderService.updateRider(editing.id, data) : riderService.createRider(data)),
    onSuccess: (rider) => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success(editing ? 'Rider updated' : 'Rider created — they can now sign in to the rider app');
      onSaved?.(rider);
      onClose();
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to save rider'),
  });

  const submit = () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    const data = new FormData();
    data.append('full_name', form.fullName.trim());
    data.append('phone', form.phone.trim());
    data.append('cnic', form.cnic.trim());
    data.append('vehicle_type', form.vehicleType);
    data.append('vehicle_number', form.vehicleNumber.trim());
    if (form.password) data.append('password', form.password);
    // Optional fields are always sent on edit — an empty value clears it.
    const optional: Array<[string, string | undefined]> = [
      ['email', form.email],
      ['driving_license_number', form.drivingLicenseNumber],
      ['emergency_contact_name', form.emergencyContactName],
      ['emergency_contact_phone', form.emergencyContactPhone],
      ['bank_account_title', form.bankAccountTitle],
      ['bank_account_number', form.bankAccountNumber],
      ['bank_name', form.bankName],
    ];
    for (const [key, value] of optional) {
      const v = (value || '').trim();
      if (editing || v) data.append(key, v);
    }
    if (image) data.append('avatar', image);
    mutation.mutate(data);
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Image is too large. Max size is 5MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Use a JPG, PNG or WebP image');
    setImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? `Edit rider — ${editing.fullName || ''}` : 'Add rider'}
      size="lg"
      footer={
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} isLoading={mutation.isPending} disabled={loadingRecord}>
            {editing ? 'Save changes' : 'Create rider'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {loadingRecord && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading full rider record…
          </div>
        )}
        <div className="flex gap-2 border-b pb-2">
          {['Basic info', 'Emergency & payouts'].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setTab(i)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                tab === i ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 0 && (
          <>
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                  {preview ? <img src={preview} alt="Rider" className="w-full h-full object-cover" /> : <Users className="w-10 h-10 text-gray-400" />}
                </div>
                <label className="absolute bottom-0 right-0 bg-primary-600 text-white rounded-full p-2 cursor-pointer hover:bg-primary-700">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} className="hidden" />
                </label>
                {image && (
                  <button
                    type="button"
                    onClick={() => { setImage(null); setPreview(editing?.avatarUrl ? resolveImageUrl(editing.avatarUrl) : null); }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    aria-label="Remove new photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
              <Input
                label="Phone (rider app login)"
                value={form.phone}
                onChange={set('phone')}
                error={errors.phone}
                placeholder="03001234567"
                leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={editing ? 'New password (leave blank to keep)' : 'Password (rider app login)'}
                type="password"
                value={form.password}
                onChange={set('password')}
                error={errors.password}
                placeholder="Min 6 characters"
                required={!editing}
              />
              <Input
                label="Email (optional)"
                type="email"
                value={form.email}
                onChange={set('email')}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4 text-gray-400" />}
              />
            </div>
            {editing && (form.password || form.phone !== (editing.phone || '')) && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                Changing the phone or password signs the rider out of the app — share the new details with them.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="CNIC"
                value={form.cnic}
                onChange={set('cnic')}
                error={errors.cnic}
                placeholder="12345-1234567-1"
                leftIcon={<CreditCard className="w-4 h-4 text-gray-400" />}
                required
              />
              <Input label="Driving license no. (optional)" value={form.drivingLicenseNumber} onChange={set('drivingLicenseNumber')} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Vehicle type" value={form.vehicleType} onChange={set('vehicleType')} options={VEHICLE_TYPES} required />
              <Input label="Vehicle number" value={form.vehicleNumber} onChange={set('vehicleNumber')} error={errors.vehicleNumber} placeholder="GRT-1234" required />
            </div>
          </>
        )}

        {tab === 1 && (
          <>
            <h4 className="text-sm font-semibold text-gray-700">Emergency contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Contact name" value={form.emergencyContactName} onChange={set('emergencyContactName')} />
              <Input
                label="Contact phone"
                value={form.emergencyContactPhone}
                onChange={set('emergencyContactPhone')}
                error={errors.emergencyContactPhone}
                placeholder="03001234567"
                leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
              />
            </div>
            <h4 className="text-sm font-semibold text-gray-700 mt-2">Payout account</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Account title" value={form.bankAccountTitle} onChange={set('bankAccountTitle')} />
              <Input label="Account / IBAN / wallet no." value={form.bankAccountNumber} onChange={set('bankAccountNumber')} />
            </div>
            <Input label="Bank / wallet" value={form.bankName} onChange={set('bankName')} placeholder="e.g. JazzCash, EasyPaisa, HBL" />
          </>
        )}
      </div>
    </Modal>
  );
};

export default RiderFormModal;
