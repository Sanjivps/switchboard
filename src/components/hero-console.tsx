"use client";

import { useEffect, useState } from "react";
import { GUARDRAILS, summarize } from "@/lib/guardrail-catalog";
import type { GuardrailStatus, TurnTrace } from "@/lib/types";
import { Lamp } from "./ui";

export interface HeroTurn {
  caller: string;
  agent: string;
  trace: TurnTrace | null;
}

const ON_DARK: Record<GuardrailStatus, string> = { pass: "#7fd3a8", blocked: "#ff8f7e", corrected: "#ffcf70", triggered: "#9cbcff" };
const VERB: Record<GuardrailStatus, string> = { pass: "passed", blocked: "blocked", corrected: "corrected", triggered: "escalated" };

/** Replays a real engine transcript, lighting the lamp panel turn by turn. */
export function HeroConsole({ greeting, turns, business, confirmation }: { greeting: string; turns: HeroTurn[]; business: string; confirmation?: string }) {
  // step 2n+1: caller line n shown; step 2n+2: agent reply n shown and lamps lit.
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) setStep(turns.length * 2);
  }, [turns.length]);

  useEffect(() => {
    if (reduced) return;
    const last = turns.length * 2;
    const delay = step === 0 ? 900 : step === last ? 5200 : step % 2 === 1 ? 1100 : 2600;
    const t = setTimeout(() => setStep((s) => (s >= last ? 0 : s + 1)), delay);
    return () => clearTimeout(t);
  }, [step, reduced, turns.length]);

  const turnIdx = step === 0 ? -1 : Math.floor((step - 1) / 2);
  const replied = step > 0 && step % 2 === 0;
  const litTurn = replied ? turns[turnIdx] : null;
  const summary = litTurn?.trace ? summarize(litTurn.trace.guardrails) : null;

  const bubbles: { who: "agent" | "caller"; text: string; key: string }[] = [{ who: "agent", text: greeting, key: "g" }];
  for (let i = 0; i <= turnIdx && i < turns.length; i++) {
    bubbles.push({ who: "caller", text: turns[i].caller, key: `c${i}` });
    if (i < turnIdx || replied) bubbles.push({ who: "agent", text: turns[i].agent, key: `a${i}` });
  }
  const visible = bubbles.slice(-4);
  const g = litTurn?.trace?.guardrails ?? [];
  const caught = g.find((x) => x.status === "blocked") ?? g.find((x) => x.status === "corrected");

  return (
    <div className="relative" aria-label="Replay of a real call handled by Switchboard">
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_0_0_1px_var(--color-rule),0_40px_80px_-40px_rgba(14,26,43,.45)]">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3">
          <p className="flex items-center gap-2 text-[13px] text-slate">
            <Lamp status="pass" size={7} className="animate-blink" />
            Incoming call, {business}
          </p>
          <p className="text-[12px] text-mist">Replay of a real engine run</p>
        </div>
        <div className="flex h-[300px] flex-col justify-end gap-2.5 overflow-hidden px-5 py-4 sm:h-[290px]">
          {visible.map((b) =>
            b.who === "agent" ? (
              <p key={b.key} className="max-w-[88%] animate-rise rounded-[16px] rounded-tl-[5px] bg-paper px-3.5 py-2 text-[14px] leading-[1.5] shadow-[0_0_0_1px_var(--color-rule)]">
                {b.text}
              </p>
            ) : (
              <p key={b.key} className="ml-auto max-w-[80%] animate-rise rounded-[16px] rounded-br-[5px] bg-ink px-3.5 py-2 text-[14px] leading-[1.5] text-white">
                {b.text}
              </p>
            ),
          )}
          {step % 2 === 1 && (
            <p className="flex items-center gap-1.5 text-[12px] text-slate">
              <Lamp status="corrected" size={6} className="animate-blink" /> Checking the model&apos;s proposal
            </p>
          )}
        </div>
      </div>

      {confirmation && step === turns.length * 2 && (
        <div className="absolute -left-3 top-[30%] z-10 w-[272px] animate-rise rounded-[18px] bg-white/95 p-3.5 shadow-[0_0_0_1px_rgba(14,26,43,.08),0_24px_48px_-16px_rgba(14,26,43,.45)] backdrop-blur sm:-left-16">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-pass text-[10px] text-white" aria-hidden>✓</span>
              Text to caller
            </span>
            <span className="text-[11px] text-mist">now</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.45] text-slate">{confirmation}</p>
        </div>
      )}

      <div className="faceplate -mt-4 ml-6 mr-[-8px] rounded-[20px] p-4 shadow-[0_30px_60px_-30px_rgba(14,26,43,.7)] ring-1 ring-console-line sm:ml-10">
        <ul className="grid grid-cols-3 gap-x-3 gap-y-3" key={litTurn ? `t${turnIdx}${replied}` : "idle"}>
          {GUARDRAILS.map((g, i) => {
            const status = summary?.get(g.id)?.status;
            return (
              <li key={g.id} className="flex items-center gap-2" style={{ animationDelay: `${i * 60}ms` }}>
                <span style={{ animationDelay: `${i * 60}ms` }} className="[&>span]:[animation-delay:inherit]">
                  <Lamp status={status ?? "idle"} size={10} animate />
                </span>
                <span className={`truncate text-[12px] ${status ? "text-console-text" : "text-mist"}`}>{g.label}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 min-h-[40px] border-t border-console-line pt-3 text-[12.5px] leading-[1.5] text-console-text/90">
          {caught ? (
            <>
              {litTurn?.trace?.faultInjected && <span className="text-mist">Simulated jailbroken model. </span>}
              <span style={{ color: ON_DARK[caught.status] }}>{caught.label} {VERB[caught.status]}.</span> {caught.detail}
            </>
          ) : litTurn ? (
            "Every check passed. The reply was written from approved templates."
          ) : (
            "Lamps light as code reviews what the model proposed."
          )}
        </p>
      </div>
    </div>
  );
}
