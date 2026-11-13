// ============================================================================
// CORRUPTION AUDIT — scoring guard (pure functions, unit-tested).
//
// The AI decides, but inside limits the evidence sets:
//   • a person with no signal can never be scored as a concern,
//   • weak signals alone can never produce a high figure,
//   • a high figure needs strong evidence, a very high one needs strong
//     evidence corroborated from a second, independent area,
//   • a verdict that cites a signal which does not exist (or belongs to
//     someone else) loses that citation, and a figure with no valid citation
//     falls back to the rule,
//   • thin data (short period / few events) lowers the stated confidence.
// Everything the guard changes is written into `adjustments` so the owner can
// see it.
// ============================================================================

import {
  AiRawOutput, AuditResult, Confidence, EvidencePack, PersonVerdict, Signal, Strength, Subject, SystemFinding,
} from './types';

const POINTS: Record<Strength, number> = { weak: 1, moderate: 3, strong: 6 };

/** Pick a strength from thresholds; null = not a signal at all. */
export function strengthOf(opts: {
  value: number;
  n: number;
  minN: number;
  weak: number;
  moderate: number;
  strong: number;
  /** Extra condition a level must satisfy (e.g. the pattern is one-directional). */
  moderateIf?: boolean;
  strongIf?: boolean;
}): Strength | null {
  const { value, n, minN, weak, moderate, strong } = opts;
  if (!(n >= minN) || !(value >= weak)) return null;
  if (value >= strong && opts.strongIf !== false) return 'strong';
  if (value >= moderate && opts.moderateIf !== false) return 'moderate';
  return 'weak';
}

export function bump(s: Strength): Strength {
  return s === 'weak' ? 'moderate' : 'strong';
}

/** Highest risk figure the evidence about one person can support. */
export function evidenceCeiling(signals: Signal[]): number {
  if (signals.length === 0) return 5;
  const strong = signals.filter((s) => s.strength === 'strong');
  const moderate = signals.filter((s) => s.strength === 'moderate');
  const solid = [...strong, ...moderate];
  const solidCategories = new Set(solid.map((s) => s.category));
  const strongCategories = new Set(strong.map((s) => s.category));

  if (strong.length >= 2 && strongCategories.size >= 2) return 95;
  if (strong.length >= 1 && solidCategories.size >= 2) return 85;
  if (strong.length >= 1) return 70;
  if (moderate.length >= 2 && solidCategories.size >= 2) return 65;
  if (moderate.length >= 2) return 55;
  if (moderate.length === 1) return 45;
  return signals.length >= 3 ? 25 : 20; // weak only
}

/** What the rule alone says, when the AI is unavailable (or as a cross-check). */
export function ruleScore(signals: Signal[]): number {
  if (signals.length === 0) return 2;
  const ceiling = evidenceCeiling(signals);
  const points = signals.reduce((a, s) => a + POINTS[s.strength], 0);
  // Fill between 55 % and 100 % of the ceiling as corroboration grows.
  const fill = Math.min(1, 0.55 + points * 0.05);
  return Math.round(ceiling * fill);
}

/** Lowest figure the AI may bring a person down to. Weak evidence has no floor. */
export function evidenceFloor(signals: Signal[]): number {
  const rule = ruleScore(signals);
  if (signals.some((s) => s.strength === 'strong')) return Math.round(rule * 0.5);
  if (signals.filter((s) => s.strength === 'moderate').length >= 2) return Math.round(rule * 0.4);
  if (signals.some((s) => s.strength === 'moderate')) return Math.round(rule * 0.25);
  return 0;
}

export function bandOf(percent: number): PersonVerdict['band'] {
  if (percent >= 80) return 'very_high';
  if (percent >= 60) return 'high';
  if (percent >= 35) return 'review';
  if (percent >= 15) return 'low';
  return 'none';
}

const CONF_ORDER: Confidence[] = ['low', 'medium', 'high'];
const minConfidence = (a: Confidence, b: Confidence): Confidence =>
  CONF_ORDER[Math.min(CONF_ORDER.indexOf(a), CONF_ORDER.indexOf(b))];

