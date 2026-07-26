"use client";

import { use, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Search, Trash2, UploadCloud, X } from "lucide-react";
import { EmptyState } from "@workflow/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteDocument,
  useDocuments,
  useKnowledgeBase,
  useSearchKnowledge,
  useUploadDocument,
  type DocumentStatus,
} from "@/hooks/use-knowledge";
import { errorMessage } from "@/lib/errors";
import { useDictionary, useLocale } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";

function StatusPill({ status, error }: { status: DocumentStatus; error: string | null }) {
  const t = useDictionary();
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success">
        <Check className="h-3 w-3" strokeWidth={2.5} /> {t.knowledge.detail.statusReady}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-xs text-danger"
        title={error ?? undefined}
      >
        <X className="h-3 w-3" strokeWidth={2.5} /> {t.knowledge.detail.statusFailed}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-primary">
      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> {t.knowledge.detail.statusProcessing}
    </span>
  );
}

/** Mensagem de erro da ingestao — antes so existia no atributo title do StatusPill (invisivel sem hover). */
function DocumentError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-danger">{error}</p>;
}

export default function KnowledgeBaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: kb } = useKnowledgeBase(id);
  const { data: documents, isLoading } = useDocuments(id);
  const uploadDocument = useUploadDocument(id);
  const deleteDocument = useDeleteDocument(id);
  const searchKnowledge = useSearchKnowledge(id);
  const t = useDictionary();
  const locale = useLocale();

  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await uploadDocument.mutateAsync(file);
        toast.success(t.knowledge.detail.uploadSuccess(file.name));
      } catch (error) {
        toast.error(errorMessage(error, t.knowledge.detail.uploadErrorFallback(file.name)));
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void onFiles(event.dataTransfer.files);
  }

  async function onDeleteDocument(documentId: string) {
    try {
      await deleteDocument.mutateAsync(documentId);
      toast.success(t.knowledge.detail.deletedDocumentToast);
    } catch (error) {
      toast.error(errorMessage(error, t.knowledge.detail.deleteDocumentErrorFallback));
    }
  }

  async function onSearch() {
    if (!query.trim()) return;
    try {
      await searchKnowledge.mutateAsync(query);
    } catch (error) {
      toast.error(errorMessage(error, t.knowledge.detail.searchErrorFallback));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/knowledge"
          aria-label={t.knowledge.detail.backLinkAria}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t.knowledge.detail.backLink}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{kb?.name ?? "..."}</h1>
        {kb?.description && <p className="text-sm text-muted-foreground">{kb.description}</p>}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={t.knowledge.detail.dropzoneAria}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors " +
          (dragOver ? "border-primary bg-accent-subtle" : "border-border hover:border-border-strong")
        }
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-foreground">{t.knowledge.detail.dropzoneText}</p>
        <p className="text-xs text-muted-foreground">{t.knowledge.detail.dropzoneFormats}</p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.md,.markdown,.txt,.csv"
          onChange={(event) => void onFiles(event.target.files)}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">{t.knowledge.detail.documentsTitle}</h2>
        {isLoading && <Skeleton className="h-24 rounded-lg" />}
        {!isLoading && !documents?.length && (
          <EmptyState
            title={t.knowledge.detail.emptyDocumentsTitle}
            description={t.knowledge.detail.emptyDocumentsDescription}
          />
        )}
        {!!documents?.length && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.sourceType.toUpperCase()} · {t.knowledge.detail.chunkCount(doc.chunkCount)}
                  </p>
                  {doc.status === "failed" && <DocumentError error={doc.error} />}
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={doc.status} error={doc.error} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t.knowledge.detail.deleteDocumentAria} ${doc.name}`}
                    onClick={() => onDeleteDocument(doc.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">{t.knowledge.detail.testSearchTitle}</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.knowledge.detail.searchPlaceholder}
            aria-label={t.knowledge.detail.searchAria}
            onKeyDown={(event) => event.key === "Enter" && onSearch()}
          />
          <Button onClick={onSearch} disabled={searchKnowledge.isPending || !query.trim()}>
            <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
            {t.knowledge.detail.searchButton}
          </Button>
        </div>

        {!!searchKnowledge.data?.length && (
          <div className="mt-3 space-y-2">
            {searchKnowledge.data.map((result) => (
              <div key={result.chunkId} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{result.documentName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatPercent(result.similarity * 100, locale)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{result.content}</p>
              </div>
            ))}
          </div>
        )}

        {searchKnowledge.isSuccess && searchKnowledge.data?.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{t.knowledge.detail.noResults}</p>
        )}
      </div>
    </div>
  );
}
