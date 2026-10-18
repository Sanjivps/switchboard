import { bookingRef, findSlot, offerSlots } from "../availability";
import { inSentence, priceLine } from "../tenants";
import type {
  CallState,
  ExecutedAction,
  GuardrailResult,
  InterpreterKind,
  Proposal,
  Slot,
  Tenant,
  TurnResult,
} from "../types";
import { detectEmergency, detectInjection, formatPhone, maskPhone } from "./extract";
import { nextMissingField } from "./flow";
import { checkBooking, checkPricing, checkServiceArea, scanAcknowledgement, validateFields } from "./guardrails";
import { injectFaults, rulesInterpret, type Interpreter } from "./interpreters";

export const MODEL_TIMEOUT_MS = 8000;

export function newCall(tenant: Tenant): TurnResult {
  const reply = `Thanks for calling ${tenant.name}, this is ${tenant.agentName}, the virtual assistant. What can I help you with today?`;
  return {
    reply,
    trace: null,
    state: {
      tenantId: tenant.id,
      turn: 0,
      stage: "collecting",
      fields: {},
      offeredSlotIds: [],
      quoted: [],
      approvals: [],
      sentSms: [],
      transcript: [{ role: "agent", text: reply }],
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function firstName(name?: string): string {
  return name ? name.split(" ")[0] : "";
}

function serviceList(tenant: Tenant): string {
  const names = tenant.services.map((s) => inSentence(s.name));
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

function slotList(slots: Slot[]): string {
  return slots.map((s, i) => `${i + 1}) ${s.label}`).join(", ");
}

const SHORT_QUESTIONS: Record<string, string> = {
  serviceId: "What kind of job is it?",
  name: "Can I get your name?",
  zip: "What's the ZIP code for the job?",
  phone: "What's the best number to text your confirmation to?",
};

function questionFor(tenant: Tenant, state: CallState): string {
  const f = state.fields;
  const service = tenant.services.find((s) => s.id === f.serviceId);
  const field = nextMissingField(f);
  const repeat = field && state.lastAsked === field;
  state.lastAsked = field ?? undefined;
  if (repeat) return SHORT_QUESTIONS[field];
  switch (field) {
    case "serviceId":
      return `Which of these can we help with: ${serviceList(tenant)}?`;
    case "name":
      return `I can get someone out for ${service ? inSentence(service.name) : "that"}. Can I get your name?`;
    case "zip":
      return `Thanks${f.name ? `, ${firstName(f.name)}` : ""}. What's the ZIP code where you need the work done?`;
    case "phone":
      return `Great, we cover that area. What's the best number to text your confirmation to?`;
    default:
      return "";
  }
}

export interface RunTurnInput {
  tenant: Tenant;
  state: CallState;
  message: string;
  now: Date;
  interpreter: Interpreter;
  faultInjection?: boolean;
  timeoutMs?: number;
  /** Set when a usage cap means the model must not be called this turn. */
  limitedReason?: string;
}

export async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const { tenant, message, now, interpreter } = input;
  const started = Date.now();
  const state: CallState = structuredClone(input.state);
  state.turn += 1;
  state.transcript.push({ role: "caller", text: message });

  const guardrails: GuardrailResult[] = [];
  const executed: ExecutedAction[] = [];
  const parts: string[] = [];

  // Calls already handed off or closed get a fixed closing line.
  if (state.stage === "transferred" || state.stage === "declined") {
    const reply = state.stage === "transferred" ? "You're being connected now. Please stay on the line." : `Thanks again for calling ${tenant.name}. Take care!`;
    state.transcript.push({ role: "agent", text: reply });
    return { state, reply, trace: null };
  }

  const offered = state.offeredSlotIds.map((id) => findSlot(tenant, now, id)).filter((s): s is Slot => !!s);
  const interpretInput = { tenant, state: input.state, message, offered };

  // 1. Interpret. A model failure never takes the line down.
  let kind: InterpreterKind = interpreter.kind;
  let proposal: Proposal;
  if (input.limitedReason) {
    kind = "rules-fallback";
    proposal = rulesInterpret(interpretInput);
    guardrails.push({
      id: "model_fallback",
      label: "Model health",
      status: "corrected",
      detail: `Usage cap reached (${input.limitedReason}). Rules interpreter answered so the call carried on.`,
    });
  } else {
    try {
      proposal = await withTimeout(interpreter.run(interpretInput), input.timeoutMs ?? MODEL_TIMEOUT_MS);
      guardrails.push({
        id: "model_fallback",
        label: "Model health",
        status: "pass",
        detail: kind === "claude" ? "Claude returned a schema-valid proposal." : "Deterministic interpreter (no model call).",
      });
    } catch (err) {
      kind = "rules-fallback";
      proposal = rulesInterpret(interpretInput);
      guardrails.push({
        id: "model_fallback",
        label: "Model health",
        status: "corrected",
        detail: `Model call failed (${err instanceof Error ? err.message : "unknown error"}). Rules interpreter took over; the caller saw no gap.`,
      });
    }
  }
  if (input.faultInjection) proposal = injectFaults(proposal, interpretInput, now);

  // 2. Validate every field the model claims it heard.
  const fv = validateFields(tenant, proposal.fields);
  guardrails.push(fv.result);
  Object.assign(state.fields, fv.accepted);

  // 3. Escalation is decided by keyword rules, not by the model.
  const emergency = detectEmergency(tenant, message);
  const wantsHuman = proposal.intent === "human" || proposal.actions.some((a) => a.type === "transfer");
  if (emergency || wantsHuman) {
    guardrails.push({
      id: "emergency",
      label: "Escalation",
      status: "triggered",
      detail: emergency
        ? `Emergency phrase "${emergency}" detected. Live transfer to on-call tech; no booking flow.`
        : "Caller asked for a person. Live transfer.",
    });
    executed.push({ type: "transferred", to: tenant.transferNumber, reason: emergency ? `Emergency: ${emergency}` : "Caller request" });
    state.stage = "transferred";
    const reply = emergency
      ? `That sounds urgent, so I'm getting you to a person right now. Transferring you to our on-call tech at ${tenant.transferNumber}. If we get cut off, they'll call you right back.`
      : `Of course. Let me connect you with someone on the team. Transferring you to ${tenant.transferNumber} now.`;
    return finish(state, reply, { kind, proposal, guardrails, executed, started, fault: !!input.faultInjection });
  }
  guardrails.push({ id: "emergency", label: "Escalation", status: "pass", detail: "No emergency phrases; no request for a person." });

  // 4. Prompt injection locks every privileged action for this turn.
  const injection = detectInjection(message);
  const locked = !!injection;
  guardrails.push(
    injection
      ? {
          id: "prompt_injection",
          label: "Instruction override",
          status: "blocked",
          detail: `Caller text "${injection}" tried to override the agent. Treated as data; booking, discounts and texts locked this turn.`,
        }
      : { id: "prompt_injection", label: "Instruction override", status: "pass", detail: "No attempt to override instructions." },
  );

  // 5. Prices come only from the price book.
  const pricing = checkPricing(tenant, proposal.actions);
  guardrails.push(...pricing.results);
  // Read a price when the caller asks, or once per service when the model raises it.
  state.quoted ??= [];
  const askedPrice = proposal.intent === "price_question" || proposal.intent === "negotiate";
  const candidate = pricing.quoteServiceId ?? (askedPrice ? state.fields.serviceId ?? null : null);
  const quoteService = candidate && (askedPrice || !state.quoted.includes(candidate)) ? candidate : null;
  if (quoteService && !state.quoted.includes(quoteService)) state.quoted.push(quoteService);
  if (proposal.intent === "negotiate") {
    parts.push(
      quoteService ? `I'm not able to change our pricing. ${priceLine(tenant, quoteService)}.` : "I'm not able to change our pricing, but I can tell you what it is.",
    );
  } else if (quoteService) {
    parts.push(`${priceLine(tenant, quoteService)}.`);
  }
  if (quoteService) {
    executed.push({ type: "quoted", service: tenant.services.find((s) => s.id === quoteService)!.name, line: priceLine(tenant, quoteService) });
  }
  if (locked) parts.push("I can only help with scheduling and questions about our services.");

  // 6. Service area.
  const area = checkServiceArea(tenant, state.fields.zip);
  guardrails.push(area);
  if (area.status === "blocked") {
    state.stage = "declined";
    const reply = `Thanks for checking. Unfortunately ${state.fields.zip} is outside our service area. We cover ${tenant.serviceArea.label}. ${tenant.referral}`;
    return finish(state, reply, { kind, proposal, guardrails, executed, started, fault: !!input.faultInjection });
  }

  // 7. Booking: the model can ask; code checks the calendar and the details.
  const wasBooked = state.stage === "booked";
  const bookIds = proposal.actions.filter((a) => a.type === "book").map((a) => (a as { slotId: string }).slotId);
  const booking = checkBooking(tenant, state, state.fields, bookIds, now, locked);
  guardrails.push(...booking.results);

  // 8. Outbound texts: only the booking confirmation template sends itself.
  const smsResults: GuardrailResult[] = [];
  if (booking.slot) {
    const ref = bookingRef(tenant.id, booking.slot.id, state.fields.phone!);
    state.booking = { slotId: booking.slot.id, label: booking.slot.label, ref };
    state.stage = "booked";
    const body = `${tenant.name}: you're booked for ${booking.slot.label}. Ref ${ref}. Reply C to cancel.`;
    state.sentSms.push({ to: state.fields.phone!, body });
    executed.push({ type: "booked", slotLabel: booking.slot.label, ref });
    executed.push({ type: "sms_sent", to: maskPhone(state.fields.phone!), body });
    smsResults.push({ id: "outbound_sms", label: "Outbound texts", status: "pass", detail: "Booking confirmation sent from the approved template." });
  }
  for (const a of proposal.actions) {
    if (a.type !== "send_sms") continue;
    const to = state.fields.phone ? formatPhone(state.fields.phone) : "the caller (no number yet)";
    if (locked) {
      smsResults.push({ id: "outbound_sms", label: "Outbound texts", status: "blocked", detail: `Free-form text "${a.body}" dropped: turn is locked.` });
      continue;
    }
    state.approvals.push({ id: `apr_${state.turn}_${state.approvals.length}`, kind: "sms", to, body: a.body, reason: "Free-form text proposed by model" });
    executed.push({ type: "sms_held", to, body: a.body });
    smsResults.push({ id: "outbound_sms", label: "Outbound texts", status: "blocked", detail: `Model wanted to text "${a.body}". Held in the approval queue for a human.` });
  }
  if (proposal.intent === "request_text" && !locked) {
    const svc = quoteService ?? state.fields.serviceId;
    if (state.fields.phone && svc) {
      const body = `${tenant.name}: ${priceLine(tenant, svc)}. Call ${tenant.transferNumber} with questions.`;
      state.approvals.push({ id: `apr_${state.turn}_${state.approvals.length}`, kind: "sms", to: formatPhone(state.fields.phone), body, reason: "Caller asked for info by text" });
      executed.push({ type: "sms_held", to: maskPhone(state.fields.phone), body });
      smsResults.push({ id: "outbound_sms", label: "Outbound texts", status: "triggered", detail: "Caller asked for a text. Drafted from the price book and queued for staff approval." });
      parts.push("I've queued a text with those details, and someone on our team will send it shortly.");
    }
  }
  if (!smsResults.length) smsResults.push({ id: "outbound_sms", label: "Outbound texts", status: "pass", detail: "No texts this turn." });
  guardrails.push(...smsResults);

  // 9. The model may contribute one short opener; it's scanned before use.
  const scan = scanAcknowledgement(proposal.acknowledgement, locked);
  guardrails.push(scan.result);

  // 10. Compose the reply in code.
  if (booking.slot) {
    parts.push(
      `You're booked for ${booking.slot.label}. I just texted your confirmation, ${state.booking!.ref}, to ${maskPhone(state.fields.phone!)}. Is there anything else I can help with?`,
    );
  } else if (wasBooked) {
    if (!parts.length) {
      parts.push(
        /\b(no|nope|that's all|thats all|thank|thanks|bye)\b/i.test(message)
          ? `You're all set. Thanks for calling ${tenant.name}, and have a great day!`
          : `You're all set for ${state.booking!.label}, confirmation ${state.booking!.ref}. For changes, call us at ${tenant.transferNumber}.`,
      );
    }
  } else if (state.stage === "offering_slots") {
    const blocked = booking.results.some((r) => r.status === "blocked");
    const current = state.offeredSlotIds.map((id) => findSlot(tenant, now, id)).filter((s): s is Slot => !!s);
    if (nextMissingField(state.fields)) {
      parts.push(questionFor(tenant, state));
    } else {
      const askedForTime = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|morning|afternoon|evening|tonight|tomorrow|today|\d\s?(am|pm)\b/i.test(message);
      const lead = blocked && !locked ? "That time isn't available. " : askedForTime && !bookIds.length ? "I don't have that time open. " : "";
      parts.push(`${lead}${lead ? "The openings I have are" : "Which works best:"} ${slotList(current)}${lead ? ". Would one of those work?" : "?"}`);
    }
  } else {
    const q = questionFor(tenant, state);
    if (q) {
      parts.push(q);
    } else {
      const slots = offerSlots(tenant, now);
      state.offeredSlotIds = slots.map((s) => s.id);
      state.stage = "offering_slots";
      const svc = state.fields.serviceId!;
      if (!quoteService && !state.quoted.includes(svc)) {
        parts.push(`${priceLine(tenant, svc)}.`);
        state.quoted.push(svc);
      }
      parts.push(`The earliest openings are ${slotList(slots)}. Which works best?`);
    }
  }

  const reply = [scan.text, ...parts].filter(Boolean).join(" ");
  return finish(state, reply, { kind, proposal, guardrails, executed, started, fault: !!input.faultInjection });
}

function finish(
  state: CallState,
  reply: string,
  t: { kind: InterpreterKind; proposal: Proposal; guardrails: GuardrailResult[]; executed: ExecutedAction[]; started: number; fault: boolean },
): TurnResult {
  state.transcript.push({ role: "agent", text: reply });
  return {
    state,
    reply,
    trace: {
      interpreter: t.kind,
      proposal: t.proposal,
      faultInjected: t.fault,
      guardrails: t.guardrails,
      executed: t.executed,
      latencyMs: Date.now() - t.started,
    },
  };
}
