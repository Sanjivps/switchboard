import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { newCall, runTurn } from "@/lib/agent/engine";
import { createClaudeInterpreter, rulesInterpreter, type Interpreter } from "@/lib/agent/interpreters";
import { getTenant } from "@/lib/tenants";
import type { CallState } from "@/lib/types";
import { activeModel } from "@/lib/model-label";
import { claimModelCall } from "@/lib/usage-guard";

// Stateless: the client holds the call state and sends it back each turn,
// so this runs on any serverless host with no database.

// Haiku keeps the demo cheap: interpretation is a small structured-extraction job.
const MODEL = activeModel() ?? "claude-haiku-5-5";

let interpreter: Interpreter | null = null;
function getInterpreter(): Interpreter {
  if (!interpreter) {
    interpreter = process.env.ANTHROPIC_API_KEY ? createClaudeInterpreter(new Anthropic(), MODEL) : rulesInterpreter;
  }
  return interpreter;
}

const Body = z.object({
  tenantId: z.string(),
  message: z.string().max(500).optional(),
  state: z.custom<CallState>((v) => typeof v === "object" && v !== null).nullable().optional(),
  faultInjection: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ interpreter: getInterpreter().kind, model: getInterpreter().kind === "claude" ? MODEL : null });
}

function visitorId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "local";
}

/** Only this site's own pages may drive the endpoint (and spend model credits). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-origin requests aren't allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const { tenantId, message, state, faultInjection } = parsed.data;
  const tenant = getTenant(tenantId);
  if (!tenant) return NextResponse.json({ error: `Unknown tenant "${tenantId}"` }, { status: 404 });

  if (!state || !message?.trim()) return NextResponse.json(newCall(tenant));
  if (state.tenantId !== tenant.id) return NextResponse.json({ error: "Call state belongs to another tenant" }, { status: 400 });
  if (state.transcript.length > 60) return NextResponse.json({ error: "Call is too long; start a new one" }, { status: 400 });

  const interp = getInterpreter();
  const claim = interp.kind === "claude" ? claimModelCall(visitorId(req), state.turn + 1) : { ok: true as const };
  const result = await runTurn({
    tenant,
    state,
    message: message.trim(),
    now: new Date(),
    interpreter: interp,
    faultInjection,
    limitedReason: claim.ok ? undefined : claim.reason,
  });
  return NextResponse.json(result);
}