/** How sure the DATA allows anyone to be about this person. */
export function dataConfidence(signals: Signal[], periodDays: number): Confidence {
  const events = signals.reduce((a, s) => a + (Number(s.n) || 0), 0);
  if (signals.length === 0) return periodDays >= 7 ? 'medium' : 'low';
  if (periodDays < 7 || events < 8) return 'low';
  const solidCategories = new Set(signals.filter((s) => s.strength !== 'weak').map((s) => s.category));
  if (periodDays >= 21 && events >= 20 && solidCategories.size >= 2) return 'high';
  return 'medium';
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/** Pull the first JSON object out of a model reply (handles ``` fences). */
export function extractJson(text: string): AiRawOutput | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as AiRawOutput) : null;
  } catch {
    return null;
  }
}

function defaultReasoning(signals: Signal[]): string {
  if (signals.length === 0) return 'Nothing unusual was measured for this person in the period.';
  return signals
    .slice()
    .sort((a, b) => POINTS[b.strength] - POINTS[a.strength])
    .map((s) => `${s.title} (${s.strength}${s.amount ? `, about Rs. ${Math.round(s.amount).toLocaleString('en-PK')}` : ''})`)
    .join('; ') + '.';
}

/**
 * Turn the evidence (and the AI's reply, when there is one) into the final
 * verdicts. `ai` = null means "rule only".
 */
