// api/shared-cache.js
// Shared team cache using Upstash Redis REST API
// No npm package needed — pure fetch() calls
// Setup: upstash.com → create free Redis DB → copy 2 env vars to Vercel

// Supports Vercel KV, Upstash, or plain Redis env var names
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
                 || process.env.KV_REST_API_URL
                 || process.env.REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
                 || process.env.KV_REST_API_TOKEN
                 || process.env.REDIS_TOKEN;
const INDEX_KEY   = "agentflow:index";
const MAX_RUNS    = 50;

const normalizeGoal = (g) => g?.toLowerCase().trim().replace(/\s+/g, " ") || "";
const runKey  = (goal) => `agentflow:run:${normalizeGoal(goal)}`;
const metaKey = (goal) => `agentflow:meta:${normalizeGoal(goal)}`;

// ── Upstash REST helpers ───────────────────────────────────────────────────────
async function redis(...args) {
  const res = await fetch(`${REDIS_URL}/${args.map(a => encodeURIComponent(a)).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}

async function redisPost(command, ...args) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([command, ...args]),
  });
  const data = await res.json();
  return data.result;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // Check env vars
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({
      error: "KV_NOT_CONFIGURED",
      message: "Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables.",
    });
  }

  try {
    // ── GET: fetch a run or list all ─────────────────────────────────────────
    if (req.method === "GET") {
      const { goal, list } = req.query;

      if (list === "true") {
        // Get all goals from sorted index (newest first)
        const members = await redis("zrange", INDEX_KEY, "+inf", "-inf", "BYSCORE", "REV", "LIMIT", "0", "50");
        if (!members || !Array.isArray(members)) return res.status(200).json({ runs: [] });

        const runs = [];
        for (const goalKey of members) {
          const meta = await redis("hgetall", `agentflow:meta:${goalKey}`);
          if (meta && Array.isArray(meta)) {
            // Upstash returns flat array [key, val, key, val...]
            const obj = {};
            for (let i = 0; i < meta.length; i += 2) obj[meta[i]] = meta[i + 1];
            runs.push({ goalKey, goal: obj.goal, timestamp: Number(obj.timestamp || 0), tokenTotal: Number(obj.tokenTotal || 0) });
          }
        }
        return res.status(200).json({ runs });
      }

      if (!goal) return res.status(400).json({ error: "goal param required" });
      const raw = await redis("get", runKey(goal));
      if (!raw) return res.status(200).json({ hit: false });
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      return res.status(200).json({ hit: true, ...data });
    }

    // ── POST: store a run ────────────────────────────────────────────────────
    if (req.method === "POST") {
      const { goal, outputs, tokenLog } = req.body;
      if (!goal || !outputs) return res.status(400).json({ error: "goal and outputs required" });

      const normalizedGoal = normalizeGoal(goal);
      const timestamp  = Date.now();
      const tokenTotal = (tokenLog || []).reduce((s, t) => s + (t.input || 0) + (t.output || 0), 0);
      const payload    = JSON.stringify({ goal, outputs, tokenLog: tokenLog || [], timestamp, tokenTotal });

      // Store run data (no TTL = permanent)
      await redisPost("set", runKey(goal), payload);

      // Store lightweight meta for list view
      await redisPost("hset", metaKey(goal),
        "goal", goal,
        "timestamp", String(timestamp),
        "tokenTotal", String(tokenTotal)
      );

      // Update sorted index (score = timestamp)
      await redisPost("zadd", INDEX_KEY, String(timestamp), normalizedGoal);

      // Trim to MAX_RUNS (remove oldest)
      const total = await redis("zcard", INDEX_KEY);
      if (Number(total) > MAX_RUNS) {
        const toRemove = await redis("zrange", INDEX_KEY, "0", String(Number(total) - MAX_RUNS - 1));
        if (Array.isArray(toRemove)) {
          for (const oldKey of toRemove) {
            await redisPost("zrem", INDEX_KEY, oldKey);
            await redisPost("del", `agentflow:run:${oldKey}`);
            await redisPost("del", `agentflow:meta:${oldKey}`);
          }
        }
      }

      return res.status(200).json({ stored: true, timestamp });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { goal } = req.query;
      if (!goal) return res.status(400).json({ error: "goal param required" });
      const ng = normalizeGoal(goal);
      await redisPost("del", runKey(goal));
      await redisPost("del", metaKey(goal));
      await redisPost("zrem", INDEX_KEY, ng);
      return res.status(200).json({ deleted: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("Cache error:", err);
    return res.status(500).json({ error: err.message });
  }
}
