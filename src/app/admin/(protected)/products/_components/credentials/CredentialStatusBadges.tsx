import type { Credential } from "../../../../../../lib/api/credentials";
import { credentialState } from "../../../../../../lib/products/credentialValidation";
import styles from "./credentials.module.css";

const STATUS_LABEL = { active: "Active", expired: "Expired", revoked: "Revoked" } as const;

/** Active / Expired / Revoked, plus "Expiring soon" for active keys within 7 days of expiry. */
export default function CredentialStatusBadges({ credential }: { credential: Pick<Credential, "is_active" | "expires_at"> }) {
  const { status, expiringSoon } = credentialState(credential);
  return (
    <span className={styles.badges}>
      <span className={styles.status} data-status={status}>
        {STATUS_LABEL[status]}
      </span>
      {expiringSoon && (
        <span className={styles.status} data-status="expiring">
          Expiring soon
        </span>
      )}
    </span>
  );
}
