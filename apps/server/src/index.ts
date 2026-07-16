import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerRoutes } from "./routes/api.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

async function main() {
  if (process.platform !== "darwin") {
    console.error(
      "Mac Storage Cleaner only runs on macOS (darwin). Current platform:",
      process.platform,
    );
    process.exit(1);
  }

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  });

  await registerRoutes(app);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Mac Storage Cleaner API listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
