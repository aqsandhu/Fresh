// ============================================================================
// CORRUPTION AUDIT — shared types.
//
// The audit has two halves on purpose:
//   1. EVIDENCE (deterministic): SQL over the books for one period turns into
//      "signals" — a measured fact about one person, with its sample size, the
//      money involved, what peers did and concrete examples.
//   2. JUDGEMENT (AI): the model reads the signals and decides how much each
//      person's pattern needs investigating, and explains why.
// The AI never sees a raw table and can never invent a fact: every verdict
// must cite signal ids, and the percentage it gives is capped by what the
// evidence can support (see scoring.ts). That is the guard against a fake
// score landing on an honest person.
// ============================================================================

export type SubjectType = 'admin' | 'rider' | 'ocp';
export type Strength = 'weak' | 'moderate' | 'strong';
export type Confidence = 'low' | 'medium' | 'high';
export type SignalCategory = 'stock' | 'cash' | 'pricing' | 'expenses' | 'process' | 'delivery';

export interface Signal {
  /** Stable within one run: S1, S2 … (what the AI cites). */
  id: string;
  code: string;
  title: string;
  category: SignalCategory;
  /** Subject key, e.g. "admin:<uuid>". */
  subject: string;
  strength: Strength;
  /** Rupees involved (0 when the signal is not about money). */
  amount: number;
  /** Number of underlying events — the sample size. */
  n: number;
  /** Measured numbers behind the signal (all numbers/booleans/short strings). */
  facts: Record<string, number | string | boolean | null>;
  /** A few concrete rows (order numbers, dates, amounts) the owner can open. */
  examples: string[];
  /** Honest reasons this pattern can happen without any wrongdoing. */
  innocent: string[];
}

export interface Subject {
  key: string;
  type: SubjectType;
  id: string;
  name: string;
  /** Alias sent to the AI instead of the name (A1, R2, O1 …). */
  alias: string;
  role: string;
  isOwner: boolean;
  /** How much this person did in the period — the denominator for fairness. */
  activity: Record<string, number>;
}

export interface SystemFinding {
  code: string;
  title: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
  amount: number;
}

export interface EvidencePack {
  period: { from: string; to: string; days: number; cityId: string | null; cityName: string | null };
  generatedAt: string;
  totals: Record<string, number>;
  subjects: Subject[];
  signals: Signal[];
  systemFindings: SystemFinding[];
  /** Data that was missing or too thin to judge — stated, never guessed. */
  dataGaps: string[];
  /** Peer baselines the signals were measured against. */
  baselines: Record<string, number | null>;
}

export interface PersonVerdict {
  key: string;
  alias: string;
  name: string;
  type: SubjectType;
  role: string;
  isOwner: boolean;
  /** Final figure shown to the owner (AI figure after the evidence cap). */
  riskPercent: number;
  /** What the rule alone gives — shown next to the AI figure. */
  ruleScore: number;
  /** Highest figure the evidence can support. */
  ceiling: number;
  /** Raw figure the AI returned (null when the AI was not used). */
  aiPercent: number | null;
  band: 'none' | 'low' | 'review' | 'high' | 'very_high';
  confidence: Confidence;
  signalIds: string[];
  reasoning: string;
  innocentExplanations: string[];
  nextChecks: string[];
  /** Why the AI figure was changed, when it was. */
  adjustments: string[];
  amountAtStake: number;
}

export interface AuditResult {
  summary: string;
  people: PersonVerdict[];
  systemFindings: SystemFinding[];
  collusion: { names: string[]; aliases: string[]; reasoning: string; signalIds: string[] }[];
  dataGaps: string[];
  aiUsed: boolean;
  aiNote: string | null;
  language: string;
}

/** Shape the AI is asked to return (validated in scoring.ts). */
export interface AiRawOutput {
  summary?: unknown;
  people?: unknown;
  system_findings?: unknown;
  collusion_pairs?: unknown;
}
