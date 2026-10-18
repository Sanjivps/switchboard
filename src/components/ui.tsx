import Link from "next/link";
import type { GuardrailStatus } from "@/lib/types";
import { SITE } from "@/lib/site";

export const STATUS_META: Record<GuardrailStatus | "idle", { label: string; color: string; soft: string; text: string }> = {
  pass: { label: "Passed", color: "var(--color-pass)", soft: "var(--color-pass-soft)", text: "text-pass" },
  blocked: { label: "Blocked", color: "var(--color-block)", soft: "var(--color-block-soft)", text: "text-block" },
  corrected: { label: "Corrected", color: "var(--color-fix)", soft: "var(--color-fix-soft)", text: "text-fix" },
  triggered: { label: "Escalated", color: "var(--color-escalate)", soft: "var(--color-escalate-soft)", text: "text-escalate" },
  idle: { label: "Idle", color: "var(--color-console-line)", soft: "transparent", text: "text-mist" },
};

/** An indicator lamp. The visual unit of the whole product. */
export function Lamp({
  status,
  size = 10,
  animate = false,
  className = "",
}: {
  status: GuardrailStatus | "idle";
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const lit = status !== "idle";
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${animate && lit ? "animate-lamp-on" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        color: meta.color,
        background: lit
          ? `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${meta.color} 35%, white) 0%, ${meta.color} 55%)`
          : meta.color,
        boxShadow: lit ? `0 0 8px 0 ${meta.color}` : "inset 0 1px 2px rgba(0,0,0,.35)",
      }}
    />
  );
}

export function Wordmark({ tone = "ink" }: { tone?: "ink" | "light" }) {
  const dots = ["var(--color-lamp)", "var(--color-console-line)", "var(--color-console-line)", "var(--color-pass)"];
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid grid-cols-2 gap-[3px] rounded-[6px] bg-console p-[5px]" aria-hidden>
        {dots.map((c, i) => (
          <span key={i} className="block h-[6px] w-[6px] rounded-full" style={{ background: c }} />
        ))}
      </span>
      <span className={`font-display text-[19px] font-semibold tracking-[-0.02em] ${tone === "light" ? "text-white" : "text-ink"}`}>
        Switchboard
      </span>
    </span>
  );
}

const NAV = [
  { href: "/", label: "Case study" },
  { href: "/demo", label: "Live demo" },
  { href: "/dashboard", label: "Agency dashboard" },
];

export function SiteNav({ active, wide = false }: { active: "/" | "/demo" | "/dashboard"; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule/80 bg-porcelain/85 backdrop-blur-md">
      <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 ${wide ? "max-w-[1600px] sm:px-5" : "max-w-[1240px] sm:px-6"}`}>
        <Link href="/" aria-label="Switchboard home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 whitespace-nowrap text-[14px]">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`hidden rounded-full px-3 py-1.5 transition-colors sm:block ${
                active === n.href ? "bg-white text-ink shadow-[0_0_0_1px_var(--color-rule)]" : "text-slate hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href={active === "/demo" ? "/dashboard" : "/demo"}
            className="rounded-full px-3 py-1.5 text-slate hover:text-ink sm:hidden"
          >
            {active === "/demo" ? "Dashboard" : "Live demo"}
          </Link>
          <a
            href={SITE.booking}
            className="ml-1 rounded-full bg-ink px-4 py-1.5 font-medium sm:ml-2 text-white transition-colors hover:bg-console-2"
          >
            Hire me
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-console text-console-text">
      <div className="mx-auto grid max-w-[1240px] gap-10 border-t border-console-line px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <div className="max-w-[40ch]">
          <Wordmark tone="light" />
          <p className="mt-4 text-[14px] leading-[1.6] text-console-text/75">
            An AI receptionist with its guardrails in code. Designed and built by {SITE.author}. The businesses shown are fictional; the engine, tests and traces are real.
          </p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-white">Product</p>
          <ul className="mt-3 space-y-2 text-[14px]">
            <li><Link className="text-console-text/75 hover:text-white" href="/">Case study</Link></li>
            <li><Link className="text-console-text/75 hover:text-white" href="/demo">Live demo</Link></li>
            <li><Link className="text-console-text/75 hover:text-white" href="/dashboard">Agency dashboard</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-medium text-white">Work with me</p>
          <ul className="mt-3 space-y-2 text-[14px]">
            <li><a className="text-console-text/75 hover:text-white" href={SITE.booking}>Start a project</a></li>
            <li><a className="text-console-text/75 hover:text-white" href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            {SITE.repo && <li><a className="text-console-text/75 hover:text-white" href={SITE.repo}>Source on GitHub</a></li>}
          </ul>
        </div>
      </div>
    </footer>
  );
}
