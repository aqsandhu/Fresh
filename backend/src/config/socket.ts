// ============================================================================
// SOCKET.IO SERVER CONFIGURATION - Real-time chat, order tracking, notifications
// ============================================================================

import { asCaughtError } from '../utils/caughtError';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { verifySocketToken } from './jwt';
import { query } from './database';
import logger from '../utils/logger';
import { isCorsOriginAllowed } from '../utils/corsOrigins';
import { parseCookieHeader } from '../utils/authCookies';
import { SocketEventRateLimiter } from '../utils/socketRateLimit';

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const chatRateLimiter = new SocketEventRateLimiter(30, 60_000);
const locationRateLimiter = new SocketEventRateLimiter(6, 10_000);
const typingRateLimiter = new SocketEventRateLimiter(20, 10_000);

let io: Server;

export type RiderLocationPayload = {
  riderId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt: string;
};

type ChatSenderType = 'customer' | 'rider' | 'admin';

function mapChatSenderType(role?: string): ChatSenderType | null {
  if (role === 'rider') return 'rider';
  if (role === 'admin' || role === 'super_admin') return 'admin';
  if (role === 'customer') return 'customer';
  return null;
}

/**
 * Verifies that the authenticated socket user is allowed to access an order.
 * The super admin: any order. A city admin: only their city's orders (B29 —
 * every admin could join every city's order room, hear its updates and write
 * in its chat). Same city match as the REST order screens (orderInScope).
 */
export const canAccessOrder = async (
  orderId: string,
  userId: string,
  role?: string,
  adminCityId?: string | null
): Promise<boolean> => {
  if (role === 'super_admin') return true;
  if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(orderId))) return false;
  if (role === 'admin') {
    if (!adminCityId) return false;
    const r = await query(
      `SELECT 1 FROM orders o
         LEFT JOIN addresses a ON a.id = o.address_id
         JOIN service_cities sc ON sc.id = $2
        WHERE o.id = $1 AND o.deleted_at IS NULL
          AND (o.city_id = sc.id
               OR LOWER(COALESCE(a.city, '')) = LOWER(sc.name)
               OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER(sc.name))
        LIMIT 1`,
      [orderId, adminCityId]
    );
    return r.rows.length > 0;
  }
  if (!userId) return false;
  const result = await query(
    `SELECT o.id FROM orders o
     LEFT JOIN riders r ON o.rider_id = r.id
     WHERE o.id = $1 AND (o.user_id = $2 OR r.user_id = $2)`,
    [orderId, userId]
  );
  return result.rows.length > 0;
};

function extractSocketToken(socket: {
  handshake: {
    auth?: { token?: string };
    headers: { authorization?: string; cookie?: string };
  };
}): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (fromAuth) return fromAuth;

  const authHeader = socket.handshake.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  return cookies.token;
}

const ADMIN_ROOM_ALL = 'admins';
const ADMIN_ROOM_SUPER = 'admins:super';
const adminCityRoom = (cityId: string) => `admins:city:${cityId}`;

