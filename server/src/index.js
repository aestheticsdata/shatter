import { fileURLToPath } from "node:url";
import Fastify, { LogController } from "fastify";
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

// Zeus's health probe, and the only route here that exists for a machine rather than a player.
// It used to be `/api/scores`: the registry had nowhere else to point, so the fleet checked whether
// shatter was alive by reading the leaderboard out of SQLite every thirty seconds (IKN-32).
const HEALTH_PATH = "/api/health";

/**
 * Both of fastify's access lines go through this controller — "incoming request" before any hook can
 * run, "request completed" after the last one — which makes it the only place that can drop the
 * first and still decide about the second once a status code exists.
 *
 * A probe answered 2xx leaves nothing behind. Anything else keeps its completed line, status and
 * all, because a health check that has started failing is the one thing on this route worth reading.
 * At two lines a probe, silencing the successful ones is 5 760 lines a day that stop burying the
 * handful this server writes about actual play.
 *
 * Not `disableRequestLogging`: it is consulted at both ends with the request alone, so it cannot
 * answer differently once the status exists, and fastify 5.12 deprecates it (FSTDEP023) in favour of
 * this class. The query string is stripped rather than matched, so `/api/health?from=curl` is still
 * a probe.
 */
class QuietHealthLog extends LogController {
  incomingRequest(request, reply, metadata) {
    if (isHealthProbe(request)) return;
    super.incomingRequest(request, reply, metadata);
  }

  requestCompleted(error, request, reply, metadata) {
    const answered = !error && reply.statusCode >= 200 && reply.statusCode < 300;
    if (answered && isHealthProbe(request)) return;
    super.requestCompleted(error, request, reply, metadata);
  }
}

function isHealthProbe(request) {
  return request.url.split("?")[0] === HEALTH_PATH;
}

const db = openDatabase(DB_PATH);
// Trust exactly the local nginx/vite hop: trustProxy: true would let clients forge
// request.ip via X-Forwarded-For and walk around the per-IP rate limit entirely.
// nginx must set `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, not append).
const app = Fastify({ logger: true, trustProxy: "127.0.0.1", logController: new QuietHealthLog() });

// Fastify's default handler echoes error.message to the client — never expose
// SQLite/driver internals. Its own 4xx (invalid JSON body, etc.) pass through.
app.setErrorHandler((error, request, reply) => {
  if (error.statusCode && error.statusCode < 500) {
    return reply.send(error);
  }
  request.log.error(error);
  return reply.code(500).send({ error: "internal error" });
});

// Liveness only, and deliberately empty of detail: it answers from the process without touching
// SQLite, so it says "this server is up" and never anything a stranger could learn from.
app.get(HEALTH_PATH, () => ({ status: "ok" }));

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
