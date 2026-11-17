"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  FileUpIcon,
  InfoIcon,
  RefreshIcon,
  ResetIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "../../../../../components/icons";
import { apiFetch } from "../../../../../lib/api/browser";
import { ApiError } from "../../../../../lib/api/errors";
import type { KnowledgeDocument, KnowledgeDocumentDetail } from "../../../../../lib/api/knowledge";
import type { Product } from "../../../../../lib/api/products";
import { canReplace, canRetry, fileTypeLabel, formatFileSize, isInProgress, isLikelyStuck } from "../../../../../lib/knowledge/documents";
import { useToast } from "../../../_components/Toaster";
import { formatDateTime } from "../../products/_components/ProductBits";
import { reprocessKnowledgeDocumentAction, retryKnowledgeDocumentAction } from "../actions";
import DeleteDocumentDialog from "./DeleteDocumentDialog";
import DocumentDetailsDialog from "./DocumentDetailsDialog";
import DocumentStatusBadge from "./DocumentStatusBadge";
import DocumentUploadDialog from "./DocumentUploadDialog";
import { FileTypeTile } from "./FileDropzone";
import ReplaceDocumentDialog from "./ReplaceDocumentDialog";
import ReprocessDocumentDialog from "./ReprocessDocumentDialog";
import RetryDocumentDialog from "./RetryDocumentDialog";
import productStyles from "../../products/products.module.css";
import ui from "../../../_components/ui.module.css";
import styles from "../knowledge.module.css";

export type KnowledgeProduct = Pick<Product, "id" | "name" | "slug" | "is_active">;

/** How often the list is re-fetched while any document is pending or processing. */
const POLL_INTERVAL_MS = 4000;
/** Parallel GET /knowledge/documents/{id} calls when filling in chunk counts. */
const DETAIL_CONCURRENCY = 4;

type Filter = "all" | "completed" | "in_progress" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "failed", label: "Failed" },
];

type DetailEntry = {
  /** The list version (status + updated_at) this entry was fetched for. */
  stamp: string;
  detail?: KnowledgeDocumentDetail;
  error?: string;
};

const stampOf = (doc: KnowledgeDocument) => `${doc.status}|${doc.updated_at}`;
const documentsUrl = (productId: string) => `/knowledge/documents?${new URLSearchParams({ product_id: productId })}`;
const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Check your connection and try again.";

function matchesFilter(doc: KnowledgeDocument, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "in_progress") return isInProgress(doc.status);
  return doc.status === filter;
}

/** A clock for "may be stuck" hints. Null until mounted, so server and client render the same. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

type KnowledgeManagerProps = {
  /** Active products first; the selector lists inactive ones separately. */
  products: KnowledgeProduct[];
  productId: string;
  /** First page from the server render, or null if it couldn't be loaded. */
  initialDocuments: KnowledgeDocument[] | null;
  loadError?: string;
};

/**
 * Knowledge documents for one product. The list starts as server data and then lives in client
 * state: it's re-fetched through the /api/backend BFF every few seconds while anything is pending
 * or processing, after every change, and on demand. Chunk counts come from the per-document
 * details endpoint and are cached per document version, so polling doesn't refetch them.
 */
