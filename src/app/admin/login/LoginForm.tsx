"use client";

import { useActionState, useState } from "react";
import { AlertIcon, EyeIcon, LockIcon, MailIcon } from "../../../components/icons";
import { login, type LoginState } from "../actions";
import styles from "../admin.module.css";

const INITIAL_STATE: LoginState = {};

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(login, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={nextPath} />

      {state.error && (
        <div className={styles.formError} role="alert" id="login-error">
          <AlertIcon size={16} />
          <span>{state.error}</span>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <div className={styles.inputWrap}>
          <MailIcon size={16} className={styles.inputIcon} />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@ayadi.edu"
            defaultValue={state.email}
            // Remount after each attempt so defaultValue reflects the submitted email.
            key={state.email ?? ""}
            required
            autoFocus
            disabled={pending}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "login-error" : undefined}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <div className={styles.inputWrap}>
          <LockIcon size={16} className={styles.inputIcon} />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            disabled={pending}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "login-error" : undefined}
            className={styles.input}
          />
          <button
            type="button"
            className={styles.inputAction}
            onClick={() => setShowPassword(value => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <EyeIcon size={16} off={showPassword} />
          </button>
        </div>
      </div>

      <button type="submit" className={styles.primaryButton} disabled={pending} aria-busy={pending}>
        {pending && <span className={styles.spinner} aria-hidden="true" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
