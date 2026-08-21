import { fileURLToPath } from "node:url";

import Fastify from "fastify";

import { openDatabase } from "./db.js";
import { isValidScore, normalizeName } from "./validate.js";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 7000);
const DB_PATH = process.env.SHATTER_DB ?? `${SERVER_ROOT}data/shatter.db`;
const TOP_LIMIT = 15;

// Defense in depth behind the nginx limit_req zone: per-IP in-memory throttle.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 6;
const recentPosts = new Map();

function allowPost(ip) {
  const now = Date.now();
  const stamps = (recentPosts.get(ip) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (stamps.length >= RATE_MAX_POSTS) {
    recentPosts.set(ip, stamps);
    return false;
  }
  stamps.push(now);
  recentPosts.set(ip, stamps);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, stamps] of recentPosts) {
    if (stamps.every((stamp) => now - stamp >= RATE_WINDOW_MS)) {
      recentPosts.delete(ip);
    }
  }
}, RATE_WINDOW_MS * 5).unref();

const db = openDatabase(DB_PATH);
// Trust exactly the local nginx/vite hop: trustProxy: true would let clients forge
// request.ip via X-Forwarded-For and walk around the per-IP rate limit entirely.
// nginx must set `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, not append).
const app = Fastify({ logger: true, trustProxy: "127.0.0.1" });

// Fastify's default handler echoes error.message to the client — never expose
// SQLite/driver internals. Its own 4xx (invalid JSON body, etc.) pass through.
app.setErrorHandler((error, request, reply) => {
  if (error.statusCode && error.statusCode < 500) {
    return reply.send(error);
  }
  request.log.error(error);
  return reply.code(500).send({ error: "internal error" });
});

app.get("/api/scores", () => ({ scores: db.top(TOP_LIMIT) }));

app.post("/api/scores", (request, reply) => {
  if (!allowPost(request.ip)) {
    return reply.code(429).send({ error: "too many submissions, slow down" });
  }

  const body = typeof request.body === "object" && request.body !== null ? request.body : {};
  const name = normalizeName(body.name);
  if (name === null) {
    return reply.code(422).send({ error: "name must be exactly 3 characters A-Z or 0-9" });
  }
  if (!isValidScore(body.score)) {
    return reply.code(422).send({ error: "score must be an integer between 0 and 10000000" });
  }

  db.insert(name, body.score, request.ip);
  request.log.info({ name, score: body.score, ip: request.ip }, "score accepted");
  return reply.code(201).send({ scores: db.top(TOP_LIMIT) });
});

app.listen({ port: PORT, host: "127.0.0.1" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