/** City of a non-super admin (their role's city) — same rule as resolveCityScope. */
async function resolveAdminCityId(userId: string): Promise<string | null> {
  const r = await query(
    `SELECT sc.id
       FROM users u
       JOIN admin_roles r ON r.id = u.admin_role_id
       LEFT JOIN service_cities sc ON sc.id = COALESCE(
         r.city_id,
         (SELECT id FROM service_cities WHERE LOWER(name) = LOWER(r.city) LIMIT 1)
       )
      WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0]?.id ?? null;
}

export const initializeSocket = (httpServer: ReturnType<typeof createServer>) => {
  io = new Server(httpServer, {
    cors: {
      // Mirror the REST CORS policy in app.ts: explicit allowlist, '*' allows
      // any origin, dev also accepts localhost on any port. The callback form
      // reflects the request origin, which stays valid with credentials:true
      // (unlike a literal '*' origin, which browsers reject with credentials).
      origin: (origin, callback) => {
        // No Origin header: native apps, server-to-server — allow.
        if (!origin || isCorsOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        logger.warn(`Socket.IO CORS blocked origin: ${origin}`, {
          hint: 'Add this URL to CORS_ORIGIN (or CORS_EXTRA_ORIGINS) on Render',
        });
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) throw new Error('Authentication required');
      const decoded = verifySocketToken(token);
      const userResult = await query(
        `SELECT id, phone, role, status
           FROM users
          WHERE id = $1 AND deleted_at IS NULL`,
        [decoded.userId]
      );
      const user = userResult.rows[0];
      if (!user || user.status !== 'active') {
        throw new Error('Account is not active');
      }

      if (user.role === 'rider') {
        const riderResult = await query(
          `SELECT id
             FROM riders
            WHERE user_id = $1
              AND deleted_at IS NULL
              AND verification_status = 'verified'`,
          [decoded.userId]
        );
        if (riderResult.rows.length === 0) {
          throw new Error('Rider account is not verified');
        }
      }

      // Admin realtime is city-scoped: a city admin only hears about orders,
      // riders and tickets of their own city (super admins hear everything).
      let adminCityId: string | null = null;
      if (user.role === 'admin') {
        adminCityId = await resolveAdminCityId(user.id).catch(() => null);
      }

      socket.data.user = {
        ...decoded,
        phone: user.phone,
        role: user.role,
        adminCityId,
      };
      next();
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user?.userId;
    const role = socket.data.user?.role;
    logger.info(
      `Socket connected: ${socket.id}, user: ${userId}, role: ${role}`
    );

    socket.join(`user:${userId}`);
    if (role === 'rider') socket.join('riders');
    if (role === 'admin' || role === 'super_admin') socket.join(ADMIN_ROOM_ALL);
    if (role === 'super_admin') socket.join(ADMIN_ROOM_SUPER);
    if (role === 'admin' && socket.data.user?.adminCityId) {
      socket.join(adminCityRoom(socket.data.user.adminCityId));
    }

    socket.on('chat:send', async (data: { orderId: string; message: string }) => {
      try {
        if (!chatRateLimiter.allow(socket.id, 'chat:send')) {
          socket.emit('chat:error', { message: 'Too many messages — please slow down' });
          return;
        }

        const allowed = await canAccessOrder(data.orderId, userId, role, socket.data.user?.adminCityId);
        if (!allowed) {
          logger.warn(
            `Unauthorized chat:send by user ${userId} on order ${data.orderId}`
          );
          socket.emit('chat:error', { message: 'Not authorized for this order' });
          return;
        }

        // Mirror the REST chat gate (chat.controller.ts): no messages on
        // completed orders — the socket path used to skip this check.
        const statusRes = await query(
          `SELECT status FROM orders WHERE id = $1`,
          [data.orderId]
        );
        if (['delivered', 'cancelled'].includes(statusRes.rows[0]?.status)) {
          socket.emit('chat:error', { message: 'Cannot send messages on completed orders' });
          return;
        }

        const senderType = mapChatSenderType(role);
        if (!senderType) {
          socket.emit('chat:error', { message: 'Invalid sender role' });
          return;
        }

        const message = data.message?.trim();
        if (!message) {
          socket.emit('chat:error', { message: 'Message cannot be empty' });
          return;
        }
        if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
          socket.emit('chat:error', {
            message: `Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`,
          });
          return;
        }

        const result = await query(
          `INSERT INTO order_messages (order_id, sender_type, sender_id, message)
           VALUES ($1, $2, $3, $4) RETURNING id, order_id, message, sender_type, created_at`, // order_id: clients drop other orders' messages (I13)
          [data.orderId, senderType, userId, message]
        );
        const newMessage = result.rows[0];

        const senderResult = await query(
          `SELECT full_name FROM users WHERE id = $1`,
          [userId]
        );
        newMessage.sender_name =
          senderResult.rows[0]?.full_name || 'Unknown';

        // Broadcast to everyone ELSE in the room — the sender keeps the
        // optimistic copy it rendered locally (io.to would echo it back and
        // duplicate the bubble).
        socket.to(`order:${data.orderId}`).emit('chat:message', newMessage);
      } catch (errCaught: unknown) {
        const err = asCaughtError(errCaught);
        logger.error('Error handling chat:send:', err);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    socket.on(
      'chat:typing',
      async (data: { orderId: string; isTyping: boolean }) => {
        try {
          if (!typingRateLimiter.allow(socket.id, 'chat:typing')) return;
          const allowed = await canAccessOrder(data.orderId, userId, role, socket.data.user?.adminCityId);
          if (!allowed) return;
          socket.to(`order:${data.orderId}`).emit('chat:typing', {
            orderId: data.orderId,
            isTyping: data.isTyping,
            userId,
          });
        } catch (errCaught: unknown) {
          const err = asCaughtError(errCaught);
          logger.error('Error handling chat:typing:', err);
        }
      }
    );

    socket.on('order:subscribe', async (orderId: string) => {
      try {
        const allowed = await canAccessOrder(orderId, userId, role, socket.data.user?.adminCityId);
        if (!allowed) {
          logger.warn(
            `Unauthorized order:subscribe by user ${userId} on order ${orderId}`
          );
          socket.emit('order:error', { message: 'Not authorized for this order' });
          return;
        }
        socket.join(`order:${orderId}`);
        logger.debug(`Socket ${socket.id} subscribed to order:${orderId}`);
      } catch (errCaught: unknown) {
        const err = asCaughtError(errCaught);
        logger.error('Error handling order:subscribe:', err);
        socket.emit('order:error', { message: 'Failed to subscribe to order' });
      }
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} unsubscribed from order:${orderId}`);
    });

    socket.on(
      'rider:location',
      async (data: { riderId: string; latitude: number; longitude: number; accuracy?: number | null }) => {
        try {
          if (!locationRateLimiter.allow(socket.id, 'rider:location')) {
            return;
          }

          // Validate coordinates BEFORE touching the DB — NaN/Infinity or
          // out-of-range values would corrupt the geography column or throw.
          const lat = Number(data.latitude);
          const lng = Number(data.longitude);
          const acc = data.accuracy === null || data.accuracy === undefined ? null : Number(data.accuracy);
          if (
            !Number.isFinite(lat) || lat < -90 || lat > 90 ||
            !Number.isFinite(lng) || lng < -180 || lng > 180 ||
            (acc !== null && (!Number.isFinite(acc) || acc < 0 || acc > 10000))
          ) {
            logger.warn(`Invalid rider:location payload from user ${userId}`, {
              latitude: data.latitude, longitude: data.longitude, accuracy: data.accuracy,
            });
            return;
          }

          const ownership = await query(
            `SELECT id
               FROM riders
              WHERE id = $1
                AND user_id = $2
                AND deleted_at IS NULL
                AND verification_status = 'verified'`,
            [data.riderId, userId]
          );
          if (ownership.rows.length === 0) {
            logger.warn(
              `Rider location spoof attempt by user ${userId} for rider ${data.riderId}`
            );
            return;
          }
          await query(
            `UPDATE riders 
             SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                 location_accuracy = $4,
                 location_updated_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [lng, lat, data.riderId, acc]
          );
          const payload = {
            riderId: data.riderId,
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            updatedAt: new Date().toISOString(),
          };
          await emitRiderLocationUpdate(payload);
        } catch (errCaught: unknown) {
          const err = asCaughtError(errCaught);
          logger.error('Error updating rider location:', err);
        }
      }
    );

    socket.on('disconnect', (reason) => {
      chatRateLimiter.cleanup(socket.id);
      locationRateLimiter.cleanup(socket.id);
      typingRateLimiter.cleanup(socket.id);
      logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  // Second line of defence (B29): the account is checked only at the
  // handshake, so a socket opened before a block / removal / role change made
  // straight in the database kept receiving events. Every few minutes each
  // open socket's account is checked again.
  const recheckMs = Math.max(30_000, Number(process.env.SOCKET_RECHECK_MS) || 5 * 60_000);
  setInterval(() => {
    recheckAllSockets().catch((err) => logger.warn('Socket recheck failed', { error: err?.message }));
  }, recheckMs).unref();

  return io;
};

type LiveAccount = { ok: boolean; adminCityId: string | null };

/** Is this account still allowed a live connection, and (admins) which city room? */
async function liveAccounts(userIds: string[]): Promise<Map<string, LiveAccount>> {
  const out = new Map<string, LiveAccount>();
  if (userIds.length === 0) return out;
  const r = await query(
    `SELECT u.id, u.role, u.status, u.deleted_at IS NULL AS live,
            (SELECT verification_status::text FROM riders rd WHERE rd.user_id = u.id AND rd.deleted_at IS NULL LIMIT 1) AS rider_verification
       FROM users u WHERE u.id = ANY($1::uuid[])`,
    [userIds]
  );
  for (const row of r.rows) {
    const ok = row.live && row.status === 'active' && (row.role !== 'rider' || row.rider_verification === 'verified');
    const adminCityId = ok && row.role === 'admin' ? await resolveAdminCityId(row.id).catch(() => null) : null;
    out.set(row.id, { ok, adminCityId });
  }
  for (const id of userIds) if (!out.has(id)) out.set(id, { ok: false, adminCityId: null });
  return out;
}

/** Apply an account's current state to its open sockets: close them, or move an admin to their city room. */
function applyAccount(sockets: any[], account: LiveAccount): void {
  for (const s of sockets) {
    if (!account.ok) {
      s.disconnect(true);
      continue;
    }
    if (s.data?.user?.role === 'admin' && s.data.user.adminCityId !== account.adminCityId) {
      for (const room of Array.from(s.rooms as Set<string>)) {
        if (room.startsWith('admins:city:') || room.startsWith('order:')) s.leave(room);
      }
      if (account.adminCityId) s.join(adminCityRoom(account.adminCityId));
      s.data.user.adminCityId = account.adminCityId;
    }
  }
}

/**
 * Call after an account is blocked, removed, deleted, logged out everywhere
 * or given another role: its open sockets are closed (or, for an admin who
 * keeps access, moved to their current city) at once instead of staying live.
 */
export async function syncUserSockets(userId: string | null | undefined): Promise<void> {
  if (!io || !userId) return;
  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (sockets.length === 0) return;
    const account = (await liveAccounts([userId])).get(userId)!;
    applyAccount(sockets, account);
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    logger.warn('syncUserSockets failed', { userId, error: err?.message });
  }
}

/** Close every open socket of a user (their sessions were all ended). */
export function disconnectUserSockets(userId: string | null | undefined): void {
  if (!io || !userId) return;
  try {
    io.in(`user:${userId}`).disconnectSockets(true);
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    logger.warn('disconnectUserSockets failed', { userId, error: err?.message });
  }
}

async function recheckAllSockets(): Promise<void> {
  if (!io) return;
  const sockets = await io.fetchSockets();
  const byUser = new Map<string, any[]>();
  for (const s of sockets) {
    const id = s.data?.user?.userId;
    if (!id) continue;
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id)!.push(s);
  }
  const accounts = await liveAccounts(Array.from(byUser.keys()));
  for (const [id, list] of byUser) applyAccount(list, accounts.get(id)!);
}

export const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

export const emitOrderUpdate = (orderId: string, data: unknown) => {
  try {
    getIO().to(`order:${orderId}`).emit('order:update', data);
  } catch (err) {
    logger.error('emitOrderUpdate error:', err);
  }
};

export const emitChatMessage = (orderId: string, message: Record<string, unknown> & { order_id?: string | null }) => {
  try {
    // Always say which order the message is for (I13): a socket in several
    // order rooms (a rider with many orders, an admin) could not tell.
    getIO().to(`order:${orderId}`).emit('chat:message', { ...message, order_id: message?.order_id ?? orderId });
  } catch (err) {
    logger.error('emitChatMessage error:', err);
  }
};

export const emitToUser = (userId: string | null | undefined, event: string, data: unknown) => {
  if (!userId) return;
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch (err) {
    logger.error('emitToUser error:', err);
  }
};

/**
 * Super admins only — the owner's watchdog findings must not be broadcast to
 * the city admins whose own actions they may be about.
 */
export const emitToSuperAdmins = (event: string, data: unknown) => {
  try {
    getIO().to(ADMIN_ROOM_SUPER).emit(event, data);
  } catch (err) {
    logger.error('emitToSuperAdmins error:', err);
  }
};

/** Every admin (any city). Use only for events that belong to no city. */
export const emitToAdmins = (event: string, data: unknown) => {
  try {
    getIO().to(ADMIN_ROOM_ALL).emit(event, data);
  } catch (err) {
    logger.error('emitToAdmins error:', err);
  }
};

/**
 * Super admins + the admins of ONE city. Before this every admin of every
 * city got every new-order sound, cancel toast and rider GPS ping (audit F4).
 * Unknown city (legacy rows) → all admins, the old behaviour.
 */
export const emitToCityAdmins = (cityId: string | null | undefined, event: string, data: unknown) => {
  try {
    if (!cityId) {
      getIO().to(ADMIN_ROOM_ALL).emit(event, data);
      return;
    }
    getIO().to(ADMIN_ROOM_SUPER).to(adminCityRoom(cityId)).emit(event, data);
  } catch (err) {
    logger.error('emitToCityAdmins error:', err);
  }
};

/** Admin event about an order → that order's city admins + super admins. */
export const emitOrderEventToAdmins = (orderId: string | null | undefined, event: string, data: unknown): void => {
  if (!orderId) {
    emitToAdmins(event, data);
    return;
  }
  query('SELECT city_id FROM orders WHERE id = $1', [orderId])
    .then((r) => emitToCityAdmins(r.rows[0]?.city_id ?? null, event, data))
    .catch(() => emitToAdmins(event, data));
};

/** Admin event about a rider → the rider's city admins + super admins. */
export const emitRiderEventToAdmins = (riderId: string | null | undefined, event: string, data: unknown): void => {
  if (!riderId) {
    emitToAdmins(event, data);
    return;
  }
  query('SELECT city_id FROM riders WHERE id = $1', [riderId])
    .then((r) => emitToCityAdmins(r.rows[0]?.city_id ?? null, event, data))
    .catch(() => emitToAdmins(event, data));
};

export const emitRiderLocationUpdate = async (payload: RiderLocationPayload) => {
  try {
    const activeOrders = await query(
      `SELECT o.id, (SELECT city_id FROM riders WHERE id = $1) AS rider_city_id
         FROM (SELECT 1) one
         LEFT JOIN orders o
           ON o.rider_id = $1
          AND o.status IN ('confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery')
          AND o.deleted_at IS NULL`,
      [payload.riderId]
    );
    for (const row of activeOrders.rows) {
      if (row.id) getIO().to(`order:${row.id}`).emit('rider:location', payload);
    }
    // Live GPS goes to the rider's own city admins only.
    emitToCityAdmins(activeOrders.rows[0]?.rider_city_id ?? null, 'rider:location', payload);
  } catch (err) {
    logger.error('emitRiderLocationUpdate error:', err);
  }
};

export const emitToRiders = (event: string, data: unknown) => {
  try {
    getIO().to('riders').emit(event, data);
  } catch (err) {
    logger.error('emitToRiders error:', err);
  }
};
