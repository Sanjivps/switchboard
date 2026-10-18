import type { ServiceDef, Slot, Tenant } from "../types";

// Deterministic parsers. The rules interpreter uses them directly, and the
// guardrails use them to re-validate anything a model claims to have heard.

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (/^[01]/.test(ten) || /^[01]/.test(ten.slice(3))) return null;
  return ten;
}

export function formatPhone(ten: string): string {
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function maskPhone(ten: string): string {
  return `(${ten.slice(0, 3)}) •••-${ten.slice(6)}`;
}

export function extractZip(text: string): string | null {
  const withoutPhone = text.replace(PHONE_RE, " ");
  const m = withoutPhone.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export function matchService(tenant: Tenant, text: string): ServiceDef | null {
  const lower = text.toLowerCase();
  let best: { service: ServiceDef; len: number } | null = null;
  for (const service of tenant.services) {
    for (const kw of service.keywords) {
      const re = new RegExp(`(^|[^a-z])${escapeRe(kw)}([^a-z]|$)`);
      if (re.test(lower) && (!best || kw.length > best.len)) {
        best = { service, len: kw.length };
      }
    }
  }
  return best?.service ?? null;
}

const NAME_STOPWORDS = new Set([
  "a", "an", "the", "having", "calling", "looking", "trying", "not", "so", "just", "in", "at",
  "out", "interested", "wondering", "getting", "from", "with", "on", "here", "sure", "good",
  "fine", "ok", "okay", "available", "urgent", "about", "my", "yes", "yeah", "no", "nope",
  "hi", "hello", "hey", "thanks", "thank", "you", "need", "want", "free", "is", "it", "still",
  "home", "sorry", "kind", "really", "very", "pretty", "going", "gonna", "that", "this", "what",
  "how", "much", "can", "could", "would", "please", "tomorrow", "today", "morning", "afternoon",
  "first", "second", "third", "one", "two", "three", "works", "ignore", "pretend",
]);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function takeNameWords(raw: string): string | null {
  const words: string[] = [];
  for (const w of raw.split(/\s+/)) {
    const clean = w.replace(/[^a-zA-Z'-]/g, "");
    if (!clean || NAME_STOPWORDS.has(clean.toLowerCase())) break;
    words.push(clean);
    if (words.length === 2) break;
  }
  return words.length ? titleCase(words.join(" ")) : null;
}

export function extractName(text: string, expectingName: boolean): string | null {
  const explicit = text.match(/\b(?:my name is|my name's|name is|name's|this is|i'm|i am|it's)\s+([a-zA-Z' -]{2,40})/i);
  if (explicit) {
    const name = takeNameWords(explicit[1]);
    if (name) return name;
  }
  if (expectingName) {
    const trimmed = text.trim().replace(/[.!,]+$/, "");
    if (/^[a-zA-Z' -]{2,40}$/.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
      return takeNameWords(trimmed);
    }
  }
  return null;
}

export function isValidName(name: string): boolean {
  return /^[A-Za-z][A-Za-z' -]{1,39}$/.test(name.trim()) && !NAME_STOPWORDS.has(name.trim().toLowerCase());
}

// Ordinal words win over bare numbers, so "the last one" means 3, not 1.
const ORDINALS: [RegExp, number][] = [
  [/\b(first|earliest|soonest)\b/, 1],
  [/\b(second|middle)\b/, 2],
  [/\b(third|last|latest)\b/, 3],
  [/\b(1|one)\b/, 1],
  [/\b(2|two)\b/, 2],
  [/\b(3|three)\b/, 3],
];

const WEEKDAYS: Record<string, string> = {
  monday: "Mon", mon: "Mon", tuesday: "Tue", tue: "Tue", tues: "Tue", wednesday: "Wed", wed: "Wed",
  thursday: "Thu", thu: "Thu", thurs: "Thu", friday: "Fri", fri: "Fri", saturday: "Sat", sat: "Sat",
};

export function extractSlotChoice(text: string, offered: Slot[]): number | null {
  if (!offered.length) return null;
  const lower = text.toLowerCase();
  if (extractPhone(text) || extractZip(text)) return null;

  const day = Object.keys(WEEKDAYS).find((d) => new RegExp(`\\b${d}\\b`).test(lower));
  const wantsMorning = /\bmorning\b|\bam\b|early/.test(lower);
  const wantsAfternoon = /\bafternoon\b|\bpm\b|later in the day/.test(lower);
  if (day || wantsMorning || wantsAfternoon) {
    const idx = offered.findIndex(
      (s) =>
        (!day || s.label.startsWith(WEEKDAYS[day])) &&
        (!wantsMorning || s.window.endsWith("am") || s.window.includes("am–")) &&
        (!wantsAfternoon || (s.window.endsWith("pm") && !s.window.includes("am"))),
    );
    if (idx >= 0) return idx + 1;
  }
  for (const [re, n] of ORDINALS) {
    if (re.test(lower) && n <= offered.length) return n;
  }
  return null;
}

export const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |any |your |the |previous |prior |above )*(?:instructions|rules|prompts?|guidelines)/i,
  /system prompt/i,
  /\byou are now\b/i,
  /developer mode/i,
  /new instructions/i,
  /pretend (?:you|to be)/i,
  /\bact as (?:a|an|my)\b/i,
  /disregard (?:your|the|all)/i,
];

export function detectInjection(text: string): string | null {
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function detectEmergency(tenant: Tenant, text: string): string | null {
  const lower = text.toLowerCase();
  return tenant.emergencyKeywords.find((kw) => lower.includes(kw)) ?? null;
}

export const PRICE_PROMISE_RE =
  /\$|\d|%|\bfree\b|discount|waive|guarantee|promise|refund|\bdeal\b|coupon|\boff\b|cheaper|no charge/i;
