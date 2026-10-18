import { findSlot } from "../availability";
import { priceLine } from "../tenants";
import type { CallState, ExtractedFields, GuardrailResult, ProposedAction, Slot, Tenant } from "../types";
import { formatPhone, isValidName, normalizePhone, PRICE_PROMISE_RE } from "./extract";
import { FIELD_LABELS, missingFields } from "./flow";

// Each guardrail is a pure function: proposal in, verdict out. None of them
// trust the model, and all of them are covered by tests in __tests__/.

export interface FieldVerdict {
  accepted: Partial<CallState["fields"]>;
  result: GuardrailResult;
}

export function validateFields(tenant: Tenant, fields: ExtractedFields): FieldVerdict {
  const accepted: Partial<CallState["fields"]> = {};
  const rejected: string[] = [];

  if (fields.name) {
    const name = fields.name.trim();
    if (isValidName(name)) accepted.name = name;
    else rejected.push(`name "${name}" doesn't look like a name`);
  }
  if (fields.phone) {
    const phone = normalizePhone(fields.phone);
    if (phone) accepted.phone = phone;
    else rejected.push(`phone "${fields.phone}" isn't a valid 10-digit US number`);
  }
  if (fields.zip) {
    if (/^\d{5}$/.test(fields.zip)) accepted.zip = fields.zip;
    else rejected.push(`ZIP "${fields.zip}" isn't 5 digits`);
  }
  if (fields.serviceId) {
    if (tenant.services.some((s) => s.id === fields.serviceId)) accepted.serviceId = fields.serviceId;
    else rejected.push(`service "${fields.serviceId}" isn't in the service catalog`);
  }

  const got = Object.entries(accepted).map(([k, v]) =>
    k === "phone" ? `phone ${formatPhone(v as string)}` : `${k === "serviceId" ? "service" : k} ${v}`,
  );
  return {
    accepted,
    result: rejected.length
      ? {
          id: "field_validation",
          label: "Field validation",
          status: "corrected",
          detail: `Dropped ${rejected.join("; ")}.${got.length ? ` Kept ${got.join(", ")}.` : ""}`,
        }
      : {
          id: "field_validation",
          label: "Field validation",
          status: "pass",
          detail: got.length ? `Validated ${got.join(", ")}.` : "No new details this turn.",
        },
  };
}

export interface PricingVerdict {
  results: GuardrailResult[];
  /** Service whose price-book line should be read to the caller, if any. */
  quoteServiceId: string | null;
}

export function checkPricing(tenant: Tenant, actions: ProposedAction[]): PricingVerdict {
  const results: GuardrailResult[] = [];
  let quoteServiceId: string | null = null;

  for (const a of actions) {
    if (a.type === "discount") {
      results.push({
        id: "pricing_authority",
        label: "Pricing authority",
        status: "blocked",
        detail: `Model offered a ${a.pct}% discount. The agent has no authority to discount; policy maximum is 0%.`,
      });
    }
    if (a.type === "quote") {
      const service = tenant.services.find((s) => s.id === a.serviceId);
      if (!service) {
        results.push({
          id: "pricing_authority",
          label: "Pricing authority",
          status: "blocked",
          detail: `Model quoted $${a.amount} for unknown service "${a.serviceId}".`,
        });
        continue;
      }
      quoteServiceId = service.id;
      if (a.amount !== service.pricing.amount) {
        results.push({
          id: "pricing_authority",
          label: "Pricing authority",
          status: "corrected",
          detail: `Model quoted $${a.amount} for ${service.name}; price book says $${service.pricing.amount}. Read the price-book line instead.`,
        });
      } else {
        results.push({
          id: "pricing_authority",
          label: "Pricing authority",
          status: "pass",
          detail: `Quote matches price book: "${priceLine(tenant, service.id)}."`,
        });
      }
    }
  }
  if (!results.length) {
    results.push({ id: "pricing_authority", label: "Pricing authority", status: "pass", detail: "No price stated or offered this turn." });
  }
  return { results, quoteServiceId };
}

export function checkServiceArea(tenant: Tenant, zip: string | undefined): GuardrailResult {
  if (!zip) {
    return { id: "service_area", label: "Service area", status: "pass", detail: "No ZIP yet. Booking stays locked until one is verified." };
  }
  if (tenant.serviceArea.zips.includes(zip)) {
    return { id: "service_area", label: "Service area", status: "pass", detail: `${zip} is inside ${tenant.serviceArea.label}.` };
  }
  return {
    id: "service_area",
    label: "Service area",
    status: "blocked",
    detail: `${zip} is outside ${tenant.serviceArea.label}. Booking disabled; caller given a referral.`,
  };
}

export interface BookingVerdict {
  results: GuardrailResult[];
  slot: Slot | null;
}

export function checkBooking(
  tenant: Tenant,
  state: CallState,
  fields: CallState["fields"],
  slotIds: string[],
  now: Date,
  locked: boolean,
): BookingVerdict {
  const results: GuardrailResult[] = [];
  let slot: Slot | null = null;

  for (const slotId of slotIds) {
    const candidate = findSlot(tenant, now, slotId);
    const label = candidate?.label ?? slotId;
    const missing = missingFields(fields);
    let reason: string | null = null;

    if (locked) reason = `Booking ${label} refused: privileged actions are locked after an instruction-override attempt.`;
    else if (state.stage !== "offering_slots") reason = `Model tried to book ${label} before the caller was offered times.`;
    else if (missing.length) reason = `Can't book yet. Missing ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`;
    else if (!candidate) reason = `Slot "${slotId}" doesn't exist on the calendar.`;
    else if (!candidate.available) reason = `${label} is already booked. Double-booking prevented.`;
    else if (!state.offeredSlotIds.includes(slotId)) reason = `${label} wasn't one of the times offered to this caller.`;

    if (reason) {
      results.push({ id: "booking_integrity", label: "Booking integrity", status: "blocked", detail: reason });
    } else if (!slot && candidate) {
      slot = candidate;
      results.push({
        id: "booking_integrity",
        label: "Booking integrity",
        status: "pass",
        detail: `${label} confirmed open on the calendar, all required details present. Booked.`,
      });
    }
  }
  if (!results.length) {
    results.push({ id: "booking_integrity", label: "Booking integrity", status: "pass", detail: "No booking attempted this turn." });
  }
  return { results, slot };
}

export function scanAcknowledgement(ack: string | null, locked: boolean): { text: string | null; result: GuardrailResult } {
  if (!ack) {
    return { text: null, result: { id: "reply_scan", label: "Reply scan", status: "pass", detail: "Reply written entirely from approved templates." } };
  }
  const clean = ack.trim();
  if (locked || PRICE_PROMISE_RE.test(clean) || clean.length > 120) {
    return {
      text: null,
      result: {
        id: "reply_scan",
        label: "Reply scan",
        status: "corrected",
        detail: `Removed model phrase "${clean}" because it ${
          locked ? "came from a turn with an override attempt" : clean.length > 120 ? "was too long" : "makes a price or offer claim"
        }.`,
      },
    };
  }
  return { text: clean, result: { id: "reply_scan", label: "Reply scan", status: "pass", detail: `Model opener "${clean}" is clean; everything else from templates.` } };
}
