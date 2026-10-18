import type { GuardrailId, GuardrailResult, GuardrailStatus } from "./types";

export const GUARDRAILS: { id: GuardrailId; label: string; rule: string }[] = [
  { id: "model_fallback", label: "Model health", rule: "If the model errors or stalls past 8 seconds, a deterministic interpreter answers instead. The caller never hears dead air." },
  { id: "field_validation", label: "Field validation", rule: "Phone, ZIP, name and service are re-parsed and checked in code. Values the model invents or mishears are dropped." },
  { id: "emergency", label: "Escalation", rule: "Emergency phrases and requests for a person trigger a live transfer. Keyword rules decide, not the model." },
  { id: "prompt_injection", label: "Instruction override", rule: "A caller trying to rewrite the agent's rules locks booking, discounts and texts for that turn." },
  { id: "pricing_authority", label: "Pricing authority", rule: "Prices come only from the client's price book. Discounts are impossible and wrong quotes are corrected." },
  { id: "service_area", label: "Service area", rule: "Jobs outside the client's ZIP list are refused politely, with a referral to a partner." },
  { id: "booking_integrity", label: "Booking integrity", rule: "A slot is booked only if it was offered, is open on the calendar, and every required detail is present." },
  { id: "outbound_sms", label: "Outbound texts", rule: "Only the confirmation template sends itself. Anything the model writes waits in a queue for a human." },
  { id: "reply_scan", label: "Reply scan", rule: "The model may add one short opener. It's dropped if it mentions money, offers or promises." },
];

const RANK: Record<GuardrailStatus, number> = { blocked: 3, corrected: 2, triggered: 1, pass: 0 };

/** Collapse a turn's results to one verdict per guardrail, worst status wins. */
export function summarize(results: GuardrailResult[]): Map<GuardrailId, { status: GuardrailStatus; details: string[] }> {
  const out = new Map<GuardrailId, { status: GuardrailStatus; details: string[] }>();
  for (const r of results) {
    const cur = out.get(r.id);
    if (!cur) out.set(r.id, { status: r.status, details: [r.detail] });
    else {
      cur.details.push(r.detail);
      if (RANK[r.status] > RANK[cur.status]) cur.status = r.status;
    }
  }
  return out;
}
