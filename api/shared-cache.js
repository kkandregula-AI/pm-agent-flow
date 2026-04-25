// api/shared-cache.js
// Shared team cache using Vercel KV (Redis)
// GET  /api/shared-cache?goal=... → returns cached run or null
// POST /api/shared-cache { goal, outputs, tokenLog } → stores run
// DELETE /api/shared-cache?goal=... → removes a cached run
// GET  /api/shared-cache?list=true → returns all cached run summaries

import { kv } from "@vercel/kv";

// No TTL — runs are permanent until manually deleted
const INDEX_KEY = "agentflow:index";         // sorted set of all cached goals
const MAX_RUNS  = 50;                        // max shared runs to keep

const normalizeGoal = (g) => g?.toLowerCase().trim().replace(/\s+/g, " ") || "";
const runKey = (goal) => `agentflow:run:${normalizeGoal(goal)}`;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Check KV is configured ─────────────────────────────────────────────────
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({
      error: "KV_NOT_CONFIGURED",
      message: "Vercel KV not set up. Run: vercel kv create agentflow-cache",
    });
  }

  try {
    // ── GET: fetch a specific run or list all ────────────────────────────────
    if (req.method === "GET") {
      const { goal, list } = req.query;

      // List all cached run summaries
      if (list === "true") {
        const index = await kv.zrange(INDEX_KEY, 0, -1, { rev: true, withScores: true });
        const summaries = [];
        for (let i = 0; i < index.length; i += 2) {
          const goalKey = index[i];
          const timestamp = Number(index[i + 1]);
          // Get just goal text (stored in a meta key)
          const meta = await kv.hgetall(`agentflow:meta:${goalKey}`);
          if (meta) {
            summaries.push({
              goalKey,
              goal: meta.goal,
              timestamp,
              tokenTotal: Number(meta.tokenTotal || 0),
              runBy: meta.runBy || "team",
            });
          }
        }
        return res.status(200).json({ runs: summaries });
      }

      // Fetch specific run
      if (!goal) return res.status(400).json({ error: "goal param required" });
      const key = runKey(goal);
      const cached = await kv.get(key);
      if (!cached) return res.status(200).json({ hit: false });
      return res.status(200).json({ hit: true, ...cached });
    }

    // ── POST: store a new run ────────────────────────────────────────────────
    if (req.method === "POST") {
      const { goal, outputs, tokenLog } = req.body;
      if (!goal || !outputs) return res.status(400).json({ error: "goal and outputs required" });

      const normalizedGoal = normalizeGoal(goal);
      const key = runKey(goal);
      const timestamp = Date.now();
      const tokenTotal = (tokenLog || []).reduce((s, t) => s + (t.input || 0) + (t.output || 0), 0);

      // Store run data permanently
      await kv.set(key, { goal, outputs, tokenLog: tokenLog || [], timestamp, tokenTotal }); // no expiry

      // Store meta (lightweight, for list view)
      await kv.hset(`agentflow:meta:${normalizedGoal}`, {
        goal,
        timestamp: String(timestamp),
        tokenTotal: String(tokenTotal),
        runBy: "team",
      });

      // Update sorted index (score = timestamp for chronological order)
      await kv.zadd(INDEX_KEY, { score: timestamp, member: normalizedGoal });

      // Trim index to MAX_RUNS (remove oldest)
      const total = await kv.zcard(INDEX_KEY);
      if (total > MAX_RUNS) {
        const toRemove = await kv.zrange(INDEX_KEY, 0, total - MAX_RUNS - 1);
        for (const oldKey of toRemove) {
          await kv.zrem(INDEX_KEY, oldKey);
          await kv.del(`agentflow:run:${oldKey}`);
          await kv.del(`agentflow:meta:${oldKey}`);
        }
      }

      return res.status(200).json({ stored: true, key: normalizedGoal, timestamp });
    }

    // ── DELETE: remove a specific run ────────────────────────────────────────
    if (req.method === "DELETE") {
      const { goal } = req.query;
      if (!goal) return res.status(400).json({ error: "goal param required" });
      const normalizedGoal = normalizeGoal(goal);
      await kv.del(runKey(goal));
      await kv.del(`agentflow:meta:${normalizedGoal}`);
      await kv.zrem(INDEX_KEY, normalizedGoal);
      return res.status(200).json({ deleted: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("Shared cache error:", err);
    return res.status(500).json({ error: err.message });
  }
}
