// ============================================================================
// ADMIN TWO-STEP LOGIN — password, then a one-time code on the admin's phone.
//
// It follows the SAME rule as every other OTP in the system:
//   bypass  OTP_BYPASS_ENABLED=true   the fixed bypass code is accepted, nothing
//                                     is sent (temporary, until the owner turns
//                                     bypass off)
//   code    a delivery channel is     we generate a code, send it over
//           configured (WhatsApp      WhatsApp / SMS and check it — the same
//           Cloud API or SMS gateway) sender and store the customer OTP uses
//   off     neither of the above, or  password only. Admins are never locked
//           ADMIN_2FA_ENABLED=false   out because no code could be delivered;
//                                     a warning is logged at boot instead.
// ============================================================================

import logger from '../utils/logger';
import { isOtpBypassEnabled } from './otpBypass';
import { isSmsConfigured, isWhatsAppConfigured } from '../services/otpSender.service';

export type Admin2faMode = 'off' | 'bypass' | 'code';

export function admin2faMode(): Admin2faMode {
  if (process.env.ADMIN_2FA_ENABLED === 'false') return 'off';
  if (isOtpBypassEnabled()) return 'bypass';
  if (isWhatsAppConfigured() || isSmsConfigured()) return 'code';
  return 'off';
}

export function logAdmin2faStatus(): void {
  const mode = admin2faMode();
  if (mode === 'code') {
    logger.info('Admin two-step login: ON (one-time code sent to the admin phone)');
  } else if (mode === 'bypass') {
    logger.warn('Admin two-step login: ON but OTP BYPASS is enabled — the fixed bypass code is accepted.');
  } else if (process.env.ADMIN_2FA_ENABLED === 'false') {
    logger.warn('Admin two-step login: OFF (ADMIN_2FA_ENABLED=false) — admins sign in with a password only.');
  } else {
    logger.warn('Admin two-step login: OFF — no OTP delivery channel is configured (WhatsApp Cloud API or SMS gateway). Admins sign in with a password only.');
  }
}
