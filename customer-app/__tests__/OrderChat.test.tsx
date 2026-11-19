// W15 (round 10): the customer ↔ rider chat — only this order's messages
// (I13), live send over the socket, REST when offline with the text kept on
// failure, closed orders read-only.
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('@services/chat.service', () => ({
  __esModule: true,
  chatService: { getMessages: jest.fn(), sendMessage: jest.fn() },
}));
jest.mock('@services/socket.service', () => {
  const handlers: Record<string, (d: any) => void> = {};
  const sock = {
    __handlers: handlers,
    __connected: true,
    connect: jest.fn(async () => undefined),
    isConnected: jest.fn(() => sock.__connected),
    subscribeToOrder: jest.fn(),
    onChatMessage: jest.fn((cb: (d: any) => void) => { handlers['chat:message'] = cb; }),
    offChatMessage: jest.fn(),
    onTyping: jest.fn((cb: (d: any) => void) => { handlers['chat:typing'] = cb; }),
    off: jest.fn(),
    sendChatMessage: jest.fn(),
    emitTyping: jest.fn(),
  };
  return { __esModule: true, socketService: sock };
});

import OrderChat from '@components/OrderChat';
const { chatService } = require('@services/chat.service');
const { socketService } = require('@services/socket.service');

const m = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, message: text, sender_type: 'rider', sender_name: 'Asif', created_at: new Date().toISOString(), ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  socketService.__connected = true;
  chatService.getMessages.mockResolvedValue({ success: true, data: { messages: [m('m1', 'On my way')] } });
});

async function renderChat(status = 'out_for_delivery') {
  const s = render(<OrderChat orderId="ord-1" orderStatus={status} />);
  await s.findByText('On my way');
  await waitFor(() => expect(socketService.onChatMessage).toHaveBeenCalled());
  return s;
}

describe('OrderChat', () => {
  it('shows this order\'s new messages but never another order\'s (I13)', async () => {
    const s = await renderChat();
    await act(async () => {
      socketService.__handlers['chat:message'](m('x1', 'Message for ORDER 2', { order_id: 'ord-2' }));
      socketService.__handlers['chat:message'](m('m2', 'At your gate', { order_id: 'ord-1' }));
    });
    expect(s.getByText('At your gate')).toBeTruthy();
    expect(s.queryByText('Message for ORDER 2')).toBeNull();
  });

  it('sends over the socket when connected (shown at once)', async () => {
    const s = await renderChat();
    fireEvent.changeText(s.getByPlaceholderText('Type a message...'), 'Ring the bell please');
    await act(async () => {
      fireEvent.press(s.getByLabelText('Send message'));
    });
    expect(socketService.sendChatMessage).toHaveBeenCalledWith('ord-1', 'Ring the bell please');
    expect(s.getByText('Ring the bell please')).toBeTruthy();
  });

  it('offline: sends over the internet API, and on failure puts the text back', async () => {
    socketService.__connected = false;
    chatService.sendMessage.mockRejectedValue(new Error('down'));
    const s = await renderChat();
    fireEvent.changeText(s.getByPlaceholderText('Type a message...'), 'Gate 2');
    await act(async () => {
      fireEvent.press(s.getByLabelText('Send message'));
    });
    await waitFor(() => expect(chatService.sendMessage).toHaveBeenCalledWith('ord-1', 'Gate 2'));
    await waitFor(() => expect(s.getByPlaceholderText('Type a message...').props.value).toBe('Gate 2'));
  });
});
