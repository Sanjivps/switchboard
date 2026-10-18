"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { maskPhone } from "@/lib/agent/extract";
import type { ClientStats, DashboardData, DayStats, RecentCall } from "@/lib/dashboard-data";
import { clearDemoCalls, loadDemoCalls, type StoredCall } from "@/lib/demo-store";
import { TENANTS } from "@/lib/tenants";
import type { Stage } from "@/lib/types";
import { TracePanel } from "./trace-panel";
import { Lamp } from "./ui";

const OUTCOME_LAMP: Record<Stage, "pass" | "triggered" | "blocked" | "corrected" | "idle"> = {
  booked: "pass",
  transferred: "triggered",
  declined: "blocked",
  offering_slots: "corrected",
  collecting: "idle",
};

const SERIES: { key: keyof Omit<DayStats, "date">; label: string; color: string }[] = [
  { key: "booked", label: "Booked", color: "var(--color-pass)" },
  { key: "answered", label: "Answered, not booked", color: "#a9b8cb" },
  { key: "transferred", label: "Transferred", color: "var(--color-escalate)" },
  { key: "declined", label: "Out of area", color: "var(--color-lamp)" },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-US");
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ago(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)} d ago`;
}

function fromStored(c: StoredCall, labels: Record<Stage, string>): RecentCall {
  const tenant = TENANTS.find((t) => t.id === c.tenantId)!;
  const s = c.state;
  const svc = tenant.services.find((x) => x.id === s.fields.serviceId)?.name;
  return {
    id: c.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    accent: tenant.accent,
    caller: s.fields.name ? `${s.fields.name} (you)` : "You, in the live demo",
    phone: s.fields.phone ? maskPhone(s.fields.phone) : "Withheld",
    minutesAgo: Math.max(0, Math.round((Date.now() - c.startedAt) / 60000)),
    afterHours: false,
    outcome: s.stage,
    summary: s.stage === "booked" ? `${svc}, ${s.booking!.label}` : svc ? `${svc}, ${labels[s.stage].toLowerCase()}` : labels[s.stage],
    greeting: c.greeting,
    turns: c.turns,
    interventions: c.turns.flatMap((t) => t.trace?.guardrails ?? []).filter((g) => g.status !== "pass"),
  };
}

export function Dashboard({ data, agency }: { data: DashboardData; agency: { name: string; plan: string } }) {
  const [filter, setFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [demoCalls, setDemoCalls] = useState<StoredCall[]>([]);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "discarded">>({});

  useEffect(() => setDemoCalls(loadDemoCalls()), []);

  const clients = filter === "all" ? data.clients : data.clients.filter((c) => c.tenant.id === filter);
  const totals = useMemo(() => {
    const t = { calls: 0, booked: 0, afterHours: 0, revenue: 0, interventions: 0, transferred: 0 };
    for (const c of clients) {
      t.calls += c.calls;
      t.booked += c.booked;
      t.afterHours += c.afterHours;
      t.revenue += c.revenue;
      t.interventions += c.interventions;
      t.transferred += c.transferred;
    }
    return t;
  }, [clients]);

  const days = useMemo(() => {
    const base = clients[0]?.days ?? [];
    return base.map((d, i) => {
      const sum: DayStats = { date: d.date, booked: 0, answered: 0, transferred: 0, declined: 0 };
      for (const c of clients) {
        const x = c.days[i];
        sum.booked += x.booked;
        sum.answered += x.answered;
        sum.transferred += x.transferred;
        sum.declined += x.declined;
      }
      return sum;
    });
  }, [clients]);

  const recent = useMemo(() => {
    const mine = demoCalls.filter((c) => c.turns.length).map((c) => fromStored(c, data.outcomeLabels));
    const all = [...mine, ...data.recent];
    return filter === "all" ? all : all.filter((c) => c.tenantId === filter);
  }, [demoCalls, data, filter]);

  const approvals = filter === "all" ? data.approvals : data.approvals.filter((a) => TENANTS.find((t) => t.id === filter)?.name === a.tenantName);
  const openCall = recent.find((c) => c.id === openId) ?? null;
  const waiting = approvals.filter((a) => !decisions[a.id]).length;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[14px] text-slate">{agency.plan}</p>
          <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{agency.name}</h1>
          <p className="mt-1.5 text-[15px] text-slate">Every client&apos;s receptionist in one place. Last 30 days.</p>
        </div>
        <div role="radiogroup" aria-label="Filter by client" className="flex flex-wrap rounded-full bg-white p-1 shadow-[0_0_0_1px_var(--color-rule)]">
          {[{ id: "all", label: "All clients", accent: "var(--color-ink)" }, ...TENANTS.map((t) => ({ id: t.id, label: t.name, accent: t.accent }))].map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={filter === o.id}
              onClick={() => setFilter(o.id)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[14px] transition-colors ${filter === o.id ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
            >
              {o.id !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: o.accent }} />}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-rule shadow-[0_0_0_1px_var(--color-rule)] sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Calls answered", value: num.format(totals.calls), note: "Median pickup 1 ring" },
          { label: "Jobs booked", value: num.format(totals.booked), note: "Straight onto the calendar" },
          { label: "Booking rate", value: `${Math.round((totals.booked / Math.max(1, totals.calls)) * 100)}%`, note: "Of all answered calls" },
          { label: "After-hours calls", value: num.format(totals.afterHours), note: "Would have hit voicemail" },
          { label: "Booked revenue", value: usd.format(totals.revenue), note: "At average ticket" },
          { label: "Checks stepped in", value: num.format(totals.interventions), note: "Corrected or blocked" },
        ].map((k) => (
          <div key={k.label} className="bg-white px-5 py-4">
            <dt className="text-[13px] text-slate">{k.label}</dt>
            <dd className="mt-1 font-display text-[28px] font-semibold tracking-[-0.02em] tabular-nums">{k.value}</dd>
            <dd className="text-[12px] text-mist">{k.note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <CallsChart days={days} />
          <RecentCalls calls={recent} labels={data.outcomeLabels} onOpen={setOpenId} hasDemo={demoCalls.some((c) => c.turns.length)} onClearDemo={() => { clearDemoCalls(); setDemoCalls([]); }} />
        </div>
        <aside className="space-y-5">
          <section className="rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_var(--color-rule)]">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em]">Texts waiting for approval</h2>
              <span className="text-[13px] text-slate">{waiting} waiting</span>
            </div>
            <p className="mt-1 text-[13px] leading-[1.5] text-slate">Anything the model writes is held here. Only booking confirmations send themselves.</p>
            <ul className="mt-4 space-y-3">
              {approvals.map((a) => {
                const d = decisions[a.id];
                const spam = /EXCLUSIVE|50%/.test(a.body);
                return (
                  <li key={a.id} className="rounded-2xl bg-paper p-3.5 shadow-[0_0_0_1px_var(--color-rule)]">
                    <p className="text-[12px] text-slate">
                      {a.tenantName}, to {a.caller} at {a.to}
                    </p>
                    <p className="mt-1 text-[14px] leading-[1.5]">“{a.body}”</p>
                    {spam && !d && <p className="mt-1.5 text-[12px] text-block">Not from the price book. Likely a bad model output.</p>}
                    <div className="mt-2.5 flex items-center justify-end gap-2 text-[13px]">
                      {d ? (
                        <span className={`flex items-center gap-1.5 font-medium ${d === "approved" ? "text-pass" : "text-mist"}`}>
                          <Lamp status={d === "approved" ? "pass" : "idle"} size={7} />
                          {d === "approved" ? "Sent" : "Discarded"}
                          <button onClick={() => setDecisions((x) => { const n = { ...x }; delete n[a.id]; return n; })} className="ml-2 font-normal text-slate underline underline-offset-4 hover:text-ink">
                            Undo
                          </button>
                        </span>
                      ) : (
                        <>
                          <button onClick={() => setDecisions((x) => ({ ...x, [a.id]: "discarded" }))} className="rounded-full bg-white px-3 py-1 text-slate shadow-[0_0_0_1px_var(--color-rule)] hover:text-ink">
                            Discard
                          </button>
                          <button onClick={() => setDecisions((x) => ({ ...x, [a.id]: "approved" }))} className="rounded-full bg-ink px-3 py-1 text-white hover:bg-console-2">
                            Approve and send
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {!approvals.length && <li className="text-[14px] text-slate">Nothing waiting for this client.</li>}
            </ul>
          </section>

          <section className="rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_var(--color-rule)]">
            <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em]">Client accounts</h2>
            <ul className="mt-3 divide-y divide-rule">
              {data.clients.map((c) => (
                <ClientRow key={c.tenant.id} c={c} active={filter === c.tenant.id} onSelect={() => setFilter(filter === c.tenant.id ? "all" : c.tenant.id)} />
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <p className="mt-8 max-w-[80ch] text-[13px] leading-[1.6] text-mist">
        Demo account. Daily volumes are generated; every call in the list above is a scripted caller run through the real engine, and calls you place in the{" "}
        <Link href="/demo" className="underline underline-offset-4 hover:text-ink">live demo</Link> appear at the top.
      </p>

      {openCall && <CallDrawer call={openCall} labels={data.outcomeLabels} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClientRow({ c, active, onSelect }: { c: ClientStats; active: boolean; onSelect: () => void }) {
  const max = Math.max(...c.days.map((d) => d.booked + d.answered + d.transferred + d.declined));
  const points = c.days.map((d, i) => `${(i / (c.days.length - 1)) * 100},${28 - ((d.booked + d.answered + d.transferred + d.declined) / max) * 26}`).join(" ");
  return (
    <li>
      <button onClick={onSelect} aria-pressed={active} className={`-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors ${active ? "bg-paper" : "hover:bg-paper"}`}>
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: c.tenant.accent }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{c.tenant.name}</span>
          <span className="block text-[12px] text-slate">
            {c.tenant.agentName} answering, {c.tenant.city}
          </span>
        </span>
        <svg viewBox="0 0 100 30" className="h-7 w-20 shrink-0" preserveAspectRatio="none" aria-hidden>
          <polyline points={points} fill="none" stroke={c.tenant.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span className="w-12 shrink-0 text-right">
          <span className="block text-[14px] font-medium tabular-nums">{Math.round((c.booked / c.calls) * 100)}%</span>
          <span className="block text-[11px] text-mist">booked</span>
        </span>
      </button>
    </li>
  );
}

function CallsChart({ days }: { days: DayStats[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => d.booked + d.answered + d.transferred + d.declined);
  const max = Math.max(...totals, 1);
  const top = Math.ceil(max / 10) * 10;
  const H = 200;
  const focus = hover ?? days.length - 1;
  const fd = days[focus];

  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_var(--color-rule)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em]">Calls per day</h2>
          <p className="mt-0.5 text-[13px] text-slate">
            {fd ? (
              <>
                {dayFmt.format(new Date(fd.date))}: <span className="font-medium text-ink">{totals[focus]} calls</span>, {fd.booked} booked, {fd.transferred} transferred, {fd.declined} out of area
              </>
            ) : null}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="flex h-[200px] flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-mist">
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[200px]">
            {[0, 0.5, 1].map((p) => (
              <div key={p} className="absolute inset-x-0 border-t border-dashed border-rule" style={{ top: `${p * 100}%` }} />
            ))}
          </div>
          <div className="relative flex h-[200px] items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <button
                key={d.date}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${dayFmt.format(new Date(d.date))}: ${totals[i]} calls, ${d.booked} booked`}
                className="group flex h-full flex-1 flex-col justify-end"
              >
                <span className={`flex w-full flex-col-reverse overflow-hidden rounded-t-[4px] transition-opacity ${hover != null && hover !== i ? "opacity-45" : ""}`} style={{ height: `${(totals[i] / top) * H}px` }}>
                  {SERIES.map((s) => (
                    <span key={s.key} style={{ height: `${(d[s.key] / Math.max(1, totals[i])) * 100}%`, background: s.color }} className="block w-full" />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-mist">
            {days.filter((_, i) => i % 7 === 0 || i === days.length - 1).map((d) => (
              <span key={d.date}>{dayFmt.format(new Date(d.date))}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RecentCalls({
  calls,
  labels,
  onOpen,
  hasDemo,
  onClearDemo,
}: {
  calls: RecentCall[];
  labels: Record<Stage, string>;
  onOpen: (id: string) => void;
  hasDemo: boolean;
  onClearDemo: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_var(--color-rule)]">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em]">Recent calls</h2>
          <p className="mt-0.5 text-[13px] text-slate">Open a call to read the transcript and see what each check did.</p>
        </div>
        {hasDemo && (
          <button onClick={onClearDemo} className="shrink-0 text-[13px] text-slate underline underline-offset-4 hover:text-ink">
            Clear my demo calls
          </button>
        )}
      </div>
      <ul className="divide-y divide-rule border-t border-rule">
        {calls.map((c) => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-paper sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
              <Lamp status={OUTCOME_LAMP[c.outcome]} size={9} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{c.caller}</span>
                <span className="flex items-center gap-1.5 truncate text-[12px] text-slate">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.accent }} />
                  {c.tenantName}
                  {c.afterHours && <span className="rounded-full bg-console px-1.5 text-[11px] text-console-text">After hours</span>}
                </span>
              </span>
              <span className="col-start-2 min-w-0 sm:col-start-auto">
                <span className="block truncate text-[13px]">
                  <span className="font-medium">{labels[c.outcome]}</span>
                  <span className="text-slate">, {c.summary}</span>
                </span>
                {c.interventions.length > 0 && (
                  <span className="block text-[12px] text-fix">
                    {c.interventions.length} {c.interventions.length === 1 ? "check" : "checks"} stepped in
                  </span>
                )}
              </span>
              <span className="row-start-1 text-right text-[12px] text-mist sm:row-start-auto">{ago(c.minutesAgo)}</span>
            </button>
          </li>
        ))}
        {!calls.length && <li className="px-5 py-6 text-[14px] text-slate">No calls for this client yet.</li>}
      </ul>
    </section>
  );
}

function CallDrawer({ call, labels, onClose }: { call: RecentCall; labels: Record<Stage, string>; onClose: () => void }) {
  const lastWithTrace = call.turns.length - 1;
  const [turn, setTurn] = useState(lastWithTrace);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Call with ${call.caller}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-[1000px] flex-col bg-porcelain shadow-2xl animate-rise">
        <div className="flex items-center justify-between gap-4 border-b border-rule bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-display text-[20px] font-semibold tracking-[-0.01em]">{call.caller}</p>
            <p className="flex items-center gap-2 text-[13px] text-slate">
              <Lamp status={OUTCOME_LAMP[call.outcome]} size={8} />
              {labels[call.outcome]}, {call.tenantName}, {call.phone}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full px-3.5 py-1.5 text-[14px] shadow-[0_0_0_1px_var(--color-rule)] hover:bg-paper">
            Close
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:overflow-hidden">
          <div className="min-h-0 space-y-3 overflow-y-auto rounded-[20px] bg-white p-4 shadow-[0_0_0_1px_var(--color-rule)]">
            <p className="max-w-[85%] rounded-[18px] rounded-tl-[6px] bg-paper px-4 py-2.5 text-[14px] leading-[1.55] shadow-[0_0_0_1px_var(--color-rule)]">{call.greeting}</p>
            {call.turns.map((t, i) => (
              <div key={i} className="space-y-3">
                <button
                  onClick={() => setTurn(i)}
                  aria-pressed={turn === i}
                  className={`ml-auto block max-w-[80%] rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-left text-[14px] leading-[1.5] text-white ${turn === i ? "bg-ink shadow-[0_0_0_3px_var(--color-lamp)]" : "bg-ink/85 hover:bg-ink"}`}
                >
                  {t.caller}
                </button>
                <p className="max-w-[85%] rounded-[18px] rounded-tl-[6px] bg-paper px-4 py-2.5 text-[14px] leading-[1.55] shadow-[0_0_0_1px_var(--color-rule)]">{t.agent}</p>
              </div>
            ))}
          </div>
          <div className="min-h-[560px] md:min-h-0">
            <TracePanel trace={call.turns[turn]?.trace ?? null} turnNumber={turn + 1} animateKey={`${call.id}-${turn}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
