// ============================================================================
// AI CHAT SERVICE — provider-agnostic customer-care assistant
// ----------------------------------------------------------------------------
// Activates automatically once a super admin sets an API key (env or settings).
// The key NEVER leaves the server. Replies are short + low-token to bound cost.
// Split by job (W21): context (what the assistant may say), replyGuard (checks
// on what it said), reply (config + provider call). Callers import from here.
// ============================================================================

export { buildContext } from './aiChat/context';
export { getAiConfig, aiEnabled, generateReply } from './aiChat/reply';
export { AI_KEYS } from './aiChat/shared';
export type { ChatRole, ChatMessage, ChatContextOpts } from './aiChat/shared';
