import type { CallState } from "../types";

export type RequiredField = "serviceId" | "name" | "zip" | "phone";

/** Order the agent collects details in. Booking is impossible until all are set. */
export const REQUIRED_FIELDS: RequiredField[] = ["serviceId", "name", "zip", "phone"];

export function nextMissingField(fields: CallState["fields"]): RequiredField | null {
  return REQUIRED_FIELDS.find((f) => !fields[f]) ?? null;
}

export function missingFields(fields: CallState["fields"]): RequiredField[] {
  return REQUIRED_FIELDS.filter((f) => !fields[f]);
}

export const FIELD_LABELS: Record<RequiredField, string> = {
  serviceId: "service",
  name: "name",
  zip: "ZIP code",
  phone: "callback number",
};
