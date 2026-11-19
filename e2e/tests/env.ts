// Where the servers are, and the test-only one-time code (OTP bypass is on in
// the test API only).
export const WEBSITE = process.env.WEBSITE_URL || 'http://localhost:3001';
export const ADMIN = process.env.ADMIN_URL || 'http://localhost:5173';
export const API = process.env.API_URL || 'http://localhost:3999/api';
export const OTP = process.env.OTP_BYPASS_CODE || '123789';
export const ADMIN_PHONE = process.env.ADMIN_PHONE || '03001112222';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin12345';

/** A fresh customer number each run (03 + 9 digits). */
export const freshPhone = () => `0347${String(Math.floor(1000000 + Math.random() * 8999999))}`;

export async function apiGet(path: string, token?: string) {
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return (await res.json()) as any;
}