export function buildResult(
  pack: EvidencePack,
  ai: AiRawOutput | null,
  meta: { aiNote: string | null; language: string }
): AuditResult {
  const byAlias = new Map<string, Subject>();
  for (const s of pack.subjects) byAlias.set(s.alias.toUpperCase(), s);
  const signalsBySubject = new Map<string, Signal[]>();
  const signalById = new Map<string, Signal>();
  for (const sig of pack.signals) {
    signalById.set(sig.id.toUpperCase(), sig);
    const list = signalsBySubject.get(sig.subject) || [];
    list.push(sig);
    signalsBySubject.set(sig.subject, list);
  }

  const aiPeople = new Map<string, any>();
  if (ai && Array.isArray(ai.people)) {
    for (const p of ai.people as any[]) {
      const alias = str(p?.alias, 12).toUpperCase();
      if (alias && byAlias.has(alias) && !aiPeople.has(alias)) aiPeople.set(alias, p);
    }
  }

  const people: PersonVerdict[] = pack.subjects.map((subject) => {
    const own = signalsBySubject.get(subject.key) || [];
    const ceiling = evidenceCeiling(own);
    const rule = ruleScore(own);
    const adjustments: string[] = [];
    const raw = aiPeople.get(subject.alias.toUpperCase());

    let percent = rule;
    let aiPercent: number | null = null;
    let confidence = dataConfidence(own, pack.period.days);
    let reasoning = defaultReasoning(own);
    let innocent = Array.from(new Set(own.flatMap((s) => s.innocent))).slice(0, 6);
    let nextChecks: string[] = [];
    let cited = own.map((s) => s.id);

    if (raw) {
      const n = Number(raw.risk_percent);
      const citedRaw = strList(raw.signals_used, 40, 12).map((x) => x.toUpperCase());
      const valid = citedRaw.filter((id) => signalById.get(id)?.subject === subject.key);
      const invalid = citedRaw.filter((id) => !valid.includes(id));
      if (invalid.length) adjustments.push(`Ignored ${invalid.length} cited signal(s) that do not belong to this person.`);

      if (Number.isFinite(n)) {
        aiPercent = Math.max(0, Math.min(100, Math.round(n)));
        percent = aiPercent;
        if (percent > ceiling) {
          adjustments.push(`AI said ${aiPercent}% — lowered to ${ceiling}%, the most this evidence can support.`);
          percent = ceiling;
        }
        if (own.length > 0 && valid.length === 0 && percent > Math.min(rule, ceiling)) {
          adjustments.push('AI gave a figure without citing any of this person\'s signals — the rule figure is used.');
          percent = Math.min(rule, ceiling);
        }
        // The guard works downwards too. An AI that waves solid evidence away
        // (a weak model, or one talked round by text planted in the data) must
        // not be able to take a person off the owner's list: solid evidence
        // keeps a floor, and the disagreement is shown.
        const floor = evidenceFloor(own);
        if (percent < floor) {
          adjustments.push(`AI said ${aiPercent}% — kept at ${floor}%: the evidence is too solid to set aside on the AI's word alone. Read it yourself before closing it.`);
          percent = floor;
        } else if (own.some((s) => s.strength !== 'weak') && aiPercent < rule - 25) {
          adjustments.push(`AI rated this ${rule - aiPercent} points below the rule figure (${rule}%). Read the evidence yourself before closing it.`);
        }
      }
      const aiConf = str(raw.confidence, 10).toLowerCase() as Confidence;
      if (CONF_ORDER.includes(aiConf)) confidence = minConfidence(confidence, aiConf);
      reasoning = str(raw.reasoning, 1200) || reasoning;
      const aiInnocent = strList(raw.innocent_explanations, 6, 300);
      if (aiInnocent.length) innocent = aiInnocent;
      nextChecks = strList(raw.next_checks, 6, 300);
      if (valid.length) cited = valid.map((id) => signalById.get(id)!.id);
    }

    return {
      key: subject.key,
      alias: subject.alias,
      name: subject.name,
      type: subject.type,
      role: subject.role,
      isOwner: subject.isOwner,
      riskPercent: percent,
      ruleScore: rule,
      ceiling,
      aiPercent,
      band: bandOf(percent),
      confidence,
      signalIds: cited,
      reasoning,
      innocentExplanations: innocent,
      nextChecks,
      adjustments,
      amountAtStake: Math.round(own.reduce((a, s) => a + (s.amount || 0), 0)),
    };
  });

  people.sort((a, b) => b.riskPercent - a.riskPercent || b.amountAtStake - a.amountAtStake);

  // System findings: the deterministic ones always stay; the AI may add its own.
  const systemFindings: SystemFinding[] = [...pack.systemFindings];
  if (ai && Array.isArray(ai.system_findings)) {
    for (const f of (ai.system_findings as any[]).slice(0, 10)) {
      const title = str(f?.title, 160);
      const detail = str(f?.detail, 800);
      if (!title || !detail) continue;
      const sev = str(f?.severity, 10).toLowerCase();
      systemFindings.push({
        code: 'ai_observation',
        title,
        detail,
        severity: sev === 'high' || sev === 'medium' ? sev : 'low',
        amount: 0,
      });
    }
  }

  // Collusion pairs: both people must exist and at least one cited signal
  // must belong to one of them — otherwise the pair is dropped.
  const collusion: AuditResult['collusion'] = [];
  if (ai && Array.isArray(ai.collusion_pairs)) {
    for (const c of (ai.collusion_pairs as any[]).slice(0, 8)) {
      const aliases = strList(c?.aliases, 4, 12).map((a) => a.toUpperCase()).filter((a) => byAlias.has(a));
      if (new Set(aliases).size < 2) continue;
      const keys = new Set(aliases.map((a) => byAlias.get(a)!.key));
      const ids = strList(c?.signals_used, 20, 12)
        .map((x) => x.toUpperCase())
        .filter((id) => keys.has(signalById.get(id)?.subject || ''));
      const reasoning = str(c?.reasoning, 800);
      if (!ids.length || !reasoning) continue;
      collusion.push({
        aliases: aliases.map((a) => byAlias.get(a)!.alias),
        names: aliases.map((a) => byAlias.get(a)!.name),
        reasoning,
        signalIds: ids.map((id) => signalById.get(id)!.id),
      });
    }
  }

  const flagged = people.filter((p) => p.riskPercent >= 35).length;
  const fallbackSummary = flagged
    ? `${flagged} person(s) show a pattern that needs a closer look in this period. Open each one to see the evidence.`
    : 'No person shows a pattern that needs investigating in this period, on the data available.';

  return {
    summary: (ai && str(ai.summary, 1500)) || fallbackSummary,
    people,
    systemFindings,
    collusion,
    dataGaps: pack.dataGaps,
    aiUsed: Boolean(ai),
    aiNote: meta.aiNote,
    language: meta.language,
  };
}
