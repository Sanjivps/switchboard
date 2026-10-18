// Spend protection for the public demo. Model calls are rationed per visitor
// and per day; past a limit the turn is answered by the rules interpreter, so
// the demo keeps working and the API bill stays bounded.
//
// Counters live in memory, so on serverless each warm instance keeps its own.
// That's an approximate cap, and it's why the Anthropic Console spend limit
// should be set too.

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export const LIMITS = {
  /** Model calls one visitor can make per window. */
  perVisitor: num(process.env.SWITCHBOARD_MAX_CALLS_PER_VISITOR, 40),
  windowMs: 15 * 60_000,
  /** Model calls one demo call can make before it switches to rules. */
  perCall: num(process.env.SWITCHBOARD_MAX_TURNS_PER_CALL, 16),
  /** Model calls across all visitors per UTC day. */
  daily: num(process.env.SWITCHBOARD_DAILY_MODEL_CALLS, 1500),
};

const visitors = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export type Claim = { ok: true } | { ok: false; reason: string };

export function claimModelCall(visitor: string, turnInCall: number, now = Date.now()): Claim {
  if (turnInCall > LIMITS.perCall) {
    return { ok: false, reason: `this call passed ${LIMITS.perCall} model turns` };
  }
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= LIMITS.daily) {
    return { ok: false, reason: "the demo's daily model budget is used up" };
  }
  const recent = (visitors.get(visitor) ?? []).filter((t) => now - t < LIMITS.windowMs);
  if (recent.length >= LIMITS.perVisitor) {
    visitors.set(visitor, recent);
    return { ok: false, reason: `you've made ${LIMITS.perVisitor} model calls in 15 minutes` };
  }
  recent.push(now);
  visitors.set(visitor, recent);
  dayCount++;
  if (visitors.size > 5000) {
    // Drop the oldest entries so memory stays bounded.
    for (const key of [...visitors.keys()].slice(0, 1000)) visitors.delete(key);
  }
  return { ok: true };
}

/** For tests. */
export function resetUsage(): void {
  visitors.clear();
  day = "";
  dayCount = 0;
}
