import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import os from "node:os";
import {
  CategoryIdSchema,
  DeleteRequestSchema,
} from "@msc/shared";
import { z } from "zod";
import { deleteItems, emptyTrash } from "../delete/deleter.js";
import { getDiskInfo } from "../disk.js";
import { getCategoryDefinitions } from "../scanners/scan.js";
import { runFullScan } from "../scanners/scan.js";
import { startSession } from "../session.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    const darwin = process.platform === "darwin";
    return {
      ok: darwin,
      platform: process.platform,
      darwin,
      home: darwin ? os.homedir() : undefined,
    };
  });

  app.get("/api/disk", async (_req, reply) => {
    if (process.platform !== "darwin") {
      return reply.code(400).send({ error: "macOS only" });
    }
    try {
      return await getDiskInfo();
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/categories", async () => {
    return { categories: getCategoryDefinitions() };
  });

  app.get("/api/scan/stream", async (req, reply) => {
    if (process.platform !== "darwin") {
      return reply.code(400).send({ error: "macOS only" });
    }

    const query = z
      .object({
        categories: z.string().optional(),
      })
      .parse(req.query);

    let categoryIds;
    if (query.categories) {
      const parsed = query.categories.split(",").filter(Boolean);
      categoryIds = parsed.map((id) => CategoryIdSchema.parse(id));
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());

    const scanId = randomUUID();
    const session = startSession(scanId);

    try {
      const categories = await runFullScan(
        (update) => {
          send({
            type: "progress",
            categoryId: update.categoryId,
            label: update.label,
            bytesFound: update.bytesFound,
            itemCount: update.itemCount,
            status: update.status,
            message: update.message,
          });
        },
        { categoryIds, signal: ac.signal },
      );

      for (const cat of categories) {
        session.registerMany(cat.items);
      }

      const totalBytes = categories.reduce((s, c) => s + c.totalBytes, 0);
      send({
        type: "complete",
        categories,
        totalBytes,
        scanId,
      });
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      reply.raw.end();
    }
  });

  app.post("/api/scan", async (req, reply) => {
    if (process.platform !== "darwin") {
      return reply.code(400).send({ error: "macOS only" });
    }

    const body = z
      .object({
        categories: z.array(CategoryIdSchema).optional(),
      })
      .parse(req.body ?? {});

    const scanId = randomUUID();
    const session = startSession(scanId);

    const categories = await runFullScan(() => {}, {
      categoryIds: body.categories,
    });

    for (const cat of categories) {
      session.registerMany(cat.items);
    }

    const totalBytes = categories.reduce((s, c) => s + c.totalBytes, 0);
    return { type: "complete", categories, totalBytes, scanId };
  });

  app.post("/api/delete", async (req, reply) => {
    if (process.platform !== "darwin") {
      return reply.code(400).send({ error: "macOS only" });
    }

    const parsed = DeleteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { itemIds, dryRun } = parsed.data;
    const { results, totalBytesFreed } = await deleteItems(itemIds, { dryRun });
    return { results, totalBytesFreed, dryRun: dryRun ?? false };
  });

  app.post("/api/trash/empty", async (_req, reply) => {
    if (process.platform !== "darwin") {
      return reply.code(400).send({ error: "macOS only" });
    }
    const result = await emptyTrash();
    if (!result.ok) {
      return reply.code(500).send(result);
    }
    return result;
  });
}
