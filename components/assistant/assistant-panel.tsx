"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string; error?: boolean };

const TOOL_LABELS: Record<string, string> = {
  guia_plataforma: "Revisando las pantallas",
  consultar_stock: "Consultando stock",
  buscar_productos: "Buscando productos",
  consultar_pasajes: "Consultando pasajes",
  consultar_egresos: "Consultando egresos",
  consultar_precios: "Consultando precios",
  consultar_ingresos: "Consultando ingresos",
};

const EXAMPLES = [
  "¿Qué pasajes están pendientes de aprobación?",
  "¿Cuánto stock real tiene Santander del código 1234?",
  "¿Dónde cargo un ajuste de stock?",
];

// Markdown mínimo: párrafos, listas, tablas, **negrita** y `código`.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") && part.endsWith("`") ? <code key={i} className="rounded bg-[#eef3f9] px-1 text-[12px]">{part.slice(1, -1)}</code>
    : part,
  );
}

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={i} className="my-2 overflow-x-auto rounded-lg border border-[#dfe7f0]">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[#f4f7fb] text-[#334b6b]"><tr>{head.map((h, j) => <th key={j} className="whitespace-nowrap px-2 py-1.5 font-bold">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-[#eef2f7]">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      blocks.push(<ul key={i} className="my-1.5 list-disc space-y-0.5 pl-5">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (line.trim()) {
      const heading = line.match(/^#{1,4}\s+(.*)$/);
      blocks.push(<p key={i} className={cn("my-1.5", heading && "font-bold text-[#062b5b]")}>{inline(heading ? heading[1] : line)}</p>);
    }
    i++;
  }
  return <>{blocks}</>;
}

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history = [...messages.filter((m) => !m.error && m.content.trim()), { role: "user" as const, content: text }].slice(-20);
    if (history[0]?.role !== "user") history.shift();
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Pensando");
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "No se pudo consultar al asistente.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let afterTool = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string; name?: string; message?: string };
          if (event.type === "text" && event.text) {
            const text = event.text;
            const separate = afterTool;
            afterTool = false;
            setStatus("");
            // El texto que sigue a una consulta va en un párrafo aparte del anterior.
            update((m) => ({ ...m, content: m.content + (separate && m.content && !m.content.endsWith("\n") ? "\n\n" : "") + text }));
          } else if (event.type === "tool") {
            afterTool = true;
            setStatus(TOOL_LABELS[event.name ?? ""] ?? "Consultando");
          } else if (event.type === "error") {
            update((m) => ({ ...m, content: `${m.content}${m.content ? "\n\n" : ""}${event.message}`, error: true }));
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        update((m) => ({ ...m, content: error instanceof Error ? error.message : "No se pudo consultar al asistente.", error: true }));
      }
    } finally {
      setBusy(false);
      setStatus("");
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
    setStatus("");
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente"
          title="Asistente de consultas"
          className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-[#0b5bbb] px-4 text-[14px] font-semibold text-white shadow-lg hover:bg-[#094c9c]"
        >
          <Bot size={20} /> <span className="hidden sm:inline">Consultas</span>
        </button>
      )}
      {open && (
        <section
          aria-label="Asistente de consultas"
          className="fixed inset-x-2 bottom-2 top-16 z-40 flex flex-col overflow-hidden rounded-2xl border border-[#dce5ef] bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:top-auto sm:bottom-5 sm:h-[min(640px,calc(100vh-40px))] sm:w-[440px]"
        >
          <header className="flex items-center gap-2 border-b border-[#dfe7f0] px-4 py-3">
            <Bot size={18} className="text-[#0b5bbb]" />
            <div className="flex-1">
              <div className="text-[14px] font-bold text-[#062b5b]">Asistente de consultas</div>
              <div className="text-[11px] text-[#5a6a82]">Solo consulta datos; no modifica nada.</div>
            </div>
            {messages.length > 0 && (
              <button onClick={reset} aria-label="Nueva conversación" title="Nueva conversación" className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#e9f1fb] hover:text-[#062b5b]"><RotateCcw size={16} /></button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#e9f1fb] hover:text-[#062b5b]"><X size={18} /></button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed text-[#1d2b40]">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[#5a6a82]">Preguntá sobre stock, productos, precios, pasajes, egresos o ingresos, o cómo hacer algo en la plataforma.</p>
                {EXAMPLES.map((example) => (
                  <button key={example} onClick={() => ask(example)} className="block w-full rounded-xl border border-[#dfe7f0] px-3 py-2 text-left text-[13px] text-[#334b6b] hover:border-[#0b5bbb] hover:text-[#0b5bbb]">
                    {example}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#0b5bbb] px-3 py-2 text-white">{message.content}</div>
              ) : message.content ? (
                <div key={index} className={cn("max-w-full", message.error && "rounded-xl bg-[#fdecec] px-3 py-2 text-[#9b1c1c]")}>
                  <Markdown text={message.content} />
                </div>
              ) : null,
            )}
            {status && (
              <div className="flex items-center gap-2 text-[12px] text-[#5a6a82]"><Loader2 size={14} className="animate-spin" /> {status}…</div>
            )}
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); ask(input); }}
            className="flex items-end gap-2 border-t border-[#dfe7f0] p-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(input); }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Escribí tu consulta…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-[#dbe4ef] px-3 py-2 text-[14px] outline-none focus:border-[#0b5bbb]"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b5bbb] text-white disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
