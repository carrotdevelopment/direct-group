import OpenAI from "openai";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { assistantTools, runAssistantTool, toApiTool } from "@/lib/assistant/tools";
import { assistantSystemPrompt, assistantUserContext } from "@/lib/assistant/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El modelo se puede cambiar sin tocar código con OPENAI_MODEL.
const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
const MAX_TOOL_ROUNDS = 8;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30)
    .refine((list) => list[0].role === "user" && list[list.length - 1].role === "user"),
});

function parseArguments(raw: string) {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return undefined;
  }
}

// Respuesta en streaming: una línea JSON por evento ({type:"text"|"tool"|"error"|"done"}).
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return Response.json({ message: "Iniciá sesión para continuar." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ message: "El asistente no está configurado (falta OPENAI_API_KEY)." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Consulta inválida." }, { status: 400 });

  const tools = assistantTools(user);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const apiTools = tools.map(toApiTool);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: assistantSystemPrompt() },
    { role: "system", content: assistantUserContext(user, tools.map((t) => t.module)) },
    ...parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const question = parsed.data.messages[parsed.data.messages.length - 1].content;
  const client = new OpenAI();
  const encoder = new TextEncoder();
  const usedTools: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const turn = client.chat.completions.stream({ model: MODEL, messages, tools: apiTools }, { signal: request.signal });
          turn.on("content", (delta) => send({ type: "text", text: delta }));
          const choice = (await turn.finalChatCompletion()).choices[0];
          const message = choice?.message;

          if (choice?.finish_reason === "content_filter") {
            send({ type: "text", text: "\n\nNo puedo responder esa consulta." });
            break;
          }
          const calls = (message?.tool_calls ?? []).filter((c) => c.type === "function");
          if (!message || calls.length === 0) break;
          if (round === MAX_TOOL_ROUNDS) {
            send({ type: "text", text: "\n\nLa consulta necesitó demasiados pasos; probá con una pregunta más concreta." });
            break;
          }

          messages.push({
            role: "assistant",
            content: message.content ?? null,
            tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: c.function.arguments } })),
          });
          const results = await Promise.all(
            calls.map(async (call) => {
              const t = toolsByName.get(call.function.name);
              usedTools.push(call.function.name);
              send({ type: "tool", name: call.function.name });
              const input = parseArguments(call.function.arguments);
              const result = !t ? { content: "Herramienta no disponible." }
                : input === undefined ? { content: "Los parámetros no son un JSON válido." }
                : await runAssistantTool(t, input);
              return { role: "tool" as const, tool_call_id: call.id, content: result.content };
            }),
          );
          messages.push(...results);
        }
        send({ type: "done" });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[asistente]", error);
          const message =
            error instanceof OpenAI.RateLimitError ? "El asistente está con mucha demanda o sin saldo; probá en un rato."
            : error instanceof OpenAI.AuthenticationError ? "La clave de OpenAI no es válida."
            : error instanceof OpenAI.APIError ? "El asistente no está disponible en este momento."
            : "No se pudo completar la consulta.";
          send({ type: "error", message });
        }
      } finally {
        controller.close();
        await prisma.auditLog
          .create({ data: { userId: user.id, action: "ASSISTANT_QUERY", entity: "Assistant", recordId: user.id, newData: { question, tools: usedTools, model: MODEL } } })
          .catch((error) => console.error("[asistente] auditoría", error));
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
