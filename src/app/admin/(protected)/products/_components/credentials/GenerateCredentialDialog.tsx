"use client";

import { useState, useTransition } from "react";
import { AlertIcon, KeyIcon } from "../../../../../../components/icons";
import type { CreatedCredential } from "../../../../../../lib/api/credentials";
import {
  CREDENTIAL_NAME_MAX,
  EXPIRY_PRESETS,
  resolveExpiry,
  todayInputValue,
  validateCredentialValues,
  type CredentialFieldErrors,
  type CredentialFormValues,
} from "../../../../../../lib/products/credentialValidation";
import Modal from "../../../../_components/Modal";
import { createCredentialAction } from "../../credentialActions";
import ui from "../../../../_components/ui.module.css";
import styles from "./credentials.module.css";

type GenerateCredentialDialogProps = {
  open: boolean;
  productId: string;
  productName: string;
  onClose: () => void;
  /** Receives the one-time response, including the raw key. The caller must not persist it. */
  onCreated: (credential: CreatedCredential) => void;
};

const INITIAL: CredentialFormValues = { name: "", expiry: "never", customDate: "" };

export default function GenerateCredentialDialog({ open, productId, productName, onClose, onCreated }: GenerateCredentialDialogProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      icon={<KeyIcon size={18} />}
      title="Generate API key"
      description={`Create a new key for ${productName}. You'll see the full key once, right after it's generated.`}
    >
      {open && (
        <GenerateForm
          productId={productId}
          pending={pending}
          startTransition={startTransition}
          onCancel={onClose}
          onCreated={onCreated}
        />
      )}
    </Modal>
  );
}

function GenerateForm({
  productId,
  pending,
  startTransition,
  onCancel,
  onCreated,
}: {
  productId: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onCancel: () => void;
  onCreated: (credential: CreatedCredential) => void;
}) {
  const [values, setValues] = useState<CredentialFormValues>(INITIAL);
  const [errors, setErrors] = useState<CredentialFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const update = (patch: Partial<CredentialFormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    setFormError(null);
    if (submitted) setErrors(validateCredentialValues(next));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateCredentialValues(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    startTransition(async () => {
      try {
        const result = await createCredentialAction(productId, { name: values.name, expiresAt: resolveExpiry(values) });
        if (result.ok) {
          onCreated(result.credential);
        } else {
          setFormError(result.error);
          if (result.fieldErrors) setErrors(result.fieldErrors);
        }
      } catch {
        setFormError("Something went wrong. Check your connection and try again.");
      }
    });
  };

  const expiresAt = values.expiry !== "custom" ? resolveExpiry(values) : null;

  return (
    <form onSubmit={submit} noValidate className={ui.formStack}>
      {formError && (
        <div className={ui.inlineError} role="alert">
          <AlertIcon size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className={ui.field}>
        <label htmlFor="credential-name" className={ui.fieldLabel}>
          Key name <span aria-hidden="true">*</span>
        </label>
        <input
          id="credential-name"
          className={ui.textInput}
          value={values.name}
          onChange={event => update({ name: event.target.value })}
          placeholder="e.g. Production server"
          maxLength={CREDENTIAL_NAME_MAX + 10}
          autoComplete="off"
          autoFocus
          disabled={pending}
          aria-invalid={Boolean(errors.name)}
          aria-describedby="credential-name-hint"
        />
        <p id="credential-name-hint" className={errors.name ? ui.fieldError : ui.fieldHint}>
          {errors.name ?? "Describe where the key will be used so you can recognise it later."}
        </p>
      </div>

      <fieldset className={`${ui.field} ${styles.expiryFieldset}`} disabled={pending}>
        <legend className={ui.fieldLabel}>Expiration</legend>
        <div className={styles.expiryOptions} role="radiogroup" aria-label="Expiration">
          {EXPIRY_PRESETS.map(option => (
            <label key={option.value} className={styles.expiryOption} data-checked={values.expiry === option.value}>
              <input
                type="radio"
                name="expiry"
                value={option.value}
                checked={values.expiry === option.value}
                onChange={() => update({ expiry: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>

        {values.expiry === "custom" ? (
          <>
            <input
              type="date"
              className={ui.textInput}
              value={values.customDate}
              min={todayInputValue()}
              onChange={event => update({ customDate: event.target.value })}
              aria-label="Expiration date"
              aria-invalid={Boolean(errors.customDate)}
              aria-describedby="credential-expiry-hint"
            />
            <p id="credential-expiry-hint" className={errors.customDate ? ui.fieldError : ui.fieldHint}>
              {errors.customDate ?? "The key stops working at the end of this day."}
            </p>
          </>
        ) : (
          <p className={ui.fieldHint}>
            {expiresAt
              ? `Expires ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(expiresAt))}.`
              : "The key stays valid until you revoke it."}
          </p>
        )}
      </fieldset>

      <div className={ui.formActions}>
        <button type="button" className={ui.secondaryButton} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={ui.primaryButton} disabled={pending} aria-busy={pending}>
          {pending ? <span className={ui.spinner} aria-hidden="true" /> : <KeyIcon size={15} />}
          {pending ? "Generating…" : "Generate key"}
        </button>
      </div>
    </form>
  );
}
