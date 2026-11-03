"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "../../../components/icons";
import styles from "./ui.module.css";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  size?: "sm" | "md";
  /** Blocks Esc/backdrop/close while a request is in flight. */
  busy?: boolean;
  /** When false, only explicit footer buttons can close the modal (no Esc/backdrop/X). */
  dismissible?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Native <dialog> modal: focus trapping, Esc and the top layer come from the browser. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  tone = "default",
  size = "md",
  busy = false,
  dismissible = true,
  children,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canDismiss = dismissible && !busy;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      data-size={size}
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
      onCancel={event => {
        event.preventDefault();
        if (canDismiss) onClose();
      }}
      onClick={event => {
        // A click on the ::backdrop targets the dialog element itself.
        if (event.target === event.currentTarget && canDismiss) onClose();
      }}
    >
      {open && (
        <div className={styles.modalPanel}>
          <header className={styles.modalHeader}>
            {icon && (
              <span className={styles.modalIcon} data-tone={tone} aria-hidden="true">
                {icon}
              </span>
            )}
            <div className={styles.modalHeading}>
              <h2 id="modal-title">{title}</h2>
              {description && <p id="modal-description">{description}</p>}
            </div>
            {dismissible && (
              <button type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Close">
                <CloseIcon size={16} />
              </button>
            )}
          </header>
          <div className={styles.modalBody}>{children}</div>
          {footer && <footer className={styles.modalFooter}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
