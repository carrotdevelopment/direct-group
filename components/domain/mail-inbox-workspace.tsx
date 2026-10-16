"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Inbox, Paperclip, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InboxMessage, InboxThread } from "@/lib/mail-inbox";

type ThreadDetail = { id: string; subject: string; messages: InboxMessage[] };

// "Nombre <correo@dominio>" → "Nombre"; sin nombre, el correo.
function senderName(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return (match?.[1] || match?.[2] || from).trim();
}

function formatDate(iso: string, withTime = true) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MailInboxWorkspace() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/correos?${new URLSearchParams({ q: query, page: String(page) })}`, { cache: "no-store" });
      const data = (await response.json()) as { threads?: InboxThread[]; hasMore?: boolean; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudieron cargar los correos.");
      setThreads(data.threads ?? []);
      setHasMore(data.hasMore === true);
    } catch (err) {
      setThreads([]);
      setHasMore(false);
      setError(err instanceof Error ? err.message : "No se pudieron cargar los correos.");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    // Synchronize the inbox list with the selected search and page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  async function openThread(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/correos/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await response.json()) as { thread?: ThreadDetail; message?: string };
      if (!response.ok || !data.thread) throw new Error(data.message || "No se pudo abrir el correo.");
      setDetail(data.thread);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "No se pudo abrir el correo.");
    } finally {
      setDetailLoading(false);
    }
  }

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(0);
    setQuery(search.trim());
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,440px)_1fr]">
      <section className="card animate-enter flex min-h-[560px] flex-col overflow-hidden">
        <form onSubmit={applySearch} className="flex items-center gap-2 border-b border-[#e1e8f1] bg-white p-3">
          <label className="relative flex-1">
            <span className="sr-only">Buscar correos</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a99ad]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por remitente, asunto o texto"
              className="h-9 w-full rounded-xl border border-[#dbe4ef] bg-white pl-8 pr-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </label>
          <Button size="sm" type="submit" variant="secondary">Buscar</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => void loadList()} aria-label="Actualizar" title="Actualizar">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </form>

        <div className="flex-1 divide-y divide-[#e7edf4] overflow-y-auto">
          {error && <p className="m-3 rounded-xl bg-[#fdeeee] px-3 py-2 text-xs font-bold text-[#a43d39]">{error}</p>}
          {!error && loading && threads.length === 0 && <p className="p-4 text-xs font-semibold text-[#8a99ad]">Cargando correos…</p>}
          {!error && !loading && threads.length === 0 && (
            <p className="p-4 text-xs font-semibold text-[#8a99ad]">{query ? "No hay correos que coincidan con la búsqueda." : "La bandeja de entrada está vacía."}</p>
          )}
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => void openThread(thread.id)}
              className={`block w-full px-4 py-3 text-left transition ${selectedId === thread.id ? "bg-[#edf4fc]" : "bg-white hover:bg-[#f6f9fd]"}`}
            >
              <div className="flex items-center gap-2">
                {thread.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#0b5bbb]" title="No leído en Gmail" />}
                <span className={`min-w-0 flex-1 truncate text-xs ${thread.unread ? "font-black text-[#10233f]" : "font-bold text-[#334b6b]"}`}>
                  {senderName(thread.from)}
                </span>
                {thread.hasAttachments && <Paperclip size={12} className="shrink-0 text-[#8a99ad]" aria-label="Tiene adjuntos" />}
                <span className="shrink-0 text-[10px] font-semibold text-[#8a99ad]">{formatDate(thread.date, false)}</span>
              </div>
              <div className={`mt-0.5 truncate text-xs ${thread.unread ? "font-bold text-[#10233f]" : "text-[#334b6b]"}`}>
                {thread.subject || "(sin asunto)"}
                {thread.messageCount > 1 && <span className="ml-1 text-[10px] font-bold text-[#8a99ad]">({thread.messageCount})</span>}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[#8a99ad]">{thread.snippet}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#e1e8f1] bg-white px-3 py-2">
          <Button size="sm" variant="ghost" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>
            <ChevronLeft size={14} /> Más nuevos
          </Button>
          <span className="text-[10px] font-bold text-[#8a99ad]">Página {page + 1}</span>
          <Button size="sm" variant="ghost" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>
            Más antiguos <ChevronRight size={14} />
          </Button>
        </div>
      </section>

      <section className="card animate-enter min-h-[560px] overflow-hidden bg-white">
        {!selectedId && (
          <div className="grid h-full min-h-[560px] place-items-center p-8 text-center">
            <div>
              <Inbox size={28} className="mx-auto text-[#b9c7d8]" />
              <p className="mt-3 text-sm font-bold text-[#62728a]">Elegí un correo para verlo.</p>
            </div>
          </div>
        )}
        {selectedId && detailLoading && <p className="p-6 text-xs font-semibold text-[#8a99ad]">Abriendo correo…</p>}
        {selectedId && detailError && <p className="m-4 rounded-xl bg-[#fdeeee] px-3 py-2 text-xs font-bold text-[#a43d39]">{detailError}</p>}
        {detail && (
          <div>
            <h2 className="border-b border-[#e1e8f1] px-6 py-4 text-base font-black text-[#10233f]">{detail.subject || "(sin asunto)"}</h2>
            <div className="divide-y divide-[#e7edf4]">
              {detail.messages.map((message) => (
                <article key={message.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0 break-words text-xs [overflow-wrap:anywhere]">
                      <div className="font-black text-[#10233f]">{message.from}</div>
                      {message.to && <div className="mt-0.5 text-[#62728a]">Para: {message.to}</div>}
                      {message.cc && <div className="mt-0.5 text-[#62728a]">CC: {message.cc}</div>}
                    </div>
                    <span className="text-[10px] font-semibold text-[#8a99ad]">{formatDate(message.date)}</span>
                  </div>
                  <div className="mt-4 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#334b6b]">
                    {message.body.trim() || "(El correo no tiene texto: puede tener solo adjuntos o imágenes.)"}
                  </div>
                  {message.attachments.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <a
                          key={attachment.index}
                          href={`/api/correos/adjunto?${new URLSearchParams({ messageId: message.id, index: String(attachment.index) })}`}
                          className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#d8e2ee] bg-[#f8fafd] px-3 py-2 text-xs font-bold text-[#16365f] hover:bg-[#edf4fc]"
                        >
                          <Download size={13} className="shrink-0" />
                          <span className="truncate">{attachment.name}</span>
                          <span className="shrink-0 text-[10px] font-semibold text-[#8a99ad]">{formatSize(attachment.size)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
