import type { Slot, Tenant } from "./types";

// Stand-in for a calendar integration (Google Calendar, Jobber, ServiceTitan).
// Deterministic for a given tenant and date so tests and demos are repeatable.

const WINDOWS = ["8–10am", "10am–12pm", "1–3pm", "3–5pm"];

export function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const labelFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Slots for the next three working days (Mon–Sat), starting tomorrow. */
export function getSlots(tenant: Tenant, now: Date): Slot[] {
  const slots: Slot[] = [];
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let added = 0;
  while (added < 3) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() === 0) continue; // closed Sundays
    const date = day.toISOString().slice(0, 10);
    const dayLabel = labelFmt.format(day);
    for (const window of WINDOWS) {
      const id = `${date}_${WINDOWS.indexOf(window)}`;
      slots.push({
        id,
        date,
        window,
        label: `${dayLabel}, ${window}`,
        available: hash(`${tenant.id}:${id}`) % 3 !== 0,
      });
    }
    added++;
  }
  return slots;
}

/** Three open slots to offer: the earliest on each of the next days, so the caller gets a real choice. */
export function offerSlots(tenant: Tenant, now: Date): Slot[] {
  const open = getSlots(tenant, now).filter((s) => s.available);
  const picked: Slot[] = [];
  for (const s of open) {
    if (picked.length < 3 && !picked.some((p) => p.date === s.date)) picked.push(s);
  }
  for (const s of open) {
    if (picked.length < 3 && !picked.includes(s)) picked.push(s);
  }
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}

export function findSlot(tenant: Tenant, now: Date, slotId: string): Slot | undefined {
  return getSlots(tenant, now).find((s) => s.id === slotId);
}

export function bookingRef(tenantId: string, slotId: string, phone: string): string {
  return `SW-${(hash(`${tenantId}:${slotId}:${phone}`) % 90000 + 10000).toString()}`;
}
