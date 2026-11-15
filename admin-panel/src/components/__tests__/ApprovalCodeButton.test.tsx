// The approver makes a one-time code on their own device (J3).
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockCreate = jest.fn();
const mockMine = jest.fn();
jest.mock('@/services/approvalCode.service', () => ({
  approvalCodeService: { create: () => mockCreate(), mine: () => mockMine() },
}));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }));

import { ApprovalCodeButton } from '@/components/approval/ApprovalCodeButton';

it('shows a fresh 6-digit code with its countdown and what earlier codes were used for', async () => {
  mockMine.mockResolvedValue([
    { createdAt: '2026-11-15T06:00:00Z', expiresAt: '2026-11-15T06:03:00Z', usedAt: '2026-11-15T06:01:00Z', usedFor: 'an expense', usedByName: 'Bilal', attempts: 0 },
  ]);
  mockCreate.mockResolvedValue({ code: '482913', expiresAt: new Date(Date.now() + 180000).toISOString(), validSeconds: 180, maxWrongTries: 5 });
  render(<ApprovalCodeButton />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Give approval code' }));
  });
  expect(screen.getByRole('dialog', { name: 'Give approval code' })).toBeInTheDocument();
  expect(screen.getByText(/used by/)).toHaveTextContent('used by Bilal for an expense');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make approval code' }));
  });
  expect(screen.getByText('482913')).toBeInTheDocument();
  expect(screen.getByText(/Valid for [23]:\d\d/)).toBeInTheDocument();
});
