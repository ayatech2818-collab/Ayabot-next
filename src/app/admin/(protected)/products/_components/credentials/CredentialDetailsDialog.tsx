"use client";

import { BanIcon, KeyIcon } from "../../../../../../components/icons";
import type { Credential } from "../../../../../../lib/api/credentials";
import { credentialState, relativeTime } from "../../../../../../lib/products/credentialValidation";
import Modal from "../../../../_components/Modal";
import { formatDateTime } from "../ProductBits";
import CredentialStatusBadges from "./CredentialStatusBadges";
import ui from "../../../../_components/ui.module.css";
import styles from "./credentials.module.css";

type CredentialDetailsDialogProps = {
  credential: Credential | null;
  onClose: () => void;
  onRevoke: (credential: Credential) => void;
};

/** Read-only metadata for one key. The backend never returns the raw key or its hash. */
export default function CredentialDetailsDialog({
  credential,
  onClose,
  onRevoke,
}: CredentialDetailsDialogProps) {
  const state = credential ? credentialState(credential) : null;

  return (
    <Modal
      open={Boolean(credential)}
      onClose={onClose}
      icon={<KeyIcon size={18} />}
      title={credential?.name ?? "API key"}
      description="Key metadata. The full key was shown only once, when it was created."
      footer={
        credential && (
          <>
            {credential.is_active && (
              <button type="button" className={ui.dangerOutlineButton} onClick={() => onRevoke(credential)}>
                <BanIcon size={14} />
                Revoke
              </button>
            )}
            <button type="button" className={ui.primaryButton} onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      {credential && state && (
        <dl className={styles.detailList}>
          <div>
            <dt>Status</dt>
            <dd>
              <CredentialStatusBadges credential={credential} />
            </dd>
          </div>
          <div>
            <dt>Key prefix</dt>
            <dd>
              <code className={styles.prefix}>
                {credential.key_prefix}
                <span aria-hidden="true">••••••••</span>
              </code>
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={credential.created_at}>{formatDateTime(credential.created_at)}</time>
            </dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              {credential.expires_at ? (
                <span className={styles.dateWithHint}>
                  <time dateTime={credential.expires_at}>{formatDateTime(credential.expires_at)}</time>
                  <small data-tone={state.status === "expired" ? "danger" : state.expiringSoon ? "warning" : undefined}>
                    {state.status === "expired" ? "Expired " : "Expires "}
                    {relativeTime(credential.expires_at)}
                  </small>
                </span>
              ) : (
                "Never"
              )}
            </dd>
          </div>
          <div>
            <dt>Last used</dt>
            <dd>
              {credential.last_used_at ? (
                <span className={styles.dateWithHint}>
                  <time dateTime={credential.last_used_at}>{formatDateTime(credential.last_used_at)}</time>
                  <small>{relativeTime(credential.last_used_at)}</small>
                </span>
              ) : (
                "Never used"
              )}
            </dd>
          </div>
          {credential.revoked_at && (
            <div>
              <dt>Revoked</dt>
              <dd>
                <time dateTime={credential.revoked_at}>{formatDateTime(credential.revoked_at)}</time>
              </dd>
            </div>
          )}
          <div>
            <dt>Credential ID</dt>
            <dd>
              <code className={styles.idCode}>{credential.id}</code>
            </dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}