export default function KnowledgeManager({ products, productId, initialDocuments, loadError }: KnowledgeManagerProps) {
  const router = useRouter();
  const toast = useToast();
  const product = products.find(p => p.id === productId) ?? products[0];

  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(initialDocuments);
  const [syncError, setSyncError] = useState<string | null>(initialDocuments ? null : (loadError ?? "Documents couldn't be loaded."));
  const [details, setDetails] = useState<Record<string, DetailEntry>>({});
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [retryConfirmId, setRetryConfirmId] = useState<string | null>(null);
  const [reprocessConfirmId, setReprocessConfirmId] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState(productId);
  const [switching, startSwitch] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  /** Bumped by every fetch and local change; a response from an older request is discarded. */
  const listVersion = useRef(0);
  const polling = useRef(false);
  /** Document version each detail request was made for, so one version is fetched only once. */
  const requestedDetails = useRef(new Map<string, string>());

  const now = useNow(30_000);

  // ----- Document list -----

  const fetchDocuments = useCallback(async () => {
    const version = ++listVersion.current;
    try {
      const next = await apiFetch<KnowledgeDocument[]>(documentsUrl(productId));
      if (version === listVersion.current) {
        setDocuments(next);
        setSyncError(null);
      }
      return true;
    } catch (error) {
      if (version === listVersion.current) setSyncError(messageOf(error));
      return false;
    }
  }, [productId]);

  /** Insert or update one document from a mutation response, then confirm with a fresh list. */
  const applyDocument = useCallback(
    (doc: KnowledgeDocument) => {
      listVersion.current++;
      setDocuments(current => {
        const list = current ?? [];
        return list.some(item => item.id === doc.id) ? list.map(item => (item.id === doc.id ? doc : item)) : [doc, ...list];
      });
      void fetchDocuments();
    },
    [fetchDocuments],
  );

  const removeDocument = useCallback(
    (documentId: string) => {
      listVersion.current++;
      setDocuments(current => current?.filter(item => item.id !== documentId) ?? current);
      requestedDetails.current.delete(documentId);
      void fetchDocuments();
    },
    [fetchDocuments],
  );

  const hasActive = documents?.some(doc => isInProgress(doc.status)) ?? false;

  // Poll while something is pending/processing; stops by itself once everything is terminal.
  // Paused while the tab is hidden, and refreshed immediately when it becomes visible again.
  useEffect(() => {
    if (!hasActive) return;
    const poll = async () => {
      if (polling.current || window.document.visibilityState !== "visible") return;
      polling.current = true;
      try {
        await fetchDocuments();
      } finally {
        polling.current = false;
      }
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (window.document.visibilityState === "visible") void poll();
    };
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasActive, fetchDocuments]);

  const refresh = () => {
    startRefresh(async () => {
      // Manual refresh also re-reads chunk counts (and retries any that failed).
      requestedDetails.current.clear();
      const ok = await fetchDocuments();
      if (!ok) toast.error({ title: "Couldn't refresh documents", description: "Showing the last loaded list. Try again shortly." });
    });
  };

  // ----- Details (chunk counts) -----

  const loadDetail = useCallback(
    async (doc: KnowledgeDocument) => {
      const stamp = stampOf(doc);
      if (requestedDetails.current.get(doc.id) === stamp) return;
      requestedDetails.current.set(doc.id, stamp);
      try {
        const detail = await apiFetch<KnowledgeDocumentDetail>(`/knowledge/documents/${encodeURIComponent(doc.id)}`);
        setDetails(current => ({ ...current, [doc.id]: { stamp, detail } }));
      } catch (error) {
        if (error instanceof ApiError && error.kind === "not_found") {
          removeDocument(doc.id);
          return;
        }
        setDetails(current => ({ ...current, [doc.id]: { stamp, detail: current[doc.id]?.detail, error: messageOf(error) } }));
      }
    },
    [removeDocument],
  );

  const reloadDetail = useCallback(
    (doc: KnowledgeDocument) => {
      requestedDetails.current.delete(doc.id);
      void loadDetail(doc);
    },
    [loadDetail],
  );

  // Chunk counts for settled documents, a few at a time. Re-runs are cheap: versions already
  // requested are skipped, so polling an unchanged list fetches nothing.
  useEffect(() => {
    const queue = (documents ?? []).filter(doc => !isInProgress(doc.status) && requestedDetails.current.get(doc.id) !== stampOf(doc));
    if (!queue.length) return;
    let cancelled = false;
    void (async () => {
      for (let start = 0; start < queue.length && !cancelled; start += DETAIL_CONCURRENCY) {
        await Promise.all(queue.slice(start, start + DETAIL_CONCURRENCY).map(loadDetail));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documents, loadDetail]);

  const byId = useCallback((id: string | null) => (id ? documents?.find(doc => doc.id === id) ?? null : null), [documents]);
  const detailsDoc = byId(detailsId);
  const replaceDoc = byId(replaceId);
  const deleteDoc = byId(deleteId);
  const retryConfirmDoc = byId(retryConfirmId);
  const reprocessConfirmDoc = byId(reprocessConfirmId);

  // The open details dialog always shows current counts, including for in-progress documents.
  useEffect(() => {
    if (detailsDoc) void loadDetail(detailsDoc);
  }, [detailsDoc, loadDetail]);

  // ----- Actions -----

  /** Synchronous guard against double clicks; `busyIds` drives the disabled/spinner state. */
  const retrying = useRef(new Set<string>());

  const setBusy = (documentId: string, busy: boolean) => {
    if (busy) retrying.current.add(documentId);
    else retrying.current.delete(documentId);
    setBusyIds(new Set(retrying.current));
  };

  const runRetry = async (doc: KnowledgeDocument) => {
    if (retrying.current.has(doc.id)) return;
    setBusy(doc.id, true);
    try {
      const result = await retryKnowledgeDocumentAction(doc.id);
      if (result.ok) {
        applyDocument(result.document);
        toast.success({ title: "Processing restarted", description: `${result.document.title} is queued for processing again.` });
      } else {
        if (result.gone) removeDocument(doc.id);
        else void fetchDocuments();
        toast.error({ title: "Couldn't retry processing", description: result.error });
      }
    } catch {
      toast.error({ title: "Something went wrong", description: "Check your connection and try again." });
    } finally {
      setBusy(doc.id, false);
    }
  };

  /** Failed documents retry straight away; pending ones ask first (they may still be queued). */
  const requestRetry = (doc: KnowledgeDocument) => {
    if (doc.status === "pending") setRetryConfirmId(doc.id);
    else void runRetry(doc);
  };

  const runReprocess = async (doc: KnowledgeDocument) => {
    if (retrying.current.has(doc.id)) return;
    setBusy(doc.id, true);
    try {
      const result = await reprocessKnowledgeDocumentAction(doc.id);
      if (result.ok) {
        applyDocument(result.document);
        toast.success({
          title: "Reprocessing started",
          description: `${result.document.title} is queued. Its chunks and embeddings will refresh when processing finishes.`,
        });
      } else {
        if (result.gone) removeDocument(doc.id);
        else void fetchDocuments();
        toast.error({ title: "Couldn't reprocess document", description: result.error });
      }
    } catch {
      toast.error({ title: "Something went wrong", description: "Check your connection and try again." });
    } finally {
      setBusy(doc.id, false);
    }
  };

  const requestReprocess = (doc: KnowledgeDocument) => {
    setDetailsId(null);
    setReprocessConfirmId(doc.id);
  };

  const openReplace = (doc: KnowledgeDocument) => {
    setDetailsId(null);
    setReplaceId(doc.id);
  };

  const openDelete = (doc: KnowledgeDocument) => {
    setDetailsId(null);
    setDeleteId(doc.id);
  };

  const switchProduct = (nextId: string) => {
    setSelectedProductId(nextId);
    startSwitch(() => router.push(`/admin/knowledge?${new URLSearchParams({ product: nextId })}`));
  };

  // ----- Derived view -----

  const list = useMemo(() => documents ?? [], [documents]);

  const counts = useMemo(() => {
    const result = { all: list.length, completed: 0, in_progress: 0, pending: 0, processing: 0, failed: 0 };
    for (const doc of list) {
      if (doc.status === "completed") result.completed++;
      else if (doc.status === "failed") result.failed++;
      else if (doc.status === "pending") result.pending++;
      else if (doc.status === "processing") result.processing++;
    }
    result.in_progress = result.pending + result.processing;
    return result;
  }, [list]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return list.filter(
      doc => matchesFilter(doc, filter) && (!needle || doc.title.toLowerCase().includes(needle) || doc.file_name.toLowerCase().includes(needle)),
    );
  }, [list, filter, deferredQuery]);

  const activeProducts = products.filter(p => p.is_active);
  const inactiveProducts = products.filter(p => !p.is_active);

  const uploadButton = (
    <button
      type="button"
      className={ui.primaryButton}
      onClick={() => setUploadOpen(true)}
      disabled={!product.is_active || documents === null}
      title={product.is_active ? undefined : "Restore this product to upload documents"}
    >
      <UploadIcon size={16} strokeWidth={2.2} />
      Upload document
    </button>
  );

  return (
    <>
      <section className={styles.header}>
        <div>
          <p className={ui.eyebrow}>Retrieval</p>
          <h1 className={productStyles.title}>Knowledge Base</h1>
          <p className={productStyles.subtitle}>Manage product-specific documents used by AYABOT for knowledge retrieval.</p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.productPicker}>
            <span>Product</span>
            <span className={styles.selectWrap}>
              <select value={selectedProductId} onChange={event => switchProduct(event.target.value)} disabled={switching} aria-busy={switching}>
                {activeProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {inactiveProducts.length > 0 && (
                  <optgroup label="Inactive products">
                    {inactiveProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (inactive)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {switching && <span className={ui.spinner} aria-hidden="true" />}
            </span>
          </label>
          {uploadButton}
        </div>
      </section>

      {!product.is_active && (
        <p className={styles.notice} role="status">
          <InfoIcon size={16} />
          <span>
            <strong>{product.name}</strong> is inactive. Restore it on the Products page to upload new documents; existing
            documents can still be viewed, replaced, retried and deleted.
          </span>
        </p>
      )}

      <section className={styles.metrics} aria-label="Document summary">
        <Metric label="Total documents" value={counts.all} tone="blue" icon={<BookIcon size={18} />} />
        <Metric label="Completed" value={counts.completed} tone="green" icon={<CheckIcon size={18} strokeWidth={2.4} />} />
        <Metric
          label="Processing"
          value={counts.in_progress}
          tone="amber"
          icon={<ClockIcon size={18} />}
          hint={counts.in_progress ? `${counts.pending} pending · ${counts.processing} processing` : undefined}
        />
        <Metric label="Failed" value={counts.failed} tone="red" icon={<AlertIcon size={18} />} />
      </section>

      <section className={productStyles.card} aria-labelledby="knowledge-list-title" aria-busy={switching}>
        <div className={styles.cardHead}>
          <div>
            <h2 id="knowledge-list-title" className={styles.cardTitle}>
              Documents
            </h2>
            <SyncStatus error={documents ? syncError : null} live={hasActive} />
          </div>
          <button type="button" className={ui.secondaryButton} onClick={refresh} disabled={refreshing || switching} aria-busy={refreshing}>
            <RefreshIcon size={15} className={refreshing ? styles.spinning : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {documents === null ? (
          <div className={productStyles.empty} role="alert">
            <span className={productStyles.emptyIcon} data-tone="danger" aria-hidden="true">
              <AlertIcon size={24} strokeWidth={1.6} />
            </span>
            <h3>Couldn&apos;t load documents</h3>
            <p>{syncError}</p>
            <button type="button" className={ui.secondaryButton} onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
              {refreshing && <span className={ui.spinner} aria-hidden="true" />}
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className={productStyles.toolbar}>
              <div className={`${productStyles.segmented} ${styles.filters}`} role="tablist" aria-label="Filter by status">
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

              <label className={productStyles.search}>
                <SearchIcon size={16} />
                <span className={ui.srOnly}>Search documents</span>
                <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title or file name" />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                    <CloseIcon size={14} />
                  </button>
                )}
              </label>
            </div>

            {list.length === 0 ? (
              <EmptyState
                title="No documents yet"
                text={
                  product.is_active
                    ? `Upload the documents AYABOT should use to answer questions about ${product.name}.`
                    : `${product.name} has no knowledge documents.`
                }
                action={product.is_active ? uploadButton : null}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No matching documents"
                text={query.trim() ? `Nothing matches “${query.trim()}”.` : "No documents have this status."}
                action={
                  <button
                    type="button"
                    className={ui.secondaryButton}
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <div className={styles.tableContainer}>
              <div className={styles.table} role="table" aria-label={`Knowledge documents for ${product.name}`}>
                <div className={styles.tableHead} role="row">
                  <span role="columnheader">Document</span>
                  <span role="columnheader">Type</span>
                  <span role="columnheader">Size</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Chunks</span>
                  <span role="columnheader">Updated</span>
                  <span role="columnheader" className={ui.srOnly}>
                    Actions
                  </span>
                </div>

                {visible.map(doc => {
                  const type = fileTypeLabel(doc);
                  const busy = busyIds.has(doc.id);
                  const stuck = now !== null && isLikelyStuck(doc, now);
                  return (
                    <div key={doc.id} className={styles.row} role="row" data-status={doc.status}>
                      <div role="cell" className={styles.documentCell}>
                        <FileTypeTile label={type} />
                        <div className={styles.documentText}>
                          <button type="button" className={styles.documentTitle} onClick={() => setDetailsId(doc.id)} title={doc.title}>
                            {doc.title}
                          </button>
                          <span className={styles.fileName} title={doc.file_name}>
                            {doc.file_name}
                          </span>
                          {doc.status === "failed" && doc.error_message && (
                            <span className={styles.rowError} title={doc.error_message}>
                              {doc.error_message}
                            </span>
                          )}
                        </div>
                      </div>
                      <div role="cell" className={styles.typeCell}>
                        <span className={styles.typeChip} data-type={type}>
                          {type}
                        </span>
                      </div>
                      <div role="cell" className={styles.sizeCell} data-label="Size">
                        {formatFileSize(doc.file_size)}
                      </div>
                      <div role="cell" className={styles.statusCell}>
                        <DocumentStatusBadge status={doc.status} />
                        {stuck && (
                          <span
                            className={styles.stuckHint}
                            title={
                              doc.status === "pending"
                                ? "Waiting longer than expected. If the server restarted, retry processing."
                                : "Processing is taking unusually long and may have stopped."
                            }
                          >
                            May be stuck
                          </span>
                        )}
                      </div>
                      <div role="cell" className={styles.chunksCell} data-label="Chunks">
                        <ChunkCount doc={doc} entry={details[doc.id]} />
                      </div>
                      <div role="cell" className={styles.dateCell} data-label="Updated">
                        <time dateTime={doc.updated_at} suppressHydrationWarning>
                          {formatDateTime(doc.updated_at)}
                        </time>
                      </div>
                      <div role="cell" className={styles.actionsCell}>
                        <button type="button" className={ui.iconButton} onClick={() => setDetailsId(doc.id)} aria-label={`View details for ${doc.title}`} title="View details">
                          <InfoIcon size={15} />
                        </button>
                        <button
                          type="button"
                          className={ui.iconButton}
                          onClick={() => openReplace(doc)}
                          disabled={busy || !canReplace(doc.status)}
                          aria-label={`Replace ${doc.title}`}
                          title={canReplace(doc.status) ? "Replace file" : "Available once processing completes or fails"}
                        >
                          <FileUpIcon size={15} />
                        </button>
                        {canRetry(doc.status) && (
                          <button
                            type="button"
                            className={ui.iconButton}
                            data-tone="success"
                            onClick={() => requestRetry(doc)}
                            disabled={busy}
                            aria-busy={busy}
                            aria-label={`Retry processing ${doc.title}`}
                            title="Retry processing"
                          >
                            {busy ? <span className={ui.spinner} aria-hidden="true" /> : <ResetIcon size={15} />}
                          </button>
                        )}
                        <button
                          type="button"
                          className={ui.iconButton}
                          data-tone="danger"
                          onClick={() => openDelete(doc)}
                          disabled={busy}
                          aria-label={`Delete ${doc.title}`}
                          title="Delete"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            )}

            {visible.length > 0 && (
              <p className={productStyles.footnote}>
                Showing {visible.length} of {list.length} document{list.length === 1 ? "" : "s"} for {product.name}
              </p>
            )}
          </>
        )}
      </section>

      <DocumentUploadDialog
        open={uploadOpen}
        product={product}
        onClose={() => setUploadOpen(false)}
        onUploaded={created => {
          setUploadOpen(false);
          setFilter("all");
          setQuery("");
          applyDocument(created);
          toast.success({ title: "Document uploaded", description: `${created.title} is queued for processing.` });
        }}
      />
      <DocumentDetailsDialog
        document={detailsDoc}
        productName={product.name}
        detail={detailsDoc ? details[detailsDoc.id]?.detail : undefined}
        detailError={detailsDoc ? details[detailsDoc.id]?.error : undefined}
        detailStale={Boolean(detailsDoc && details[detailsDoc.id] && details[detailsDoc.id].stamp !== stampOf(detailsDoc))}
        stuck={Boolean(detailsDoc && now !== null && isLikelyStuck(detailsDoc, now))}
        busy={Boolean(detailsDoc && busyIds.has(detailsDoc.id))}
        onClose={() => setDetailsId(null)}
        onReloadDetail={reloadDetail}
        onRetry={requestRetry}
        onReprocess={requestReprocess}
        onReplace={openReplace}
        onDelete={openDelete}
      />
      <ReplaceDocumentDialog
        document={replaceDoc}
        onClose={() => setReplaceId(null)}
        onReplaced={updated => {
          setReplaceId(null);
          applyDocument(updated);
          toast.success({ title: "Replacement uploaded", description: `${updated.file_name} is queued. The previous version stays live until it's processed.` });
        }}
      />
      <DeleteDocumentDialog
        document={deleteDoc}
        chunkCount={deleteDoc ? details[deleteDoc.id]?.detail?.total_chunks : undefined}
        onClose={() => setDeleteId(null)}
        onDeleted={removeDocument}
      />
      <RetryDocumentDialog document={retryConfirmDoc} onClose={() => setRetryConfirmId(null)} onConfirm={runRetry} />
      <ReprocessDocumentDialog
        document={reprocessConfirmDoc}
        onClose={() => setReprocessConfirmId(null)}
        onConfirm={runReprocess}
      />
    </>
  );
}

function ChunkCount({ doc, entry }: { doc: KnowledgeDocument; entry?: DetailEntry }) {
  if (isInProgress(doc.status)) {
    return (
      <span className={styles.muted} title="Available after processing">
        —
      </span>
    );
  }
  if (!entry?.detail) {
    if (entry?.error) {
      return (
        <span className={styles.muted} title={`Couldn't load chunk counts: ${entry.error}`}>
          —
        </span>
      );
    }
    return <span className={styles.chunkSkeleton} aria-label="Loading chunk count" />;
  }
  const { total_chunks: total, embedded_chunks: embedded } = entry.detail;
  return (
    <span className={styles.chunkCount} title={`${embedded} of ${total} chunks embedded`}>
      <strong>{total.toLocaleString("en-IN")}</strong>
      {embedded < total && <small data-tone="warning">{embedded.toLocaleString("en-IN")} embedded</small>}
    </span>
  );
}

function SyncStatus({ error, live }: { error: string | null; live: boolean }) {
  if (error) {
    return (
      <p className={styles.sync} data-tone="danger" role="status">
        <AlertIcon size={13} />
        Couldn&apos;t refresh: {error}
      </p>
    );
  }
  if (live) {
    return (
      <p className={styles.sync} data-tone="live" role="status">
        <span className={styles.liveDot} aria-hidden="true" />
        Updating automatically while documents are processing
      </p>
    );
  }
  return <p className={styles.sync}>Processing status refreshes automatically while documents are pending or processing.</p>;
}

function Metric({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "amber" | "red";
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <article className={styles.metric} data-tone={tone}>
      <span className={styles.metricIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className={productStyles.empty}>
      <span className={productStyles.emptyIcon} aria-hidden="true">
        <BookIcon size={26} strokeWidth={1.6} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
