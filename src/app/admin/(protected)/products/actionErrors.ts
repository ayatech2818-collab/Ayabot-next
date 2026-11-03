import "server-only";

import { ApiError } from "../../../../lib/api/errors";
import { redirectOnAuthError } from "../../../../lib/auth/admin";

export type ActionFailure<Field extends string = string> = {
  ok: false;
  error: string;
  fieldErrors?: Partial<Record<Field, string>>;
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FailureOptions<Field extends string> = {
  notFound: string;
  /** Turns a 409 message into a field error (e.g. a taken slug); return null to use a toast. */
  conflictField?: (message: string) => { field: Field; error: string; fieldError: string } | null;
};

/**
 * Shared mapping of backend failures for admin server actions. 401/403 end the session (same
 * behaviour as requireAdmin); everything else becomes a message the UI can show.
 * Unexpected (non-API) errors are re-thrown so they aren't silently swallowed.
 */
export function toActionFailure<Field extends string>(error: unknown, options: FailureOptions<Field>): ActionFailure<Field> {
  redirectOnAuthError(error);
  if (!(error instanceof ApiError)) throw error;

  if (error.kind === "not_found") return { ok: false, error: options.notFound };

  if (error.status === 409) {
    const conflict = options.conflictField?.(error.message);
    if (conflict) {
      return { ok: false, error: conflict.error, fieldErrors: { [conflict.field]: conflict.fieldError } as Partial<Record<Field, string>> };
    }
    return { ok: false, error: error.message };
  }

  if (error.kind === "validation") return { ok: false, error: error.message || "Please check the form and try again." };
  if (error.kind === "network") return { ok: false, error: error.message };
  return { ok: false, error: "The AYABOT server couldn't complete the request. Please try again." };
}
