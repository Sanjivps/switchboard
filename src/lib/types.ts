// Core domain types shared by the agent engine, the API route and the UI.

export type Pricing =
  | { kind: "flat"; amount: number }
  | { kind: "diagnostic"; amount: number; note: string };

export interface ServiceDef {
  id: string;
  name: string;
  /** Lowercase phrases a caller might use for this service. */
  keywords: string[];
  pricing: Pricing;
  /** Average invoice for this job type, used for revenue reporting only. */
  avgTicket: number;
}

export interface Tenant {
  id: string;
  name: string;
  trade: string;
  city: string;
  agentName: string;
  accent: string;
  transferNumber: string;
  serviceArea: { label: string; zips: string[] };
  referral: string;
  services: ServiceDef[];
  /** Phrases that force an immediate live transfer, checked in code. */
  emergencyKeywords: string[];
}

export interface Slot {
  id: string;
  date: string; // YYYY-MM-DD
  window: string; // e.g. "8–10am"
  label: string; // e.g. "Tue Oct 20, 8–10am"
  available: boolean;
}

export type Intent =
  | "book"
  | "price_question"
  | "negotiate"
  | "request_text"
  | "human"
  | "question"
  | "other";

export interface ExtractedFields {
  name?: string | null;
  phone?: string | null;
  zip?: string | null;
  serviceId?: string | null;
  /** 1-based index into the slots the agent offered. */
  slotChoice?: number | null;
}

/** Things the model is allowed to *propose*. Code decides what runs. */
export type ProposedAction =
  | { type: "quote"; serviceId: string; amount: number }
  | { type: "discount"; pct: number }
  | { type: "book"; slotId: string }
  | { type: "transfer"; reason: string }
  | { type: "send_sms"; body: string };

export interface Proposal {
  intent: Intent;
  fields: ExtractedFields;
  /** Short empathetic phrase the model may prepend to the code-written reply. */
  acknowledgement: string | null;
  actions: ProposedAction[];
}

export type Stage =
  | "collecting"
  | "offering_slots"
  | "booked"
  | "transferred"
  | "declined";

export interface PendingApproval {
  id: string;
  kind: "sms";
  to: string;
  body: string;
  reason: string;
}

export interface TranscriptLine {
  role: "caller" | "agent";
  text: string;
}

export interface CallState {
  tenantId: string;
  turn: number;
  stage: Stage;
  fields: {
    name?: string;
    phone?: string;
    zip?: string;
    serviceId?: string;
  };
  offeredSlotIds: string[];
  /** Services whose price has already been read to the caller. */
  quoted: string[];
  /** The detail the agent asked for last turn, to avoid repeating itself. */
  lastAsked?: string;
  booking?: { slotId: string; label: string; ref: string };
  approvals: PendingApproval[];
  sentSms: { to: string; body: string }[];
  transcript: TranscriptLine[];
}

export type GuardrailId =
  | "model_fallback"
  | "field_validation"
  | "emergency"
  | "prompt_injection"
  | "pricing_authority"
  | "service_area"
  | "booking_integrity"
  | "outbound_sms"
  | "reply_scan";

export type GuardrailStatus = "pass" | "triggered" | "blocked" | "corrected";

export interface GuardrailResult {
  id: GuardrailId;
  label: string;
  status: GuardrailStatus;
  detail: string;
}

export type ExecutedAction =
  | { type: "booked"; slotLabel: string; ref: string }
  | { type: "transferred"; to: string; reason: string }
  | { type: "sms_sent"; to: string; body: string }
  | { type: "sms_held"; to: string; body: string }
  | { type: "quoted"; service: string; line: string };

export type InterpreterKind = "claude" | "rules" | "rules-fallback";

export interface TurnTrace {
  interpreter: InterpreterKind;
  proposal: Proposal;
  faultInjected: boolean;
  guardrails: GuardrailResult[];
  executed: ExecutedAction[];
  latencyMs: number;
}

export interface TurnResult {
  state: CallState;
  reply: string;
  trace: TurnTrace | null;
}
