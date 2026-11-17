/**
 * Username + password login without email or OTP.
 * Every account has a synthetic, never-mailed address <username>@vehicle.local.
 */
export const USERNAME_DOMAIN = "vehicle.local";

/** "Khaleel Ahmed" -> "khaleel.ahmed"; an input that already contains "@" is used as-is. */
export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ".");
}

export function usernameToEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${normaliseUsername(v)}@${USERNAME_DOMAIN}`;
}
