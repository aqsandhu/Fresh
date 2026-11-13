// ============================================================================
// CORRUPTION AUDIT — orchestration: evidence → AI → guard → stored run.
// A run is started by the super admin and finishes in the background (an AI
// call can take a minute or two; the page polls the run row).
// ============================================================================

import { query } from '../../config/database';
import logger from '../../utils/logger';
import { buildEvidence, renderPack, AuditPeriod } from './evidence';
import { buildResult, extractJson } from './scoring';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { auditAiReady, callAuditAi, getAuditAiConfig } from './aiClient';
import { AiRawOutput } from './types';

export interface StartAuditOptions extends AuditPeriod {
  useAi: boolean;
  createdBy: string | null;
}

/** Insert the run row and return its id; the work continues in the background. */
export async function startAudit(opts: StartAuditOptions): Promise<string> {
  const row = await query(
    `INSERT INTO corruption_audit_runs (period_from, period_to, city_id, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [opts.from, opts.to, opts.cityId, opts.createdBy]
  );
  const id: string = row.rows[0].id;
  // Not awaited on purpose.
  executeAudit(id, opts).catch((err) => logger.error('corruption audit crashed', { id, error: err?.message }));
  return id;
}

export async function executeAudit(id: string, opts: StartAuditOptions): Promise<void> {
  try {
    const built = await buildEvidence(opts);
    const cfg = await getAuditAiConfig();
    let ai: AiRawOutput | null = null;
    let aiNote: string | null = null;
    let aiUsed = false;

    if (!opts.useAi) {
      aiNote = 'Run without AI: the figures below come from the fixed rules only.';
    } else if (!auditAiReady(cfg)) {
      aiNote = cfg.keyUnreadable
        ? 'The saved API key can no longer be read (the server secret changed). Enter the key again in AI settings. Figures below come from the fixed rules only.'
        : 'AI is not set up yet (company, model name and API key). Figures below come from the fixed rules only.';
    } else if (built.pack.signals.length === 0) {
      aiNote = 'Nothing unusual was measured, so there was nothing to send to the AI.';
    } else {
      const system = buildSystemPrompt(cfg.language);
      const user = buildUserPrompt(renderPack(built, 'alias'));
      try {
        let text = await callAuditAi(cfg, system, user);
        ai = extractJson(text);
        if (!ai) {
          // One retry: some models wrap or truncate the JSON the first time.
          text = await callAuditAi(cfg, system, `${user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`);
          ai = extractJson(text);
        }
        if (ai) aiUsed = true;
        else aiNote = 'The AI answered, but not in the format asked for, twice. Figures below come from the fixed rules only.';
      } catch (err: any) {
        logger.warn('corruption audit: AI call failed', { id, provider: cfg.provider, error: err?.message });
        aiNote = `The AI could not be reached (${String(err?.message || 'error').slice(0, 200)}). Figures below come from the fixed rules only.`;
      }
    }

    const evidence = renderPack(built, 'name');
    const result = buildResult(evidence, ai, { aiNote, language: cfg.language });
    await query(
      `UPDATE corruption_audit_runs
          SET status = 'done', ai_used = $2, ai_provider = $3, ai_model = $4,
              evidence = $5, result = $6, finished_at = NOW()
        WHERE id = $1`,
      [id, aiUsed, aiUsed ? cfg.provider : null, aiUsed ? cfg.model : null, JSON.stringify(evidence), JSON.stringify(result)]
    );
    logger.info('corruption audit done', { id, signals: evidence.signals.length, aiUsed });
  } catch (err: any) {
    logger.error('corruption audit failed', { id, error: err?.message });
    await query(
      `UPDATE corruption_audit_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
      [id, String(err?.message || 'Unknown error').slice(0, 500)]
    ).catch(() => undefined);
  }
}

/** A run left "running" by a restart can never finish — close it honestly. */
export async function closeStaleAudits(): Promise<void> {
  await query(
    `UPDATE corruption_audit_runs
        SET status = 'failed', error = 'The server restarted while this audit was running. Run it again.', finished_at = NOW()
      WHERE status = 'running' AND created_at < NOW() - INTERVAL '15 minutes'`
  ).catch(() => undefined);
}
