// The customer AI-chat key was saved in site_settings as plain text (the AI
// Audit key was already encrypted). Now: stored encrypted, read back, and an
// old plain-text key keeps working and is re-saved encrypted.
const mockStore: Record<string, string> = {};
const mockUpsert = jest.fn(async (key: string, value: string) => { mockStore[key] = value; });
jest.mock('../../src/utils/siteSettings', () => ({
  fetchGlobalSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, mockStore[k] ?? ''])),
  upsertGlobalSiteSetting: (key: string, value: string) => mockUpsert(key, value),
  fetchWhatsAppOrderSettings: async () => ({}),
  WHATSAPP_ORDER_URL_KEY: 'whatsapp_order_url',
}));

import { AI_KEYS, getAiConfig } from '../../src/services/aiChat.service';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../../src/utils/secretBox';

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockUpsert.mockClear();
  delete process.env.AI_CHAT_API_KEY;
});

it('an encrypted key is decrypted for use', async () => {
  mockStore[AI_KEYS.apiKey] = encryptSecret('sk-ant-real-123');
  expect((await getAiConfig()).apiKey).toBe('sk-ant-real-123');
  expect(mockUpsert).not.toHaveBeenCalled();
});

it('an old plain-text key still works and is re-saved encrypted', async () => {
  mockStore[AI_KEYS.apiKey] = 'sk-ant-legacy-456';
  expect((await getAiConfig()).apiKey).toBe('sk-ant-legacy-456');
  await new Promise((r) => setImmediate(r));
  const saved = mockStore[AI_KEYS.apiKey];
  expect(isEncryptedSecret(saved)).toBe(true);
  expect(saved).not.toContain('legacy');
  expect(decryptSecret(saved)).toBe('sk-ant-legacy-456');
});

it('a key encrypted with another secret is treated as missing, not sent garbled', async () => {
  const prev = process.env.AUDIT_AI_SECRET;
  process.env.AUDIT_AI_SECRET = 'old-secret';
  mockStore[AI_KEYS.apiKey] = encryptSecret('sk-ant-x');
  process.env.AUDIT_AI_SECRET = 'new-secret';
  try {
    expect((await getAiConfig()).apiKey).toBe('');
  } finally {
    if (prev === undefined) delete process.env.AUDIT_AI_SECRET; else process.env.AUDIT_AI_SECRET = prev;
  }
});
