import type { GmailTier, ServiceTier } from "./googleScopes";

// Permission tiers, weakest → strongest. An agent grant may never exceed the
// connected account's granted ceiling, so we clamp to the lower of the two.
const GMAIL_ORDER: GmailTier[] = ["none", "readonly", "draft", "full"];
const SERVICE_ORDER: ServiceTier[] = ["none", "readonly", "full"];

function lower<T extends string>(order: T[], a: T, b: T): T {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  const min = Math.min(ia < 0 ? 0 : ia, ib < 0 ? 0 : ib);
  return order[min];
}

export function clampGmail(requested: GmailTier, ceiling: GmailTier): GmailTier {
  return lower(GMAIL_ORDER, requested, ceiling);
}

export function clampService(
  requested: ServiceTier,
  ceiling: ServiceTier,
): ServiceTier {
  return lower(SERVICE_ORDER, requested, ceiling);
}

// The tiers a user may pick for a grant: everything up to and including the
// ceiling.
export function allowedGmailTiers(ceiling: GmailTier): GmailTier[] {
  return GMAIL_ORDER.slice(0, GMAIL_ORDER.indexOf(ceiling) + 1);
}

export function allowedServiceTiers(ceiling: ServiceTier): ServiceTier[] {
  return SERVICE_ORDER.slice(0, SERVICE_ORDER.indexOf(ceiling) + 1);
}
