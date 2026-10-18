import { beforeEach, describe, expect, it } from "vitest";
import { claimModelCall, LIMITS, resetUsage } from "../../usage-guard";
import { call, statuses, tenant } from "./helpers";
import { rulesInterpreter } from "../interpreters";
import { newCall, runTurn } from "../engine";

beforeEach(() => resetUsage());

describe("usage guard", () => {
  it("rations calls per visitor within the window", () => {
    const t0 = Date.UTC(2026, 9, 19, 12);
    for (let i = 0; i < LIMITS.perVisitor; i++) expect(claimModelCall("1.2.3.4", 1, t0 + i).ok).toBe(true);
    expect(claimModelCall("1.2.3.4", 1, t0 + 100).ok).toBe(false);
    expect(claimModelCall("5.6.7.8", 1, t0 + 100).ok).toBe(true);
    expect(claimModelCall("1.2.3.4", 1, t0 + LIMITS.windowMs + 1000).ok).toBe(true);
  });

  it("caps model turns within a single call", () => {
    expect(claimModelCall("a", LIMITS.perCall).ok).toBe(true);
    expect(claimModelCall("a", LIMITS.perCall + 1).ok).toBe(false);
  });

  it("enforces the daily budget across visitors", () => {
    const t0 = Date.UTC(2026, 9, 19, 12);
    for (let i = 0; i < LIMITS.daily; i++) claimModelCall(`v${i}`, 1, t0);
    expect(claimModelCall("new", 1, t0).ok).toBe(false);
    expect(claimModelCall("new", 1, t0 + 86_400_000).ok).toBe(true);
  });

  it("keeps the call going on the rules interpreter when capped", async () => {
    const t = tenant();
    const r = await runTurn({ tenant: t, state: newCall(t).state, message: "my drain is clogged", now: new Date(), interpreter: rulesInterpreter, limitedReason: "test cap" });
    expect(r.trace?.interpreter).toBe("rules-fallback");
    expect(statuses(r, "model_fallback")).toEqual(["corrected"]);
    expect(r.reply).toMatch(/your name/);
    expect((await call(t, ["my drain is clogged"]))[1].reply).toBe(r.reply);
  });
});
