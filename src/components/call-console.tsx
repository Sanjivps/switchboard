"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPhone } from "@/lib/agent/extract";
import { demoPrompts } from "@/lib/demo-prompts";
import { saveDemoCall, type StoredTurn } from "@/lib/demo-store";
import { modelLabel } from "@/lib/model-label";
import { TENANTS } from "@/lib/tenants";
import type { CallState, ExecutedAction, Stage, Tenant, TurnResult } from "@/lib/types";
import { TracePanel } from "./trace-panel";
import { Lamp } from "./ui";

const STAGE: Record<Stage, { text: string; status: "pass" | "triggered" | "blocked" | "corrected" | "idle" }> = {
  collecting: { text: "Taking details", status: "idle" },
  offering_slots: { text: "Offering times", status: "corrected" },
  booked: { text: "Booked", status: "pass" },
  transferred: { text: "Transferred", status: "triggered" },
  declined: { text: "Referred elsewhere", status: "blocked" },
};

interface Mode {
  interpreter: "claude" | "rules";
  model: string | null;
}

function useElapsed(running: boolean, resetKey: string) {
  const [secs, setSecs] = useState(0);
  useEffect(() => setSecs(0), [resetKey]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function AgentAvatar({ tenant, size = 28 }: { tenant: Tenant; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-display font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(145deg, color-mix(in srgb, ${tenant.accent} 70%, white), ${tenant.accent})`,
        boxShadow: `0 0 0 2px white, 0 0 0 3px color-mix(in srgb, ${tenant.accent} 35%, transparent)`,
      }}
      aria-hidden
    >
      {tenant.agentName[0]}
    </span>
  );
}

export function CallConsole() {
  const [tenantId, setTenantId] = useState(TENANTS[0].id);
  const tenant = TENANTS.find((t) => t.id === tenantId)!;
  const [callId, setCallId] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [state, setState] = useState<CallState | null>(null);
  const [greeting, setGreeting] = useState("");
  const [turns, setTurns] = useState<StoredTurn[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fault, setFault] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "discarded">>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const live = !!state && state.stage !== "transferred" && state.stage !== "declined";
  const elapsed = useElapsed(live, callId);

  const startCall = useCallback(async (id: string) => {
    setError(null);
    setTurns([]);
    setSelected(null);
    setDecisions({});
    setState(null);
    setGreeting("");
    try {
      const res = await fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: id }) });
      if (!res.ok) throw new Error(`The call service returned ${res.status}. Start a new call to retry.`);
      const data = (await res.json()) as TurnResult;
      setState(data.state);
      setGreeting(data.reply);
      setCallId(`demo_${Date.now().toString(36)}`);
      setStartedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call. Check your connection and start a new call.");
    }
  }, []);

  useEffect(() => {
    startCall(tenantId);
  }, [tenantId, startCall]);

  useEffect(() => {
    fetch("/api/call")
      .then((r) => r.json())
      .then((m: Mode) => setMode(m))
      .catch(() => setMode({ interpreter: "rules", model: null }));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending, greeting]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || !state || pending || !live) return;
    setPending(text);
    setInput("");
    setError(null);
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, state, message: text, faultInjection: fault }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `The call service returned ${res.status}.`);
      const result = data as TurnResult;
      const nextTurns = [...turns, { caller: text, agent: result.reply, trace: result.trace }];
      setState(result.state);
      setTurns(nextTurns);
      setSelected(nextTurns.length - 1);
      saveDemoCall({ id: callId, tenantId, startedAt, greeting, state: result.state, turns: nextTurns });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That message didn't go through. Send it again.");
      setInput(text);
    } finally {
      setPending(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const fields = state?.fields ?? {};
  const service = tenant.services.find((s) => s.id === fields.serviceId);
  const details = [
    { label: "Service", value: service?.name },
    { label: "Name", value: fields.name },
    { label: "ZIP", value: fields.zip },
    { label: "Callback", value: fields.phone ? formatPhone(fields.phone) : undefined },
  ];
  const known = details.filter((d) => d.value).length;
  const stage = state ? STAGE[state.stage] : null;
  const usingClaude = mode?.interpreter === "claude";

  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 p-4 sm:p-5 lg:h-[calc(100dvh-64px)] lg:grid-cols-[288px_minmax(0,1fr)_400px] xl:grid-cols-[300px_minmax(0,1fr)_440px]">
      {/* Control rail */}
      <aside className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1 scrollbar-thin">
        <div className="px-1 pt-1">
          <h1 className="font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.03em]">Live demo</h1>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-slate">
            You&apos;re the caller. Every reply is checked by code before it goes out, and the trace shows how.
          </p>
        </div>

        <section aria-labelledby="client-heading" className="rounded-[18px] bg-white p-2 shadow-[0_0_0_1px_var(--color-rule)]">
          <p id="client-heading" className="px-2.5 pb-1.5 pt-1.5 text-[12px] font-medium text-slate">
            Client account
          </p>
          <div role="radiogroup" aria-labelledby="client-heading" className="space-y-1">
            {TENANTS.map((t) => {
              const on = t.id === tenantId;
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => !on && setTenantId(t.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors ${on ? "bg-paper shadow-[0_0_0_1px_var(--color-rule)]" : "hover:bg-paper/70"}`}
                >
                  <AgentAvatar tenant={t} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{t.name}</span>
                    <span className="block truncate text-[12px] text-slate">
                      {t.trade}, {t.city}
                    </span>
                  </span>
                  {on && <Lamp status="pass" size={7} />}
                </button>
              );
            })}
          </div>
        </section>

        <section className={`rounded-[18px] px-4 py-3.5 transition-colors ${fault ? "bg-block-soft shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-block)_35%,transparent)]" : "bg-white shadow-[0_0_0_1px_var(--color-rule)]"}`}>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">Fault injection</span>
            <input type="checkbox" className="peer sr-only" checked={fault} onChange={(e) => setFault(e.target.checked)} />
            <span className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-rule transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-block peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-escalate" />
          </label>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-slate">
            {fault
              ? "On. Each turn, the model's output is tampered with: a 50% discount, a $49 quote, a taken slot, a spam text. Watch the lamps."
              : "Simulate a jailbroken model and watch what code lets through."}
          </p>
        </section>

        <section aria-labelledby="scenario-heading" className="rounded-[18px] bg-white p-2 shadow-[0_0_0_1px_var(--color-rule)]">
          <p id="scenario-heading" className="px-2.5 pb-1.5 pt-1.5 text-[12px] font-medium text-slate">
            Try a scenario
          </p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
            {demoPrompts(tenant).map((p) => (
              <li key={p.label} className="shrink-0">
                <button
                  disabled={!live || !!pending}
                  onClick={() => send(p.message)}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40 max-lg:bg-paper max-lg:shadow-[0_0_0_1px_var(--color-rule)]"
                >
                  <span>
                    <span className="block whitespace-nowrap text-[13.5px] font-medium">{p.label}</span>
                    <span className="block whitespace-nowrap text-[12px] text-slate">Tests {p.hint.toLowerCase()}</span>
                  </span>
                  <span className="hidden text-[15px] text-mist transition-transform group-hover:translate-x-0.5 group-hover:text-ink lg:block" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>


        <div className="mt-auto flex items-start gap-2.5 px-2 pb-1 text-[12px] leading-[1.5] text-slate">
          <Lamp status={usingClaude ? "pass" : "corrected"} size={7} className="mt-[5px]" />
          <p>
            {mode == null
              ? "Connecting to the call service."
              : usingClaude
                ? `Language understanding by ${modelLabel(mode.model)}. Prices, bookings and texts by code. Model calls are capped per visitor.`
                : "Running on the built-in rules interpreter, the same fallback production uses when the model is down."}
          </p>
        </div>
      </aside>

      {/* Call */}
      <section aria-label="Call" className="flex min-h-[640px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_var(--color-rule),0_24px_60px_-40px_rgba(14,26,43,.4)] lg:min-h-0">
        <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <AgentAvatar tenant={tenant} size={36} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium leading-tight">{tenant.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate">
                {live ? <Lamp status="pass" size={6} className="animate-blink" /> : <Lamp status="idle" size={6} />}
                <span className="tabular-nums">{live ? `${tenant.agentName} on the line, ${elapsed}` : state ? "Call ended" : "Connecting"}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stage && (
              <span className="hidden items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium shadow-[0_0_0_1px_var(--color-rule)] sm:flex">
                <Lamp status={stage.status} size={6} />
                {stage.text}
              </span>
            )}
            <button onClick={() => startCall(tenantId)} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--color-rule)] transition-colors hover:bg-paper">
              New call
            </button>
          </div>
        </header>

        {/* Collected details */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-rule bg-paper/60 px-5 py-2.5">
          <span className="mr-1 shrink-0 text-[12px] tabular-nums text-slate">{known} of 4 details</span>
          {details.map((d) => (
            <span
              key={d.label}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                d.value ? "border border-transparent bg-white text-ink shadow-[0_0_0_1px_var(--color-rule)]" : "border border-dashed border-[#c3cbd6] text-mist"
              }`}
            >
              {d.value ? <Lamp status="pass" size={6} /> : <span className="h-1.5 w-1.5 rounded-full bg-rule" />}
              <span className={d.value ? "text-slate" : ""}>{d.label}</span>
              {d.value && <span className="font-medium">{d.value}</span>}
            </span>
          ))}
        </div>

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6" aria-live="polite">
          {greeting ? (
            <AgentMessage tenant={tenant} text={greeting} />
          ) : (
            !error && (
              <div className="flex items-center gap-2 text-[13px] text-slate">
                <Lamp status="corrected" size={7} className="animate-blink" /> Connecting the call
              </div>
            )
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-5">
              <CallerMessage text={t.caller} selected={selected === i} onSelect={() => setSelected(i)} />
              <AgentMessage
                tenant={tenant}
                text={t.agent}
                caught={t.trace?.guardrails.filter((g) => g.status !== "pass").length ?? 0}
                onInspect={() => setSelected(i)}
              />
              {(t.trace?.executed ?? []).map((a, j) => (
                <EventCard key={j} action={a} id={`${i}_${j}`} decisions={decisions} setDecisions={setDecisions} />
              ))}
            </div>
          ))}
          {pending && (
            <div className="space-y-5">
              <CallerMessage text={pending} dim />
              <div className="flex items-end gap-2.5">
                <AgentAvatar tenant={tenant} />
                <div className="flex items-center gap-1 rounded-[18px] rounded-bl-[6px] bg-paper px-4 py-3.5 shadow-[0_0_0_1px_var(--color-rule)]" aria-label="Checking the reply">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist" style={{ animationDelay: `${d * 140}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {state && !live && (
            <div className="rounded-2xl bg-paper p-4 text-[13.5px] leading-[1.55] text-slate shadow-[0_0_0_1px_var(--color-rule)]">
              <p className="font-medium text-ink">{state.stage === "transferred" ? "Handed to a person" : "Caller referred elsewhere"}</p>
              <p className="mt-0.5">
                {state.stage === "transferred"
                  ? "Once a call is transferred the agent steps back, so this call is over."
                  : "Jobs outside the service area are never booked, so this call is over."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => startCall(tenantId)} className="btn btn-primary !px-4 !py-2 !text-[13px]">
                  Start a new call
                </button>
                <Link href="/dashboard" className="btn btn-secondary !px-4 !py-2 !text-[13px]">
                  See it on the dashboard
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-rule p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-[16px] bg-paper p-2 pl-4 shadow-[0_0_0_1px_var(--color-rule)] transition-shadow focus-within:bg-white focus-within:shadow-[0_0_0_1px_var(--color-ink),0_0_0_4px_rgba(14,26,43,.08)]"
          >
            <label htmlFor="caller-input" className="sr-only">
              Say something as the caller
            </label>
            <textarea
              id="caller-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              maxLength={500}
              disabled={!live}
              placeholder={live ? `Say something to ${tenant.agentName}…` : "This call has ended. Start a new call to keep going."}
              className="max-h-32 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-[1.45] outline-none placeholder:text-mist disabled:cursor-not-allowed"
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!live || !input.trim() || !!pending}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-ink text-white transition-all hover:bg-console-2 disabled:bg-rule disabled:text-mist"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-mist">
            <span>{error ? <span role="alert" className="text-block">{error}</span> : "Enter to send, Shift + Enter for a new line"}</span>
            <span className="hidden sm:inline">Tap any of your messages to see its trace</span>
          </div>
        </div>
      </section>

      {/* Trace */}
      <section aria-label="Guardrail trace" className="min-h-[600px] lg:min-h-0">
        <TracePanel
          trace={selected != null ? turns[selected]?.trace ?? null : null}
          turnNumber={selected != null ? selected + 1 : null}
          totalTurns={turns.length}
          onStep={(d) => setSelected((s) => (s == null ? s : Math.min(turns.length - 1, Math.max(0, s + d))))}
          animateKey={`${callId}-${selected}`}
          modelName={mode?.model}
        />
      </section>
    </div>
  );
}

function CallerMessage({ text, selected, dim, onSelect }: { text: string; selected?: boolean; dim?: boolean; onSelect?: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onSelect}
        disabled={!onSelect}
        aria-pressed={onSelect ? selected : undefined}
        title={onSelect ? "Show this turn's trace" : undefined}
        className={`max-w-[78%] animate-rise rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-left text-[14.5px] leading-[1.5] text-white transition-shadow ${
          dim ? "bg-ink/60" : "bg-ink"
        } ${selected ? "shadow-[0_0_0_2px_white,0_0_0_4px_var(--color-lamp)]" : onSelect ? "hover:shadow-[0_0_0_2px_white,0_0_0_4px_var(--color-rule)]" : ""}`}
      >
        {text}
      </button>
    </div>
  );
}

function AgentMessage({ tenant, text, caught = 0, onInspect }: { tenant: Tenant; text: string; caught?: number; onInspect?: () => void }) {
  return (
    <div className="flex animate-rise items-end gap-2.5">
      <AgentAvatar tenant={tenant} />
      <div className="max-w-[80%]">
        <p className="rounded-[18px] rounded-bl-[6px] bg-paper px-4 py-2.5 text-[14.5px] leading-[1.55] text-ink shadow-[0_0_0_1px_var(--color-rule)]">{text}</p>
        {caught > 0 && (
          <button onClick={onInspect} className="mt-1.5 flex items-center gap-1.5 pl-1 text-[12px] font-medium text-fix hover:underline">
            <Lamp status="corrected" size={6} />
            {caught} {caught === 1 ? "check" : "checks"} stepped in before this reply
          </button>
        )}
      </div>
    </div>
  );
}

function EventCard({
  action,
  id,
  decisions,
  setDecisions,
}: {
  action: ExecutedAction;
  id: string;
  decisions: Record<string, "approved" | "discarded">;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, "approved" | "discarded">>>;
}) {
  if (action.type === "quoted") return null;
  const wrap = "mx-auto w-full max-w-[460px] animate-rise rounded-2xl p-3.5 text-[13px] leading-[1.5]";

  if (action.type === "booked") {
    return (
      <div className={`${wrap} bg-pass-soft/70 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-pass)_25%,transparent)]`}>
        <p className="flex items-center gap-2 font-medium text-ink">
          <Lamp status="pass" size={7} /> Appointment booked
        </p>
        <p className="mt-1 text-slate">
          {action.slotLabel}, confirmation <span className="font-medium text-ink">{action.ref}</span>
        </p>
        <Link href="/dashboard" className="mt-2 inline-block text-[12.5px] font-medium text-pass hover:underline">
          View this call on the agency dashboard
        </Link>
      </div>
    );
  }
  if (action.type === "sms_sent") {
    return (
      <div className={`${wrap} bg-white shadow-[0_0_0_1px_var(--color-rule)]`}>
        <p className="flex items-center justify-between text-[12px] text-slate">
          <span className="flex items-center gap-2 font-medium text-ink">
            <Lamp status="pass" size={7} /> Confirmation texted to {action.to}
          </span>
          <span>Template</span>
        </p>
        <p className="mt-1 text-slate">“{action.body}”</p>
      </div>
    );
  }
  if (action.type === "transferred") {
    return (
      <div className={`${wrap} bg-escalate-soft/70 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-escalate)_25%,transparent)]`}>
        <p className="flex items-center gap-2 font-medium text-ink">
          <Lamp status="triggered" size={7} className="animate-blink" /> Transferring to {action.to}
        </p>
        <p className="mt-1 text-slate">{action.reason}. The agent hands off and stays out of the call.</p>
      </div>
    );
  }
  // sms_held
  const d = decisions[id];
  return (
    <div className={`${wrap} bg-fix-soft/60 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-fix)_25%,transparent)]`}>
      <p className="flex items-center gap-2 font-medium text-ink">
        <Lamp status={d === "approved" ? "pass" : d === "discarded" ? "idle" : "corrected"} size={7} />
        {d === "approved" ? `Approved and sent to ${action.to}` : d === "discarded" ? "Text discarded" : `Text to ${action.to} is waiting for approval`}
      </p>
      <p className="mt-1 text-slate">“{action.body}”</p>
      {!d && (
        <div className="mt-2.5 flex justify-end gap-2">
          <button onClick={() => setDecisions((x) => ({ ...x, [id]: "discarded" }))} className="rounded-full bg-white px-3 py-1 text-[12.5px] text-slate shadow-[0_0_0_1px_var(--color-rule)] hover:text-ink">
            Discard
          </button>
          <button onClick={() => setDecisions((x) => ({ ...x, [id]: "approved" }))} className="rounded-full bg-ink px-3 py-1 text-[12.5px] text-white hover:bg-console-2">
            Approve and send
          </button>
        </div>
      )}
    </div>
  );
}
