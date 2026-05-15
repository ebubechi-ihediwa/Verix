import { NextRequest } from "next/server";
import { getExecution } from "@/services/execution";
import { getTraceEvents } from "@/services/trace";

const POLL_MS = 1000;
const TERMINAL = new Set(["completed", "failed"]);

/**
 * GET /api/executions/:id/events
 *
 * Server-Sent Events stream delivering ExecutionTraceEvent records as they are
 * written during coordinator execution. Clients subscribe once and receive
 * sub-second latency updates without long-polling the full task endpoint.
 *
 * Query params:
 *   lastSeq — sequence number of the last event the client already has.
 *             Defaults to -1 (send all events).
 *
 * Event types:
 *   trace_event   { type: "trace_event", payload: ExecutionTraceEvent }
 *   task_complete { type: "task_complete", payload: { status: string } }
 *
 * The stream closes automatically once the task reaches a terminal state.
 * A ": ping" comment is sent each loop to keep the connection alive through
 * proxies that drop idle streams.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = await getExecution(id);
  if (!task) {
    return new Response("Execution not found", { status: 404 });
  }

  const lastSeqParam = request.nextUrl.searchParams.get("lastSeq");
  let cursor = lastSeqParam !== null ? parseInt(lastSeqParam, 10) : -1;

  const enc = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream({
    start(controller) {
      let done = false;

      const write = (data: string) => {
        if (!done) controller.enqueue(enc.encode(`data: ${data}\n\n`));
      };

      const close = () => {
        if (!done) {
          done = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      signal.addEventListener("abort", close, { once: true });

      (async () => {
        while (!done) {
          try {
            const events = await getTraceEvents(id);
            for (const ev of events) {
              if (ev.sequence > cursor) {
                write(JSON.stringify({ type: "trace_event", payload: ev }));
                cursor = ev.sequence;
              }
            }

            const current = await getExecution(id);
            if (current && TERMINAL.has(current.status)) {
              write(JSON.stringify({ type: "task_complete", payload: { status: current.status } }));
              close();
              return;
            }

            if (!done) {
              controller.enqueue(enc.encode(": ping\n\n"));
            }
          } catch {
            close();
            return;
          }

          if (!done) {
            await new Promise<void>((resolve) => {
              const t = setTimeout(resolve, POLL_MS);
              signal.addEventListener("abort", () => {
                clearTimeout(t);
                resolve();
              }, { once: true });
            });
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
