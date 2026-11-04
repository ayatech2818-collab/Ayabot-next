"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "../../../components/icons";
import styles from "./ui.module.css";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; title: string; description?: string };
type ToastInput = Omit<Toast, "id" | "tone">;

type ToastApi = {
  success: (toast: ToastInput) => void;
  error: (toast: ToastInput) => void;
  info: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = { success: 4000, info: 4000, error: 7000 } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const push = (tone: ToastTone) => (toast: ToastInput) => {
      const id = ++nextId.current;
      // Keep the stack short; the newest toast matters most.
      setToasts(current => [...current.slice(-3), { ...toast, id, tone }]);
      window.setTimeout(() => dismiss(id), DURATION_MS[tone]);
    };
    return { success: push("success"), error: push("error"), info: push("info") };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.toastRegion} aria-live="polite" aria-relevant="additions">
        {toasts.map(toast => (
          <div key={toast.id} className={styles.toast} data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"}>
            <span className={styles.toastIcon} aria-hidden="true">
              {toast.tone === "error" ? (
                <AlertIcon size={16} />
              ) : toast.tone === "info" ? (
                <InfoIcon size={16} />
              ) : (
                <CheckIcon size={16} strokeWidth={2.4} />
              )}
            </span>
            <div className={styles.toastBody}>
              <strong>{toast.title}</strong>
              {toast.description && <p>{toast.description}</p>}
            </div>
            <button type="button" className={styles.toastClose} onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
