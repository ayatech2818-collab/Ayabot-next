import { AlertIcon, CheckIcon, ClockIcon } from "../../../../../components/icons";
import type { KnowledgeDocumentStatus } from "../../../../../lib/api/knowledge";
import { STATUS_LABELS } from "../../../../../lib/knowledge/documents";
import styles from "../knowledge.module.css";

/** Pending (waiting), Processing (spinner), Completed (check) or Failed (alert). */
export default function DocumentStatusBadge({ status }: { status: KnowledgeDocumentStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {status === "processing" ? (
        <span className={styles.statusSpinner} aria-hidden="true" />
      ) : status === "completed" ? (
        <CheckIcon size={12} strokeWidth={2.8} />
      ) : status === "failed" ? (
        <AlertIcon size={12} strokeWidth={2.4} />
      ) : (
        <ClockIcon size={12} strokeWidth={2.4} />
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
