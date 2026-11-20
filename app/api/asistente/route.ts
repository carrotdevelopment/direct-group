import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { assistantTools, runAssistantTool, toApiTool } from "@/lib/assistant/tools";
import { assistantSystemPrompt, assistantUserContext } from "@/lib/assistant/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30)
    .refine((list) => list[0].role === "user" && list[list.length - 1].role === "user"),
});

// Respuesta en streaming: una línea JSON por evento ({type:"text"|"tool"|"error"|"done"}).
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return Response.json({ message: "Iniciá sesión para continuar." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ message: "El asistente no está configurado (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Consulta inválida." }, { status: 400 });

  const tools = assistantTools(user);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const apiTools = tools.map(toApiTool);
  const messages: Anthropic.Beta.BetaMessageParam[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));
  const question = parsed.data.messages[parsed.data.messages.length - 1].content;
  const client = new Anthropic();
  const encoder = new TextEncoder();
  const usedTools: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let jsonRetries = 0;
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const turn = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort: "low" },
              system: [
                { type: "text", text: assistantSystemPrompt(), cache_control: { type: "ephemeral" } },
                { type: "text", text: assistantUserContext(user, tools.map((t) => t.module)) },
              ],
              tools: apiTools,
              messages,
            },
            { signal: request.signal },
          );
          turn.on("text", (text) => send({ type: "text", text }));

          let message: Anthropic.Beta.BetaMessage;
          try {
            message = await turn.finalMessage();
            jsonRetries = 0;
          } catch (error) {
            if (error instanceof Anthropic.APIError || jsonRetries++ >= 2) throw error;
            round--;
            continue;
          }

          if (message.stop_reason === "refusal") {
            send({ type: "text", text: "\n\nNo puedo responder esa consulta." });
            break;
          }
          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }
          const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (toolUses.length === 0) break;
          if (message.stop_reason === "max_tokens") throw new Error("La respuesta quedó cortada.");
          if (round === MAX_TOOL_ROUNDS) {
            send({ type: "text", text: "\n\nLa consulta necesitó demasiados pasos; probá con una pregunta más concreta." });
            break;
          }

          messages.push({ role: "assistant", content: message.content });
          const results = await Promise.all(
            toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const t = toolsByName.get(use.name);
              usedTools.push(use.name);
              send({ type: "tool", name: use.name });
              const result = t ? await runAssistantTool(t, use.input) : { ok: false, content: "Herramienta no disponible." };
              return { type: "tool_result", tool_use_id: use.id, content: result.content, is_error: !result.ok };
            }),
          );
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[asistente]", error);
          const message =
            error instanceof Anthropic.RateLimitError ? "El asistente está con mucha demanda; probá en un rato."
            : error instanceof Anthropic.APIError ? "El asistente no está disponible en este momento."
            : "No se pudo completar la consulta.";
          send({ type: "error", message });
        }
      } finally {
        controller.close();
        await prisma.auditLog
          .create({ data: { userId: user.id, action: "ASSISTANT_QUERY", entity: "Assistant", recordId: user.id, newData: { question, tools: usedTools } } })
          .catch((error) => console.error("[asistente] auditoría", error));
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
