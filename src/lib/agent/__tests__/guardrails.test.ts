import { describe, expect, it } from "vitest";
import { getSlots, offerSlots } from "../../availability";
import type { CallState } from "../../types";
import { checkBooking, checkPricing, checkServiceArea, scanAcknowledgement, validateFields } from "../guardrails";
import { NOW, tenant } from "./helpers";

const t = tenant("brightwater");
const fullFields = { serviceId: "drain", name: "Dana", zip: "78704", phone: "5125550198" };

function offering(): CallState {
  return {
    tenantId: t.id,
    turn: 4,
    stage: "offering_slots",
    fields: fullFields,
    offeredSlotIds: offerSlots(t, NOW).map((s) => s.id),
    quoted: [],
    approvals: [],
    sentSms: [],
    transcript: [],
  };
}

describe("field validation", () => {
  it("drops values a model made up or misheard", () => {
    const v = validateFields(t, { phone: "555-0100", zip: "9021", serviceId: "roof_repair", name: "Dana" });
    expect(v.accepted).toEqual({ name: "Dana" });
    expect(v.result.status).toBe("corrected");
  });
  it("normalises valid values", () => {
    const v = validateFields(t, { phone: "+1 (512) 555-0198", zip: "78704", serviceId: "drain" });
    expect(v.accepted).toEqual({ phone: "5125550198", zip: "78704", serviceId: "drain" });
    expect(v.result.status).toBe("pass");
  });
});

describe("pricing authority", () => {
  it("blocks any discount", () => {
    const v = checkPricing(t, [{ type: "discount", pct: 10 }]);
    expect(v.results[0].status).toBe("blocked");
  });
  it("corrects a quote that doesn't match the price book", () => {
    const v = checkPricing(t, [{ type: "quote", serviceId: "drain", amount: 49 }]);
    expect(v.results[0].status).toBe("corrected");
    expect(v.quoteServiceId).toBe("drain");
  });
  it("passes a quote that matches", () => {
    expect(checkPricing(t, [{ type: "quote", serviceId: "drain", amount: 189 }]).results[0].status).toBe("pass");
  });
  it("blocks quotes for services the business doesn't offer", () => {
    const v = checkPricing(t, [{ type: "quote", serviceId: "roofing", amount: 300 }]);
    expect(v.results[0].status).toBe("blocked");
    expect(v.quoteServiceId).toBeNull();
  });
});

describe("service area", () => {
  it("allows covered ZIPs and blocks the rest", () => {
    expect(checkServiceArea(t, "78704").status).toBe("pass");
    expect(checkServiceArea(t, "78758").status).toBe("blocked");
    expect(checkServiceArea(t, undefined).status).toBe("pass");
  });
});

describe("booking integrity", () => {
  it("books an offered, open slot", () => {
    const state = offering();
    const v = checkBooking(t, state, state.fields, [state.offeredSlotIds[0]], NOW, false);
    expect(v.slot?.id).toBe(state.offeredSlotIds[0]);
  });
  it("refuses a slot that is already taken", () => {
    const taken = getSlots(t, NOW).find((s) => !s.available)!;
    const v = checkBooking(t, offering(), fullFields, [taken.id], NOW, false);
    expect(v.slot).toBeNull();
    expect(v.results[0].detail).toMatch(/Double-booking/);
  });
  it("refuses a slot that was never offered", () => {
    const state = offering();
    const notOffered = getSlots(t, NOW).filter((s) => s.available && !state.offeredSlotIds.includes(s.id))[0];
    expect(checkBooking(t, state, fullFields, [notOffered.id], NOW, false).slot).toBeNull();
  });
  it("refuses to book with missing details", () => {
    const state = offering();
    const v = checkBooking(t, state, { ...fullFields, phone: undefined }, [state.offeredSlotIds[0]], NOW, false);
    expect(v.slot).toBeNull();
    expect(v.results[0].detail).toMatch(/callback number/);
  });
  it("refuses everything when the turn is locked", () => {
    const state = offering();
    expect(checkBooking(t, state, state.fields, [state.offeredSlotIds[0]], NOW, true).slot).toBeNull();
  });
  it("refuses to book before times were offered", () => {
    const state = { ...offering(), stage: "collecting" as const };
    expect(checkBooking(t, state, state.fields, [state.offeredSlotIds[0]], NOW, false).slot).toBeNull();
  });
});

describe("reply scan", () => {
  it("keeps a clean opener", () => {
    expect(scanAcknowledgement("Sorry to hear that.", false).text).toBe("Sorry to hear that.");
  });
  it.each(["I can waive the fee!", "We'll do it for $50.", "Free of charge today", "I guarantee it'll be fixed", "10% off for you"])(
    "drops %s",
    (ack) => {
      expect(scanAcknowledgement(ack, false).text).toBeNull();
    },
  );
  it("drops everything on a locked turn", () => {
    expect(scanAcknowledgement("Sorry to hear that.", true).text).toBeNull();
  });
});
