// W16 (round 10): add / edit a rider — checks (name, Pakistani phone, CNIC,
// password for new riders, emergency phone), what is sent (optional fields
// cleared on edit), the full record loaded for edit, the sign-out warning,
// and G27: a mistake on "Basic info" while the admin is on the other tab left
// them on a tab with nothing highlighted.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RiderFormModal } from '@/components/riders/RiderFormModal';
import { riderService } from '@/services/rider.service';

jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/rider.service', () => ({ riderService: { getRiderById: jest.fn(), createRider: jest.fn(), updateRider: jest.fn() } }));

const toast = require('react-hot-toast').default;
const svc = riderService as jest.Mocked<typeof riderService>;

const existing = { id: 'r1', fullName: 'Bilal Rider', phone: '03001230001', cnic: '34201-1234567-1', vehicleType: 'bike', vehicleNumber: 'GRT-1', avatarUrl: null };

beforeEach(() => {
  svc.createRider.mockResolvedValue({ id: 'new' } as any);
  svc.updateRider.mockResolvedValue({ id: 'r1' } as any);
  svc.getRiderById.mockResolvedValue({ ...existing, bankName: 'HBL', emergencyContactName: 'Brother', emergencyContactPhone: '03009998887' } as any);
});

const fillBasics = () => {
  fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Naveed Khan' } });
  fireEvent.change(screen.getByLabelText(/Phone \(rider app login\)/), { target: { value: '03004445556' } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Rider123' } });
  fireEvent.change(screen.getByLabelText(/^CNIC/), { target: { value: '34201-7654321-1' } });
  fireEvent.change(screen.getByLabelText(/Vehicle number/), { target: { value: 'GRT-99' } });
};

describe('RiderFormModal', () => {
  it('a new rider: every check, then the form data sent (no empty optionals)', async () => {
    const onClose = jest.fn();
    render(<RiderFormModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    expect(screen.getByText('Full name is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required for a new rider')).toBeInTheDocument();
    expect(screen.getByText('CNIC is required')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Phone \(rider app login\)/), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/^CNIC/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    expect(screen.getByText('Enter a valid Pakistani number (e.g. 03001234567)')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid CNIC (12345-1234567-1)')).toBeInTheDocument();
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    await waitFor(() => expect(svc.createRider).toHaveBeenCalled());
    const fd = svc.createRider.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(fd.entries())).toEqual({
      full_name: 'Naveed Khan', phone: '03004445556', cnic: '34201-7654321-1', vehicle_type: 'bike', vehicle_number: 'GRT-99', password: 'Rider123',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a mistake on Basic info while on the payouts tab brings Basic info back (G27)', async () => {
    render(<RiderFormModal isOpen onClose={jest.fn()} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText(/^CNIC/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emergency & payouts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    expect(toast.error).toHaveBeenCalledWith('Please fix the highlighted fields');
    expect(screen.getByText('Enter a valid CNIC (12345-1234567-1)')).toBeVisible();
  });

  it('a wrong emergency phone alone opens the payouts tab', async () => {
    render(<RiderFormModal isOpen onClose={jest.fn()} />);
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Emergency & payouts' }));
    fireEvent.change(screen.getByLabelText(/Contact phone/), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Basic info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    expect(screen.getByText('Enter a valid phone number')).toBeVisible();
  });

  it('editing loads the full record, warns before a phone change, and clears emptied optional fields', async () => {
    render(<RiderFormModal isOpen editing={existing as any} onClose={jest.fn()} />);
    await waitFor(() => expect(svc.getRiderById).toHaveBeenCalledWith('r1'));
    fireEvent.change(screen.getByLabelText(/Phone \(rider app login\)/), { target: { value: '03001230009' } });
    expect(screen.getByText(/signs the rider out of the app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Emergency & payouts' }));
    await waitFor(() => expect(screen.getByLabelText(/Bank \/ wallet/)).toHaveValue('HBL'));
    fireEvent.change(screen.getByLabelText(/Bank \/ wallet/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(svc.updateRider).toHaveBeenCalled());
    const [id, fd] = svc.updateRider.mock.calls[0] as [string, FormData];
    expect(id).toBe('r1');
    expect(fd.get('phone')).toBe('03001230009');
    expect(fd.get('bank_name')).toBe(''); // cleared on the server
    expect(fd.get('password')).toBeNull(); // unchanged
  });

  it('a too-big or wrong-type photo is refused', () => {
    render(<RiderFormModal isOpen onClose={jest.fn()} />);
    const input = screen.getByLabelText('Rider photo');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(toast.error).toHaveBeenCalledWith('Use a JPG, PNG or WebP image');
    const big = new File(['x'], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(toast.error).toHaveBeenCalledWith('Image is too large. Max size is 5MB');
  });

  it('a prefill (rider application) fills the new form; a refused save shows the reason', async () => {
    svc.createRider.mockRejectedValueOnce(new Error('Phone already registered'));
    render(<RiderFormModal isOpen prefill={{ fullName: 'Applicant', phone: '03004445556', cnic: '34201-7654321-1', vehicleNumber: 'GRT-5' }} onClose={jest.fn()} />);
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Applicant');
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Rider123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create rider' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Phone already registered'));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create rider' })).toBeInTheDocument();
  });
});
