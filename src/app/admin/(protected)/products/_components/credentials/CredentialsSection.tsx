"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertIcon, BanIcon, InfoIcon, KeyIcon, PlusIcon } from "../../../../../../components/icons";
import type { Credential } from "../../../../../../lib/api/credentials";
import {
  EXPIRING_SOON_DAYS,
  credentialState,
  credentialStatus,
  relativeTime,
  type CredentialStatus,
} from "../../../../../../lib/products/credentialValidation";
import { formatDate, formatDateTime } from "../ProductBits";
import ApiKeyRevealDialog, { type RevealedKey } from "./ApiKeyRevealDialog";
import CredentialDetailsDialog from "./CredentialDetailsDialog";
import CredentialStatusBadges from "./CredentialStatusBadges";
import GenerateCredentialDialog from "./GenerateCredentialDialog";
import RevokeCredentialDialog from "./RevokeCredentialDialog";
import productStyles from "../../products.module.css";
import ui from "../../../../_components/ui.module.css";
import styles from "./credentials.module.css";

type Filter = CredentialStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
  { value: "all", label: "All" },
];

const EMPTY_FILTER_COPY: Record<CredentialStatus, string> = {
  active: "There are no usable keys. Generate a new one to connect a service.",
  expired: "None of this product's keys have expired.",
  revoked: "No keys have been revoked.",
};

type CredentialsSectionProps = {
  productId: string;
  productName: string;
  productActive: boolean;
  /** Active and revoked credentials (metadata only - never the raw key), or null if loading failed. */
  credentials: Credential[] | null;
  loadError?: string;
};

/**
 * API keys for one product: list, details, generate and revoke. The list is server data;
 * actions revalidate the page so it re-renders with fresh metadata. A raw key from a generate
 * call is held only in `revealed` until the admin dismisses the one-time dialog.
 */
