import { GUARDRAILS, summarize } from "@/lib/guardrail-catalog";
import { modelLabel } from "@/lib/model-label";
import type { ExecutedAction, GuardrailStatus, TurnTrace } from "@/lib/types";
import { Lamp, STATUS_META } from "./ui";

/** Status colours lifted for legibility on the navy console. */
const ON_DARK: Record<GuardrailStatus | "idle", string> = { pass: "#7fd3a8", blocked: "#ff8f7e", corrected: "#ffcf70", triggered: "#9cbcff", idle: "#8a96a6" };

function interpreterLabel(trace: TurnTrace, modelName?: string | null): string {
  if (trace.interpreter === "claude") return modelLabel(modelName ?? "claude");
  if (trace.interpreter === "rules") return "Rules engine";
  return "Rules engine (fallback)";
}

function executedLine(a: ExecutedAction): { verb: string; text: string; tone: string } {
  switch (a.type) {
    case "booked":
      return { verb: "Booked", text: `${a.slotLabel}, ref ${a.ref}`, tone: ON_DARK.pass };
    case "transferred":
      return { verb: "Transferred", text: `${a.to}, ${a.reason.toLowerCase()}`, tone: ON_DARK.triggered };
    case "sms_sent":
      return { verb: "Texted", text: `${a.to}: “${a.body}”`, tone: ON_DARK.pass };
    case "sms_held":
      return { verb: "Held for approval", text: `${a.to}: “${a.body}”`, tone: ON_DARK.corrected };
    case "quoted":
      return { verb: "Quoted from price book", text: a.line, tone: ON_DARK.pass };
  }
}

/** The lamp console: one row per guardrail, lit by what code decided this turn. */
export function TracePanel({
  trace,
  turnNumber,
  totalTurns,
  onStep,
  animateKey,
  modelName,
}: {
  trace: TurnTrace | null;
  turnNumber: number | null;
  totalTurns?: number;
  onStep?: (delta: -1 | 1) => void;
  animateKey?: string | number;
  modelName?: string | null;
}) {
  const summary = trace ? summarize(trace.guardrails) : null;
  const counts = { pass: 0, corrected: 0, blocked: 0, triggered: 0 } as Record<GuardrailStatus, number>;
  summary?.forEach((v) => counts[v.status]++);

  return (
    <div className="faceplate flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] text-console-text ring-1 ring-console-line">
      <div className="border-b border-console-line px-5 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[16px] font-semibold tracking-[-0.01em] text-white">Guardrail trace</p>
          {onStep && totalTurns ? (
            <div className="flex items-center gap-1 text-[12px] text-mist">
              <button
                onClick={() => onStep(-1)}
                disabled={!turnNumber || turnNumber <= 1}
                aria-label="Previous turn"
                className="grid h-7 w-7 place-items-center rounded-full text-console-text transition-colors hover:bg-console-2 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="min-w-[70px] text-center tabular-nums">
                Turn {turnNumber ?? 0} of {totalTurns}
              </span>
              <button
                onClick={() => onStep(1)}
                disabled={!turnNumber || turnNumber >= totalTurns}
                aria-label="Next turn"
                className="grid h-7 w-7 place-items-center rounded-full text-console-text transition-colors hover:bg-console-2 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          ) : turnNumber ? (
            <span className="text-[12px] text-mist">Turn {turnNumber}</span>
          ) : null}
        </div>
        {trace ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="rounded-full bg-console-2 px-2.5 py-1 text-console-text">
              {interpreterLabel(trace, modelName)}
              <span className="text-mist">, {trace.latencyMs.toLocaleString()} ms</span>
            </span>
            {(["blocked", "corrected", "triggered", "pass"] as GuardrailStatus[])
              .filter((s) => counts[s])
              .map((s) => (
                <span key={s} className="flex items-center gap-1.5 rounded-full bg-console-2 px-2.5 py-1" style={{ color: ON_DARK[s] }}>
                  <Lamp status={s} size={6} />
                  {counts[s]} {STATUS_META[s].label.toLowerCase()}
                </span>
              ))}
          </div>
        ) : (
          <p className="mt-1 text-[13px] leading-[1.5] text-mist">Send a message as the caller. Each lamp lights as code reviews what the model proposed.</p>
        )}
      </div>

      {trace?.faultInjected && (
        <p className="flex gap-2.5 border-b border-console-line bg-[#d2412f]/12 px-5 py-3 text-[12.5px] leading-[1.5] text-[#ffb4a8]">
          <Lamp status="blocked" size={7} className="mt-[5px]" />
          Fault injection on: the model&apos;s proposal was tampered with to offer discounts, book a taken slot and send spam.
        </p>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" key={animateKey}>
        <ul className="py-1.5">
          {GUARDRAILS.map((g, i) => {
            const row = summary?.get(g.id);
            const status = row?.status ?? "idle";
            return (
              <li key={g.id} className={`mx-2 flex gap-3 rounded-xl px-3 py-2.5 ${row && status !== "pass" ? "bg-console-2/70" : ""}`}>
                <span className="pt-[5px]" style={{ animationDelay: `${i * 55}ms` }}>
                  <Lamp status={status} size={10} animate className="[animation-delay:inherit]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-[13.5px] font-medium ${row ? "text-white" : "text-mist"}`}>{g.label}</p>
                    {row && (
                      <span className="shrink-0 text-[11.5px] font-medium" style={{ color: ON_DARK[status] }}>
                        {STATUS_META[status].label}
                      </span>
                    )}
                  </div>
                  {row
                    ? row.details.map((d, j) => (
                        <p key={j} className="mt-0.5 text-[12.5px] leading-[1.5] text-console-text/80">
                          {d}
                        </p>
                      ))
                    : trace && <p className="mt-0.5 text-[12.5px] text-mist/70">Not reached: the call was handed off.</p>}
                </div>
              </li>
            );
          })}
        </ul>

        {trace && (
          <div className="space-y-4 border-t border-console-line px-5 py-4">
            <div>
              <p className="mb-2 text-[12.5px] font-medium text-white">What code executed</p>
              {trace.executed.length ? (
                <ul className="space-y-1.5">
                  {trace.executed.map((a, i) => {
                    const l = executedLine(a);
                    return (
                      <li key={i} className="text-[12.5px] leading-[1.5]">
                        <span style={{ color: l.tone }}>{l.verb}</span> <span className="text-console-text/80">{l.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[12.5px] text-mist">Nothing yet. The agent asked for the next detail.</p>
              )}
            </div>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-white [&::-webkit-details-marker]:hidden">
                <span className="inline-block text-mist transition-transform group-open:rotate-90">›</span> Raw model proposal
              </summary>
              <pre className="scrollbar-thin mt-2 max-h-72 overflow-auto rounded-xl bg-[#0b1726] p-3 font-mono text-[11.5px] leading-[1.6] text-console-text">
                {JSON.stringify(trace.proposal, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
