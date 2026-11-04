// Shared by the Generate API key form and its server action.
// Limits mirror CredentialCreate in ayabot-backend/app/schemas/product_credential.py.

export const CREDENTIAL_NAME_MIN = 2;
export const CREDENTIAL_NAME_MAX = 100;

export const EXPIRY_PRESETS = [
  { value: "never", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "custom", label: "Custom date" },
] as const;

export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]["value"];

export type CredentialFormValues = {
  name: string;
  expiry: ExpiryPreset;
  /** yyyy-mm-dd from <input type="date">, used when expiry is "custom". */
  customDate: string;
};

export type CredentialField = "name" | "customDate";
export type CredentialFieldErrors = Partial<Record<CredentialField, string>>;

/** Today as yyyy-mm-dd in the admin's timezone, for the date input's `min`. */
export function todayInputValue(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Turns the form's expiry choice into the ISO timestamp the backend expects.
 * A custom date means "valid through that day", so it expires at the end of the day (local time).
 */
export function resolveExpiry(values: Pick<CredentialFormValues, "expiry" | "customDate">, now = new Date()): string | null {
  if (values.expiry === "never") return null;
  if (values.expiry === "custom") {
    const [year, month, day] = values.customDate.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  }
  return new Date(now.getTime() + Number(values.expiry) * 86_400_000).toISOString();
}

export function validateCredentialValues(values: CredentialFormValues, now = new Date()): CredentialFieldErrors {
  const errors: CredentialFieldErrors = {};
  const name = values.name.trim();

  if (!name) errors.name = "Name is required.";
  else if (name.length < CREDENTIAL_NAME_MIN) errors.name = `Name must be at least ${CREDENTIAL_NAME_MIN} characters.`;
  else if (name.length > CREDENTIAL_NAME_MAX) errors.name = `Name must be ${CREDENTIAL_NAME_MAX} characters or fewer.`;

  if (values.expiry === "custom") {
    const expiresAt = resolveExpiry(values, now);
    if (!values.customDate || !expiresAt) errors.customDate = "Choose an expiration date.";
    else if (new Date(expiresAt) <= now) errors.customDate = "The expiration date must be in the future.";
  }

  return errors;
}

export const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export type CredentialStatus = "active" | "expired" | "revoked";

type CredentialDates = { is_active: boolean; expires_at: string | null };

/**
 * Derived display status. The backend keeps expired keys `is_active`, so the expiry date is
 * checked too: revoked wins, then expired, otherwise active.
 */
export function credentialStatus(credential: CredentialDates, now = Date.now()): CredentialStatus {
  if (!credential.is_active) return "revoked";
  if (credential.expires_at && new Date(credential.expires_at).getTime() <= now) return "expired";
  return "active";
}

/** Status plus an "expiring soon" flag for active keys that expire within EXPIRING_SOON_DAYS. */
export function credentialState(credential: CredentialDates, now = Date.now()) {
  const status = credentialStatus(credential, now);
  const msUntilExpiry = credential.expires_at ? new Date(credential.expires_at).getTime() - now : null;
  const expiringSoon = status === "active" && msUntilExpiry !== null && msUntilExpiry <= EXPIRING_SOON_DAYS * DAY_MS;
  return { status, expiringSoon, msUntilExpiry };
}

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 3 days", "tomorrow", "2 hours ago"... for expiry and last-used hints. */
export function relativeTime(value: string, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const diff = time - now;
  const abs = Math.abs(diff);
  if (abs < 3_600_000) return relativeFormat.format(Math.round(diff / 60_000), "minute");
  if (abs < DAY_MS) return relativeFormat.format(Math.round(diff / 3_600_000), "hour");
  return relativeFormat.format(Math.round(diff / DAY_MS), "day");
}

