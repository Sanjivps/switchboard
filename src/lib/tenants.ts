import type { Tenant } from "./types";

// Fictional businesses. Each one is a client account an agency deploys
// Switchboard for. Everything the agent is allowed to say about price,
// coverage and escalation comes from this config, never from the model.

export const TENANTS: Tenant[] = [
  {
    id: "brightwater",
    name: "Brightwater Plumbing",
    trade: "Plumbing",
    city: "Austin, TX",
    agentName: "Ava",
    accent: "#2563EB",
    transferNumber: "(512) 555-0110",
    serviceArea: {
      label: "Central and South Austin",
      zips: ["78701", "78702", "78703", "78704", "78705", "78741", "78745", "78748", "78749"],
    },
    referral: "For North Austin, Lakeline Plumbing is a team we trust: (512) 555-0177.",
    services: [
      {
        id: "drain",
        name: "Drain cleaning",
        keywords: ["drain", "clog", "clogged", "backed up", "backing up", "slow drain", "sink won't drain"],
        pricing: { kind: "flat", amount: 189 },
        avgTicket: 189,
      },
      {
        id: "water_heater",
        name: "Water heater repair",
        keywords: ["water heater", "no hot water", "hot water", "tankless", "pilot light"],
        pricing: { kind: "diagnostic", amount: 89, note: "credited toward the repair" },
        avgTicket: 640,
      },
      {
        id: "leak",
        name: "Leak repair",
        keywords: ["leak", "leaking", "drip", "dripping", "pipe", "faucet"],
        pricing: { kind: "diagnostic", amount: 89, note: "credited toward the repair" },
        avgTicket: 410,
      },
      {
        id: "toilet",
        name: "Toilet repair",
        keywords: ["toilet", "running toilet", "won't flush"],
        pricing: { kind: "flat", amount: 145 },
        avgTicket: 145,
      },
    ],
    emergencyKeywords: [
      "burst",
      "flooding",
      "flooded",
      "water everywhere",
      "sewage",
      "gas smell",
      "smell gas",
      "smells like gas",
      "ceiling is leaking",
    ],
  },
  {
    id: "summit",
    name: "Summit Heating & Air",
    trade: "HVAC",
    city: "Denver, CO",
    agentName: "Miles",
    accent: "#0F766E",
    transferNumber: "(303) 555-0142",
    serviceArea: {
      label: "Denver, Lakewood and Aurora",
      zips: ["80202", "80203", "80205", "80206", "80209", "80210", "80211", "80214", "80226", "80012"],
    },
    referral: "For areas north of I-76, Front Range Comfort covers it: (303) 555-0190.",
    services: [
      {
        id: "ac_repair",
        name: "AC repair",
        keywords: ["ac", "a/c", "air conditioning", "air conditioner", "not cooling", "blowing warm"],
        pricing: { kind: "diagnostic", amount: 99, note: "waived if you go ahead with the repair" },
        avgTicket: 520,
      },
      {
        id: "furnace",
        name: "Furnace repair",
        keywords: ["furnace", "heater", "heat", "no heat", "not heating", "heating"],
        pricing: { kind: "diagnostic", amount: 99, note: "waived if you go ahead with the repair" },
        avgTicket: 480,
      },
      {
        id: "tune_up",
        name: "Seasonal tune-up",
        keywords: ["tune up", "tune-up", "maintenance", "service my", "check up", "inspection"],
        pricing: { kind: "flat", amount: 129 },
        avgTicket: 129,
      },
    ],
    emergencyKeywords: ["gas smell", "smell gas", "carbon monoxide", "co alarm", "co detector", "smoke", "sparking"],
  },
  {
    id: "voltline",
    name: "Voltline Electric",
    trade: "Electrical",
    city: "Tampa, FL",
    agentName: "Nora",
    accent: "#B45309",
    transferNumber: "(813) 555-0163",
    serviceArea: {
      label: "Tampa and St. Petersburg",
      zips: ["33602", "33603", "33606", "33609", "33611", "33629", "33701", "33704", "33705"],
    },
    referral: "For Pasco County, Gulfline Electric is a good call: (727) 555-0128.",
    services: [
      {
        id: "outlet",
        name: "Outlet or switch repair",
        keywords: ["outlet", "switch", "plug", "receptacle", "gfci"],
        pricing: { kind: "flat", amount: 165 },
        avgTicket: 165,
      },
      {
        id: "panel",
        name: "Panel inspection",
        keywords: ["panel", "breaker", "tripping", "fuse box", "circuit"],
        pricing: { kind: "diagnostic", amount: 119, note: "credited toward any panel work" },
        avgTicket: 1350,
      },
      {
        id: "ev_charger",
        name: "EV charger install",
        keywords: ["ev charger", "car charger", "tesla charger", "level 2", "ev"],
        pricing: { kind: "flat", amount: 0 },
        avgTicket: 1800,
      },
    ],
    emergencyKeywords: ["sparking", "sparks", "burning smell", "smoke", "shock", "shocked", "fire"],
  },
];

export function getTenant(id: string): Tenant | undefined {
  return TENANTS.find((t) => t.id === id);
}

/** The only sentence the agent ever uses to state a price. */
export function priceLine(tenant: Tenant, serviceId: string): string {
  const s = tenant.services.find((x) => x.id === serviceId);
  if (!s) return "";
  if (s.pricing.kind === "flat") {
    return s.pricing.amount === 0
      ? `${s.name} starts with a free on-site quote from a licensed electrician`
      : `${s.name} is a flat $${s.pricing.amount}`;
  }
  return `${s.name} starts with a $${s.pricing.amount} diagnostic visit, ${s.pricing.note}`;
}

/** Dollar amounts the agent is permitted to say for this tenant. */
export function allowedAmounts(tenant: Tenant): Set<number> {
  return new Set(tenant.services.map((s) => s.pricing.amount));
}

/** "Drain cleaning" -> "drain cleaning", but "AC repair" stays as is. */
export function inSentence(name: string): string {
  const first = name.split(" ")[0];
  return first === first.toUpperCase() ? name : name.charAt(0).toLowerCase() + name.slice(1);
}
