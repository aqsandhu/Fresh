// ============================================================================
// Expo push sender — delivers notifications to the mobile apps' Expo push
// tokens stored in users.device_tokens. Fire-and-forget: never throws, never
// blocks the request that triggered it.
//
// The rider app registers `ExponentPushToken[...]` via PUT /rider/fcm-token;
// the customer app via POST /notifications/register. Without this sender those
// tokens were stored but nothing was ever sent, so a backgrounded rider never
// learned about a new assignment.
// ============================================================================

import { query } from '../config/database';
import logger from './logger';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android channel id defined by the receiving app. */
  channelId?: string;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
}

const EXPO_TOKEN_RE = /^Expo(?:nent)?PushToken\[[^\]]+\]$/;

export const isExpoPushToken = (token: unknown): token is string =>
  typeof token === 'string' && EXPO_TOKEN_RE.test(token.trim());

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Build the Expo request bodies for a set of tokens (pure — unit tested). */
export const buildExpoMessages = (tokens: string[], message: PushMessage) =>
  tokens.filter(isExpoPushToken).map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound === undefined ? 'default' : message.sound,
    priority: message.priority ?? 'high',
    ...(message.channelId ? { channelId: message.channelId } : {}),
  }));

/** Collect Expo-format tokens for the given user ids. */
export async function getExpoTokensForUsers(userIds: string[]): Promise<string[]> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return [];
  const result = await query(
    `SELECT unnest(device_tokens) AS token
       FROM users
      WHERE id = ANY($1::uuid[])
        AND status = 'active'
        AND deleted_at IS NULL
        AND device_tokens IS NOT NULL`,
    [ids]
  );
  const seen = new Set<string>();
  for (const row of result.rows) {
    if (isExpoPushToken(row.token)) seen.add(row.token.trim());
  }
  return [...seen];
}

/**
 * Send a push to every Expo token of the given users. Errors are logged and
 * swallowed. Returns the number of messages handed to Expo.
 */
export async function sendExpoPushToUsers(userIds: string[], message: PushMessage): Promise<number> {
  try {
    const tokens = await getExpoTokensForUsers(userIds);
    if (tokens.length === 0) return 0;
    const messages = buildExpoMessages(tokens, message);
    let sent = 0;
    for (const batch of chunk(messages, CHUNK_SIZE)) {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          logger.warn('Expo push rejected batch', { status: res.status, count: batch.length });
          continue;
        }
        const payload = (await res.json().catch(() => null)) as { data?: Array<{ status?: string; message?: string; details?: { error?: string } }> } | null;
        const tickets = payload?.data ?? [];
        const invalid: string[] = [];
        tickets.forEach((ticket, i) => {
          if (ticket?.status === 'error') {
            if (ticket.details?.error === 'DeviceNotRegistered') invalid.push(batch[i].to);
            logger.warn('Expo push ticket error', { error: ticket.details?.error, message: ticket.message });
          } else {
            sent += 1;
          }
        });
        if (invalid.length) await pruneTokens(invalid);
      } catch (err) {
        logger.warn('Expo push batch failed', { error: (err as Error).message });
      }
    }
    return sent;
  } catch (err) {
    logger.error('sendExpoPushToUsers failed', { error: (err as Error).message });
    return 0;
  }
}

/** Remove tokens Expo reports as DeviceNotRegistered so we stop retrying them. */
async function pruneTokens(tokens: string[]): Promise<void> {
  try {
    await query(
      `UPDATE users
          SET device_tokens = ARRAY(SELECT t FROM unnest(device_tokens) AS t WHERE NOT (t = ANY($1::text[]))),
              updated_at = NOW()
        WHERE device_tokens && $1::text[]`,
      [tokens]
    );
  } catch (err) {
    logger.warn('Failed to prune stale push tokens', { error: (err as Error).message });
  }
}
