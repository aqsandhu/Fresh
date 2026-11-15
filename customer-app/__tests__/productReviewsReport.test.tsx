// Reviews by other customers can be reported (App Store guideline 1.2).
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockReport = jest.fn();
jest.mock('@services/feedback.service', () => ({
  feedbackService: {
    getProductReviews: jest.fn(async () => ({
      success: true,
      data: { summary: { average: 4, count: 1 }, reviews: [{ id: 'r1', rating: 4, comment: 'Nice', authorName: 'Ali' }] },
    })),
    reportReview: (...a: unknown[]) => mockReport(...a),
  },
}));
let mockSignedIn = true;
jest.mock('@store', () => ({
  useAuthStore: (pick: (s: { isAuthenticated: boolean }) => unknown) => pick({ isAuthenticated: mockSignedIn }),
}));

import { ProductReviews } from '@components/feedback/ProductReviews';

type AlertButton = { text?: string; onPress?: () => void };

describe('reporting a review', () => {
  beforeEach(() => {
    mockReport.mockReset();
    mockSignedIn = true;
  });

  it('asks why, sends the reason and marks it reported', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockReport.mockResolvedValue({ success: true, data: { reported: true } });
    const view = render(<ProductReviews productId="p1" />);
    fireEvent.press(await view.findByLabelText('Report review by Ali'));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    expect(buttons.map((b) => b.text)).toEqual(['Offensive or abusive', 'Spam or fake', 'Shows personal information', 'Cancel']);
    buttons[0].onPress?.();
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith('r1', 'offensive'));
    expect(await view.findByText('Reported')).toBeTruthy();
    alert.mockRestore();
  });

  it('asks a signed-out visitor to sign in instead', async () => {
    mockSignedIn = false;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = render(<ProductReviews productId="p1" />);
    fireEvent.press(await view.findByLabelText('Report review by Ali'));
    expect(alert).toHaveBeenCalledWith('Sign in needed', expect.any(String));
    expect(mockReport).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