export default function CredentialsSection({ productId, productName, productActive, credentials, loadError }: CredentialsSectionProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [filter, setFilter] = useState<Filter>("active");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Credential | null>(null);

  const list = useMemo(() => credentials ?? [], [credentials]);

  const counts = useMemo(() => {
    const result = { active: 0, expired: 0, revoked: 0, all: list.length, expiringSoon: 0 };
    for (const credential of list) {
      const state = credentialState(credential);
      result[state.status]++;
      if (state.expiringSoon) result.expiringSoon++;
    }
    return result;
  }, [list]);

  const visible = useMemo(
    () => (filter === "all" ? list : list.filter(credential => credentialStatus(credential) === filter)),
    [list, filter],
  );

  // Looked up by id so the open details reflect fresh data after a revalidation.
  const details = detailsId ? list.find(credential => credential.id === detailsId) ?? null : null;

  const askRevoke = (credential: Credential) => {
    setDetailsId(null);
    setRevokeTarget(credential);
  };

  const generateButton = (
    <button
      type="button"
      className={ui.primaryButton}
      onClick={() => setGenerateOpen(true)}
      disabled={!productActive}
      title={productActive ? undefined : "Restore the product to generate API keys"}
    >
      <PlusIcon size={16} strokeWidth={2.4} />
      Generate API key
    </button>
  );

  return (
    <section id="credentials" className={`${productStyles.card} ${styles.section}`} aria-labelledby="credentials-title">
      <div className={styles.header}>
        <div>
          <h2 id="credentials-title" className={productStyles.cardTitle}>
            API credentials
          </h2>
          <p className={styles.subtitle}>Keys that let services authenticate as {productName}.</p>
        </div>
        {generateButton}
      </div>

      {!productActive && (
        <p className={styles.notice} role="status">
          This product is inactive. Restore it to generate new API keys.
        </p>
      )}

      {credentials === null ? (
        <div className={productStyles.empty} role="alert">
          <span className={productStyles.emptyIcon} data-tone="danger" aria-hidden="true">
            <AlertIcon size={24} strokeWidth={1.6} />
          </span>
          <h3>Couldn&apos;t load API credentials</h3>
          <p>{loadError ?? "The AYABOT server couldn't be reached. Please try again."}</p>
          <button
            type="button"
            className={ui.secondaryButton}
            onClick={() => startRetry(() => router.refresh())}
            disabled={retrying}
            aria-busy={retrying}
          >
            {retrying && <span className={ui.spinner} aria-hidden="true" />}
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className={styles.filterBar}>
            <div className={productStyles.segmented} role="tablist" aria-label="Filter API keys">
              {FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={productStyles.segment}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span className={productStyles.segmentCount}>{counts[value]}</span>
                </button>
              ))}
            </div>
            {counts.expiringSoon > 0 && (
              <p className={styles.expiringHint}>
                <span className={styles.status} data-status="expiring">
                  {counts.expiringSoon}
                </span>
                key{counts.expiringSoon === 1 ? "" : "s"} expire{counts.expiringSoon === 1 ? "s" : ""} within {EXPIRING_SOON_DAYS} days
              </p>
            )}
          </div>

          {visible.length === 0 ? (
            <div className={productStyles.empty}>
              <span className={productStyles.emptyIcon} aria-hidden="true">
                <KeyIcon size={24} strokeWidth={1.6} />
              </span>
              {counts.all === 0 ? (
                <>
                  <h3>No API keys yet</h3>
                  <p>Generate a key to let a service connect to {productName}.</p>
                  {productActive && generateButton}
                </>
              ) : (
                <>
                  <h3>No {filter} keys</h3>
                  <p>{filter !== "all" && EMPTY_FILTER_COPY[filter]}</p>
                </>
              )}
            </div>
          ) : (
            <ul className={styles.list} aria-label="API keys">
              {visible.map(credential => {
                const state = credentialState(credential);
                return (
                  <li key={credential.id} className={styles.item} data-status={state.status} data-expiring={state.expiringSoon}>
                    <span className={styles.keyMark} aria-hidden="true">
                      <KeyIcon size={17} />
                    </span>
                    <div className={styles.identity}>
                      <div className={styles.nameRow}>
                        <button type="button" className={styles.nameButton} onClick={() => setDetailsId(credential.id)}>
                          {credential.name}
                        </button>
                        <CredentialStatusBadges credential={credential} />
                      </div>
                      <code className={styles.prefix} title="Key prefix - the rest of the key is never shown again">
                        {credential.key_prefix}
                        <span aria-hidden="true">••••••••</span>
                      </code>
                    </div>
                    <dl className={styles.dates}>
                      <div>
                        <dt>Created</dt>
                        <dd>
                          <time dateTime={credential.created_at}>{formatDate(credential.created_at)}</time>
                        </dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd data-tone={state.status === "expired" ? "danger" : state.expiringSoon ? "warning" : undefined}>
                          {credential.expires_at ? (
                            <time dateTime={credential.expires_at} title={formatDateTime(credential.expires_at)}>
                              {state.status === "active" && state.expiringSoon
                                ? relativeTime(credential.expires_at)
                                : formatDate(credential.expires_at)}
                            </time>
                          ) : (
                            "Never"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Last used</dt>
                        <dd>
                          {credential.last_used_at ? (
                            <time dateTime={credential.last_used_at} title={formatDateTime(credential.last_used_at)}>
                              {relativeTime(credential.last_used_at)}
                            </time>
                          ) : (
                            "Never"
                          )}
                        </dd>
                      </div>
                      {credential.revoked_at && (
                        <div>
                          <dt>Revoked</dt>
                          <dd>
                            <time dateTime={credential.revoked_at}>{formatDate(credential.revoked_at)}</time>
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={ui.iconButton}
                        onClick={() => setDetailsId(credential.id)}
                        aria-label={`Details for ${credential.name}`}
                        title="Details"
                      >
                        <InfoIcon size={15} />
                      </button>
                      {credential.is_active && (
                        <button
                          type="button"
                          className={ui.iconButton}
                          data-tone="danger"
                          onClick={() => askRevoke(credential)}
                          aria-label={`Revoke ${credential.name}`}
                          title="Revoke"
                        >
                          <BanIcon size={15} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <GenerateCredentialDialog
        open={generateOpen}
        productId={productId}
        productName={productName}
        onClose={() => setGenerateOpen(false)}
        onCreated={created => {
          setGenerateOpen(false);
          setFilter("active");
          // Hand the raw key straight to the one-time dialog; nothing else keeps a copy.
          setRevealed({ id: created.id, name: created.name, apiKey: created.api_key });
        }}
      />
      <ApiKeyRevealDialog revealed={revealed} onDone={() => setRevealed(null)} />
      <CredentialDetailsDialog credential={details} onClose={() => setDetailsId(null)} onRevoke={askRevoke} />
      <RevokeCredentialDialog credential={revokeTarget} onClose={() => setRevokeTarget(null)} />
    </section>
  );
}
