// W15 (round 10): the assistant's reply is untrusted text. Links: only
// https:// and only after the customer confirms the website; javascript: /
// plain http: never open; internal pages navigate in the app.
import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@services/aiChat.service', () => ({
  __esModule: true,
  aiChatService: { getStatus: jest.fn(async () => ({ enabled: true })), sendMessage: jest.fn() },
}));
jest.mock('@/navigation/navigationUtils', () => ({
  navigationRef: { isReady: () => true, navigate: jest.fn(), getCurrentRoute: () => ({ name: 'Home' }) },
}));
jest.mock('@store/drawerUi', () => {
  const state = { open: true, setOpen: jest.fn() };
  return { useAiChatUi: (sel: any) => sel(state) };
});

import { AiChatWidget } from '@components/common/AiChatWidget';
const { aiChatService } = require('@services/aiChat.service');

let client: QueryClient;
afterEach(() => client?.clear()); // no cache timer left behind (Jest would not exit)

function renderChat() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <AiChatWidget />
    </QueryClientProvider>
  );
}

async function ask(s: ReturnType<typeof render>, reply: string) {
  aiChatService.sendMessage.mockResolvedValueOnce({ reply });
  fireEvent.changeText(await s.findByPlaceholderText('Type your message…'), 'help');
  fireEvent(s.getByPlaceholderText('Type your message…'), 'submitEditing');
  await waitFor(() => expect(aiChatService.sendMessage).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

describe('AiChatWidget links', () => {
  it('a javascript: link in a reply is shown but never opened', async () => {
    const s = renderChat();
    await ask(s, 'Tap [here](javascript:alert(1)) for a deal');
    // The javascript: target is not a recognised link, so nothing tappable opens it.
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('an https link asks first and names the website', async () => {
    const s = renderChat();
    await ask(s, 'See [the offer](https://evil.example/path)');
    fireEvent.press(await s.findByText('the offer'));
    expect(Alert.alert).toHaveBeenCalledWith('Open link?', expect.stringContaining('evil.example'), expect.any(Array));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('a plain http link is not opened at all', async () => {
    const s = renderChat();
    await ask(s, 'Go to [old site](http://plain.example)');
    fireEvent.press(await s.findByText('old site'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('when the assistant fails, a friendly message appears instead of a crash', async () => {
    aiChatService.sendMessage.mockRejectedValueOnce(new Error('502'));
    const s = renderChat();
    fireEvent.changeText(await s.findByPlaceholderText('Type your message…'), 'help');
    fireEvent(s.getByPlaceholderText('Type your message…'), 'submitEditing');
    expect(await s.findByText(/Maazrat/)).toBeTruthy();
  });
});
