import type { CallState, TurnTrace } from "./types";

// Calls placed in the live demo are kept in this browser so the agency
// dashboard can show them next to the seeded history.

export interface StoredTurn {
  caller: string;
  agent: string;
  trace: TurnTrace | null;
}

export interface StoredCall {
  id: string;
  tenantId: string;
  startedAt: number;
  greeting: string;
  state: CallState;
  turns: StoredTurn[];
}

const KEY = "switchboard.demoCalls.v1";

export function loadDemoCalls(): StoredCall[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredCall[]) : [];
  } catch {
    return [];
  }
}

export function saveDemoCall(call: StoredCall): void {
  try {
    const rest = loadDemoCalls().filter((c) => c.id !== call.id);
    window.localStorage.setItem(KEY, JSON.stringify([call, ...rest].slice(0, 8)));
  } catch {
    // Storage can be unavailable (private mode, quota). The demo works without it.
  }
}

export function clearDemoCalls(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
