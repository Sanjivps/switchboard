import { getTenant } from "../../tenants";
import type { Tenant, TurnResult } from "../../types";
import { newCall, runTurn } from "../engine";
import { rulesInterpreter, type Interpreter } from "../interpreters";

/** A Monday, so the next three working days are Tue–Thu. */
export const NOW = new Date("2026-10-19T15:00:00Z");

export function tenant(id = "brightwater"): Tenant {
  const t = getTenant(id);
  if (!t) throw new Error(`no tenant ${id}`);
  return t;
}

export interface CallOptions {
  interpreter?: Interpreter;
  faultInjection?: boolean;
  timeoutMs?: number;
}

/** Plays a scripted caller through the engine and returns every turn. */
export async function call(t: Tenant, lines: string[], opts: CallOptions = {}): Promise<TurnResult[]> {
  const turns: TurnResult[] = [newCall(t)];
  for (const message of lines) {
    const prev = turns.at(-1)!;
    turns.push(
      await runTurn({
        tenant: t,
        state: prev.state,
        message,
        now: NOW,
        interpreter: opts.interpreter ?? rulesInterpreter,
        faultInjection: opts.faultInjection,
        timeoutMs: opts.timeoutMs,
      }),
    );
  }
  return turns;
}

export function statuses(turn: TurnResult, id: string): string[] {
  return (turn.trace?.guardrails ?? []).filter((g) => g.id === id).map((g) => g.status);
}

export function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
}
