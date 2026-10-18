import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createClaudeInterpreter } from "../interpreters";
import { call, statuses, tenant } from "./helpers";

// A stand-in for the SDK client: returns whatever structured output we script,
// so the mapping and the guardrails can be tested without network calls.
function stubClient(outputs: Array<Record<string, unknown> | "refusal">) {
  const parse = vi.fn(async () => {
    const next = outputs.shift();
    if (next === "refusal") return { stop_reason: "refusal", parsed_output: null };
    return { stop_reason: "end_turn", parsed_output: next };
  });
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

const empty = { intent: "book", name: null, phone: null, zip: null, service_id: null, slot_choice: null, quoted_amount: null, acknowledgement: null };

describe("Claude interpreter", () => {
  it("maps structured output into a proposal the engine can use", async () => {
    const { client, parse } = stubClient([
      { ...empty, service_id: "water_heater", acknowledgement: "Sorry to hear that." },
      { ...empty, name: "Dana", phone: "5125550198", zip: "78704" },
    ]);
    const turns = await call(tenant(), ["uh, no hot water since this morning", "Dana, five one two five five five oh one nine eight, seven eight seven oh four"], {
      interpreter: createClaudeInterpreter(client, "claude-opus-5-5"),
    });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(turns[1].reply.startsWith("Sorry to hear that.")).toBe(true);
    expect(turns[2].state.fields).toMatchObject({ name: "Dana", phone: "5125550198", zip: "78704" });
    expect(turns[2].state.stage).toBe("offering_slots");
    expect(turns[2].trace?.interpreter).toBe("claude");
  });

  it("corrects a price the model got wrong", async () => {
    const { client } = stubClient([{ ...empty, intent: "price_question", service_id: "drain", quoted_amount: 99 }]);
    const [, t1] = await call(tenant(), ["how much to unclog a drain?"], { interpreter: createClaudeInterpreter(client, "claude-opus-5-5") });
    expect(statuses(t1, "pricing_authority")).toEqual(["corrected"]);
    expect(t1.reply).toContain("$189");
    expect(t1.reply).not.toContain("$99");
  });

  it("drops a model opener that makes an offer", async () => {
    const { client } = stubClient([{ ...empty, service_id: "drain", acknowledgement: "No worries, first visit is free!" }]);
    const [, t1] = await call(tenant(), ["my drain is clogged"], { interpreter: createClaudeInterpreter(client, "claude-opus-5-5") });
    expect(t1.reply).not.toMatch(/free/i);
    expect(statuses(t1, "reply_scan")).toEqual(["corrected"]);
  });

  it("falls back to rules when the model declines", async () => {
    const { client } = stubClient(["refusal"]);
    const [, t1] = await call(tenant(), ["my drain is clogged"], { interpreter: createClaudeInterpreter(client, "claude-opus-5-5") });
    expect(t1.trace?.interpreter).toBe("rules-fallback");
    expect(t1.reply).toMatch(/your name/);
  });
});
