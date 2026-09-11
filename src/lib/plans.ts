export const plans = {
  solo: { id: "solo", name: "Solo", priceCents: 500, mailboxes: 1 },
  duo: { id: "duo", name: "Duo", priceCents: 900, mailboxes: 2 },
} as const;
export type PlanId = keyof typeof plans;
export function isPlanId(value: unknown): value is PlanId {
  return value === "solo" || value === "duo";
}
export function mailboxLimit(plan: unknown) {
  return isPlanId(plan) ? plans[plan].mailboxes : 1;
}
