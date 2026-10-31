import Fastify, { type FastifyServerOptions } from "fastify";
import { z } from "zod";

import type { ProcessCapture } from "./application/process-capture.js";

interface BuildAppOptions extends FastifyServerOptions {
  processCapture?: ProcessCapture;
}

const captureSchema = z.object({
  workspaceId: z.string().uuid(),
  externalMessageId: z.string().min(1),
  channel: z.literal("telegram"),
  message: z.string().min(1)
});

export function buildApp(options: BuildAppOptions = {}) {
  const { processCapture, ...fastifyOptions } = options;
  const app = Fastify(fastifyOptions);

  app.get("/health", async () => ({ status: "ok" as const }));

  if (processCapture) {
    app.post("/v1/captures", async (request, reply) => {
      const parsed = captureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ status: "rejected", message: "La captura no es válida." });
      }
      const outcome = await processCapture.execute(parsed.data);
      const statusCode = outcome.status === "needs_information" ? 422 : outcome.repeated ? 200 : 201;
      const { repeated: _repeated, ...body } = outcome;
      return reply.code(statusCode).send(body);
    });
  }

  return app;
}
