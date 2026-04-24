import { useState, useRef, useEffect } from "react";

// ─── Token helpers ─────────────────────────────────────────────────────────────
const estimateTokens = (text = "") => Math.ceil(text.length / 4);
const truncate = (text = "", maxChars) =>
  text.length > maxChars ? text.substring(0, maxChars) + "…[truncated]" : text;
const estimateCost = (inputTok, outputTok) =>
  ((inputTok / 1_000_000) * 3 + (outputTok / 1_000_000) * 15).toFixed(4);

const BASELINE_OUTPUT = 9 * 1000;
const BASELINE_INPUT  = 9 * 800;

// ─── Cache helpers ─────────────────────────────────────────────────────────────
const CACHE_KEY     = "agentflow_runs";
const CACHE_MAX     = 10;                          // max stored runs
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000;        // 24 hours

const normalizeGoal = (g) => g.toLowerCase().trim().replace(/\s+/g, " ");

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch { return []; }
}

function saveCache(runs) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(runs)); } catch {}
}

function findCachedRun(goal) {
  const key = normalizeGoal(goal);
  const now = Date.now();
  return loadCache().find(r => r.goalKey === key && (now - r.timestamp) < CACHE_TTL_MS) || null;
}

function storeCachedRun(goal, outputs, tokenLog) {
  const runs = loadCache();
  const key  = normalizeGoal(goal);
  // Remove any existing entry for same goal
  const filtered = runs.filter(r => r.goalKey !== key);
  const newRun = {
    id:        Date.now().toString(),
    goal,
    goalKey:   key,
    timestamp: Date.now(),
    outputs,
    tokenLog,
  };
  const updated = [newRun, ...filtered].slice(0, CACHE_MAX);
  saveCache(updated);
}

function deleteCachedRun(id) {
  saveCache(loadCache().filter(r => r.id !== id));
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

// ─── Agents ────────────────────────────────────────────────────────────────────
const AGENTS = [
  {
    id: "ceo", title: "CEO", label: "Chief Executive", icon: "◈", color: "#F59E0B", accent: "#FCD34D",
    maxTokens: 450, contextDeps: [],
    systemPrompt: `You are a CEO Agent. Given a business goal respond with ONLY:
1. Strategic Vision (2 sentences max)
2. Value Proposition (1 sentence)
3. Target Customer (1 sentence)
4. Top 3 Priorities (numbered, 1 line each)
5. 3 KPIs (1 line each)
Be extremely concise. No fluff.`,
  },
  {
    id: "pm", title: "PM", label: "Product Manager", icon: "⬡", color: "#6366F1", accent: "#A5B4FC",
    maxTokens: 650, contextDeps: [{ id: "ceo", chars: 500 }],
    systemPrompt: `You are a Senior PM. Be concise. Provide:
1. Problem Statement (2 sentences)
2. 2 User Personas (name, role, 1 pain point each)
3. MVP Features (5 features, P0/P1/P2, 1 line each)
4. 3-Month Roadmap (3 bullet milestones)
5. 2 Success Metrics
No padding. Every word must add value.`,
  },
  {
    id: "ux", title: "UX", label: "UX Designer", icon: "◎", color: "#EC4899", accent: "#F9A8D4",
    maxTokens: 550, contextDeps: [{ id: "ceo", chars: 200 }, { id: "pm", chars: 400 }],
    systemPrompt: `You are a Senior UX Designer. Be brief. Provide:
1. User Journey (5 steps, 1 line each)
2. Key Screens (5 screens, name + 1-line purpose)
3. 3 Design Principles (1 line each)
4. Nav Structure (1 sentence)
5. 2 Accessibility rules`,
  },
  {
    id: "eng", title: "ENG", label: "Engineer", icon: "⬢", color: "#10B981", accent: "#6EE7B7",
    maxTokens: 650, contextDeps: [{ id: "ceo", chars: 200 }, { id: "pm", chars: 400 }],
    systemPrompt: `You are a Software Architect. Be precise. Provide:
1. Tech Stack (frontend / backend / DB / AI — 1 line each)
2. Architecture (3 components, 1 line each)
3. 3 Core API Endpoints (METHOD /path — purpose)
4. 2 Key Data Models (entity + 3 fields)
5. Timeline (3 phases with week count)`,
  },
  {
    id: "research", title: "RESEARCH", label: "Market Research", icon: "◉", color: "#0EA5E9", accent: "#7DD3FC",
    maxTokens: 550, contextDeps: [],
    systemPrompt: `You are a Market Analyst. Be data-driven and brief:
1. Market Size: TAM / SAM / SOM (1 line each with $ figure)
2. Top 3 Competitors (name + 1 strength + 1 weakness)
3. 3 Market Gaps (1 line each)
4. Top 2 Acquisition Channels (with tactic)
5. 2 Supporting Trends (1 line each)`,
  },
  {
    id: "marketing", title: "MKTG", label: "Marketing", icon: "◆", color: "#F97316", accent: "#FED7AA",
    maxTokens: 600, contextDeps: [{ id: "ceo", chars: 250 }, { id: "pm", chars: 300 }],
    systemPrompt: `You are a Growth Marketer. Provide:
1. Tagline (under 8 words)
2. LinkedIn Post (100 words max — hook, value, CTA)
3. Hero Copy: headline + subheadline + 3 bullets + CTA text
4. GTM: Pre-launch / Launch / Growth (2 tactics each)
5. Top 2 Channels + tactics`,
  },
  {
    id: "finance", title: "FIN", label: "Finance", icon: "◇", color: "#8B5CF6", accent: "#C4B5FD",
    maxTokens: 580, contextDeps: [{ id: "ceo", chars: 200 }, { id: "pm", chars: 250 }, { id: "research", chars: 300 }],
    systemPrompt: `You are a Startup CFO. Be specific with numbers:
1. Pricing: 2-3 tiers (name, price, 2 features each)
2. Revenue: Month 3 / Month 6 / Year 1 ($ with 1 assumption each)
3. Costs: Top 3 categories + monthly estimate
4. Unit Economics: CAC target / LTV target / ratio
5. Funding: Amount needed + 3 use-of-funds lines
6. Break-even: Month # at what MRR`,
  },
  {
    id: "qa", title: "QA", label: "QA & Risk", icon: "⊗", color: "#EF4444", accent: "#FCA5A5",
    maxTokens: 600, contextDeps: [{ id: "ceo", chars: 200 }, { id: "pm", chars: 300 }, { id: "eng", chars: 300 }],
    systemPrompt: `You are a QA & Risk Lead. Be critical:
1. Top 5 Risks (name, High/Med/Low, 1-line mitigation each)
2. 3 Product Gaps (what's missing)
3. 2 Technical Debt risks
4. Compliance flags (HIPAA/GDPR/etc if relevant)
5. Go/No-Go Checklist (8 items, check/cross format)`,
  },
  {
    id: "reviewer", title: "BOARD", label: "Board Reviewer", icon: "★", color: "#F59E0B", accent: "#FEF3C7",
    maxTokens: 700,
    contextDeps: [
      { id: "ceo", chars: 300 }, { id: "pm", chars: 300 }, { id: "ux", chars: 200 },
      { id: "eng", chars: 250 }, { id: "research", chars: 250 }, { id: "marketing", chars: 200 },
      { id: "finance", chars: 250 }, { id: "qa", chars: 300 },
    ],
    systemPrompt: `You are a Board Reviewer. Synthesize everything concisely:
1. Executive Summary (3 sentences)
2. Viability Score: X/10 + 2-sentence rationale
3. Top 3 Strengths (1 line each)
4. Top 3 Concerns (1 line each)
5. Next 5 Actions (numbered, 1 line each, in priority order)
6. Verdict: GO / NO-GO / PIVOT + 2-sentence justification`,
  },
];

const STATUS = { IDLE: "idle", RUNNING: "running", DONE: "done", ERROR: "error" };
const EXAMPLES = [
  "A mobile app that helps freelancers send invoices and track payments using AI",
  "Create an AI product for doctors to summarize medical reports",
  "Build a SaaS platform for small restaurants to manage inventory with AI",
  "Launch a B2B tool that auto-generates legal contracts using AI",
];

// ─── Build context prompt ──────────────────────────────────────────────────────
function buildPrompt(agent, goal, collected) {
  let prompt = `Business Goal: "${goal}"\n\n`;
  if (agent.contextDeps.length === 0) {
    prompt += "Fulfill your role for this business goal.";
  } else {
    agent.contextDeps.forEach(({ id, chars }) => {
      const ag = AGENTS.find(a => a.id === id);
      if (collected[id]) prompt += `[${ag.label.toUpperCase()} — summary]\n${truncate(collected[id], chars)}\n\n`;
    });
    prompt += agent.id === "reviewer" ? "Provide your board-level synthesis." : "Now fulfill your role.";
  }
  return prompt;
}

// ─── API call ──────────────────────────────────────────────────────────────────
async function callAgent(agent, contextPrompt) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: agent.maxTokens,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: contextPrompt }],
    }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || "API error"); }
  const data = await res.json();
  const text = data.content?.[0]?.text || "No output.";
  const usage = {
    input:  data.usage?.input_tokens  || estimateTokens(contextPrompt + agent.systemPrompt),
    output: data.usage?.output_tokens || estimateTokens(text),
  };
  return { text, usage };
}

// ─── Token Meter ───────────────────────────────────────────────────────────────
function TokenMeter({ tokenLog, running, fromCache }) {
  if (tokenLog.length === 0) return null;
  const totalIn  = tokenLog.reduce((s, t) => s + t.input,  0);
  const totalOut = tokenLog.reduce((s, t) => s + t.output, 0);
  const savedOut = Math.max(0, BASELINE_OUTPUT - totalOut);
  const savedIn  = Math.max(0, BASELINE_INPUT  - totalIn);
  const savePct  = Math.round(((savedOut + savedIn) / (BASELINE_OUTPUT + BASELINE_INPUT)) * 100);
  const cost     = fromCache ? "0.0000" : estimateCost(totalIn, totalOut);
  const baseline = estimateCost(BASELINE_INPUT, BASELINE_OUTPUT);
  const savedCostAmt = (parseFloat(baseline) - parseFloat(estimateCost(totalIn, totalOut))).toFixed(4);

  return (
    <div style={{ background:"#0a0f1e", border:`1px solid ${fromCache ? "#10B98133" : "#1e293b"}`, borderRadius:"12px", padding:"14px 16px", marginBottom:"14px", animation:"fadeInUp 0.4s ease" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", color: fromCache ? "#10B981" : "#10B981" }}>
          {fromCache ? "♻ CACHE HIT — $0.00 SPENT" : "⚡ TOKEN SAVINGS"}
        </span>
        {running && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#F59E0B", animation:"blink 1s ease-in-out infinite" }}>● LIVE</span>}
        {fromCache && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#10B981" }}>INSTANT</span>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px", marginBottom:"10px" }}>
        {[
          { label:"INPUT",  value: fromCache ? "0" : totalIn.toLocaleString(),  color:"#0EA5E9", sub:"tokens" },
          { label:"OUTPUT", value: fromCache ? "0" : totalOut.toLocaleString(), color:"#6366F1", sub:"tokens" },
          { label:"SAVED",  value: fromCache ? "100%" : `${savePct}%`,          color:"#10B981", sub: fromCache ? "all tokens" : "vs baseline" },
          { label:"COST",   value: `$${cost}`,                                  color:"#F59E0B", sub: fromCache ? "free!" : `saved $${savedCostAmt}` },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background:"#060b14", borderRadius:"8px", padding:"8px 6px", textAlign:"center" }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"8px", letterSpacing:"1.5px", color:"#475569", marginBottom:"3px" }}>{label}</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"12px", fontWeight:"600", color }}>{value}</div>
            <div style={{ fontSize:"9px", color:"#64748b", marginTop:"1px" }}>{sub}</div>
          </div>
        ))}
      </div>
      {!fromCache && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px" }}>
          {tokenLog.map((t, i) => {
            const agent = AGENTS[i]; if (!agent) return null;
            return (
              <div key={agent.id} title={`${t.input}in + ${t.output}out`} style={{ background:`${agent.color}11`, border:`1px solid ${agent.color}33`, borderRadius:"6px", padding:"2px 8px", display:"flex", alignItems:"center", gap:"5px" }}>
                <span style={{ fontSize:"9px", color:agent.color, fontFamily:"'Space Mono',monospace" }}>{agent.title}</span>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"9px", color:"#64748b" }}>{t.input+t.output}</span>
                <span style={{ fontSize:"8px", color:"#334155" }}>/{agent.maxTokens}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ onLoad, onClose }) {
  const [runs, setRuns] = useState(loadCache());

  const handleDelete = (id, e) => {
    e.stopPropagation();
    deleteCachedRun(id);
    setRuns(loadCache());
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000cc", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#0a0f1e", border:"1px solid #1e293b", borderRadius:"16px 16px 0 0", width:"100%", maxWidth:"860px", maxHeight:"70vh", display:"flex", flexDirection:"column", animation:"slideUp 0.3s ease" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #1e293b", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"11px", letterSpacing:"2px", color:"#F59E0B", fontWeight:"700" }}>RUN HISTORY</div>
            <div style={{ fontSize:"11px", color:"#64748b", marginTop:"2px" }}>Cached runs — reload free, no tokens spent</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid #334155", borderRadius:"6px", color:"#64748b", cursor:"pointer", padding:"4px 12px", fontSize:"12px" }}>✕</button>
        </div>

        <div style={{ overflowY:"auto", padding:"12px 16px", flex:1 }}>
          {runs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#475569", fontFamily:"'IBM Plex Mono',monospace", fontSize:"13px" }}>
              No cached runs yet.<br/>
              <span style={{ fontSize:"11px", color:"#334155" }}>Completed runs are saved here automatically.</span>
            </div>
          ) : (
            runs.map(run => {
              const expired = (Date.now() - run.timestamp) >= CACHE_TTL_MS;
              return (
                <div key={run.id} onClick={() => !expired && onLoad(run)} style={{
                  background: expired ? "#060b14" : "#0f172a",
                  border:`1px solid ${expired ? "#1e293b" : "#334155"}`,
                  borderRadius:"10px", padding:"12px 14px", marginBottom:"8px",
                  cursor: expired ? "not-allowed" : "pointer", transition:"all 0.2s",
                  opacity: expired ? 0.5 : 1,
                }}
                onMouseEnter={e => !expired && (e.currentTarget.style.borderColor = "#F59E0B55")}
                onMouseLeave={e => !expired && (e.currentTarget.style.borderColor = "#334155")}
                >
                  <div style={{ display:"flex", alignItems:"flex-start", gap:"10px" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:"13px", color: expired ? "#475569" : "#e2e8f0", lineHeight:"1.4", marginBottom:"6px", fontFamily:"'Syne',sans-serif" }}>
                        {run.goal}
                      </div>
                      <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#64748b" }}>{timeAgo(run.timestamp)}</span>
                        {expired
                          ? <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#EF4444", background:"#EF444411", padding:"1px 6px", borderRadius:"4px" }}>EXPIRED</span>
                          : <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#10B981", background:"#10B98111", padding:"1px 6px", borderRadius:"4px" }}>CACHED</span>
                        }
                        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"9px", color:"#475569" }}>
                          {run.tokenLog ? `${run.tokenLog.reduce((s,t)=>s+t.input+t.output,0).toLocaleString()} tokens` : ""}
                        </span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
                      {!expired && (
                        <button onClick={() => onLoad(run)} style={{ background:"#F59E0B22", border:"1px solid #F59E0B55", borderRadius:"6px", color:"#F59E0B", fontSize:"10px", fontFamily:"'Space Mono',monospace", padding:"4px 10px", cursor:"pointer", letterSpacing:"1px" }}>
                          LOAD
                        </button>
                      )}
                      <button onClick={e => handleDelete(run.id, e)} style={{ background:"transparent", border:"1px solid #334155", borderRadius:"6px", color:"#64748b", fontSize:"11px", padding:"4px 8px", cursor:"pointer" }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cache Hit Banner ──────────────────────────────────────────────────────────
function CacheHitBanner({ cachedRun, onUseCached, onRunFresh }) {
  return (
    <div style={{ background:"linear-gradient(135deg,#10B98111,#0a0f1e)", border:"1px solid #10B98133", borderRadius:"12px", padding:"14px 16px", marginBottom:"16px", animation:"fadeInUp 0.3s ease" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:"12px" }}>
        <div style={{ fontSize:"20px", flexShrink:0 }}>♻</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"10px", letterSpacing:"1.5px", color:"#10B981", marginBottom:"4px" }}>CACHED RESULT FOUND</div>
          <div style={{ fontSize:"12px", color:"#94a3b8", marginBottom:"10px" }}>
            Found a run from <strong style={{ color:"#e2e8f0" }}>{timeAgo(cachedRun.timestamp)}</strong>.
            Load it instantly for free, or run fresh to get new AI output.
          </div>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            <button onClick={onUseCached} style={{ background:"linear-gradient(135deg,#10B981,#059669)", border:"none", borderRadius:"8px", color:"#fff", fontFamily:"'Space Mono',monospace", fontSize:"10px", fontWeight:"700", letterSpacing:"1px", padding:"8px 16px", cursor:"pointer" }}>
              ♻  USE CACHED — FREE
            </button>
            <button onClick={onRunFresh} style={{ background:"transparent", border:"1px solid #334155", borderRadius:"8px", color:"#94a3b8", fontFamily:"'Space Mono',monospace", fontSize:"10px", padding:"8px 16px", cursor:"pointer", letterSpacing:"1px" }}>
              ▶  RUN FRESH
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, status, output, isSelected, onClick }) {
  const active = status !== STATUS.IDLE;
  return (
    <div onClick={() => output && onClick(agent.id)} style={{
      position:"relative",
      background: isSelected ? `linear-gradient(135deg,${agent.color}22,#0a0f1e)` : active ? `linear-gradient(135deg,${agent.color}0d,#0a0f1e)` : "#0a0f1e",
      border:`1px solid ${isSelected ? agent.color : active ? `${agent.color}55` : "#1e293b"}`,
      borderRadius:"12px", padding:"14px", cursor: output ? "pointer" : "default",
      transition:"all 0.3s", boxShadow: isSelected ? `0 0 20px ${agent.color}44` : "none", overflow:"hidden",
    }}>
      {status === STATUS.RUNNING && (
        <div style={{ position:"absolute", inset:0, borderRadius:"12px", border:`1px solid ${agent.color}`, animation:"ping 1.5s ease-in-out infinite", pointerEvents:"none" }} />
      )}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom: status === STATUS.DONE ? "8px" : 0 }}>
        <div style={{ width:"34px", height:"34px", borderRadius:"8px", flexShrink:0, background: active ? `${agent.color}22` : "#1e293b", border:`1px solid ${active ? agent.color : "#334155"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", color: active ? agent.color : "#475569", transition:"all 0.3s" }}>
          {status === STATUS.RUNNING ? <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</span> : agent.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"10px", fontWeight:"700", letterSpacing:"2px", color: active ? agent.color : "#475569" }}>{agent.title}</div>
          <div style={{ fontSize:"10px", color:"#64748b" }}>{agent.label} <span style={{ color:"#334155" }}>· {agent.maxTokens}t</span></div>
        </div>
        <div style={{ width:"8px", height:"8px", borderRadius:"50%", flexShrink:0, background: status === STATUS.DONE ? agent.color : status === STATUS.RUNNING ? agent.color : "#1e293b", border: status === STATUS.IDLE ? "1px solid #334155" : "none", boxShadow: status === STATUS.DONE ? `0 0 6px ${agent.color}` : "none", animation: status === STATUS.RUNNING ? "blink 0.8s ease-in-out infinite" : "none" }} />
      </div>
      {status === STATUS.DONE && output && (
        <div style={{ fontSize:"11px", color:"#64748b", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{output.substring(0, 90)}…</div>
      )}
      {status === STATUS.RUNNING && (
        <div style={{ display:"flex", gap:"4px", alignItems:"center", marginTop:"6px" }}>
          {[0,1,2].map(i => <div key={i} style={{ width:"4px", height:"4px", borderRadius:"50%", background:agent.color, animation:`bounce-dot 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
          <span style={{ fontSize:"10px", color:"#64748b", marginLeft:"4px" }}>Analyzing…</span>
        </div>
      )}
    </div>
  );
}

// ─── Output Panel ──────────────────────────────────────────────────────────────
function OutputPanel({ agent, content, onClose }) {
  if (!agent || !content) return null;
  return (
    <div style={{ background:"#0a0f1e", border:`1px solid ${agent.color}44`, borderRadius:"16px", overflow:"hidden", boxShadow:`0 0 40px ${agent.color}22` }}>
      <div style={{ background:`linear-gradient(90deg,${agent.color}22,transparent)`, borderBottom:`1px solid ${agent.color}33`, padding:"12px 16px", display:"flex", alignItems:"center", gap:"10px" }}>
        <span style={{ fontSize:"18px", color:agent.color }}>{agent.icon}</span>
        <div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:"11px", letterSpacing:"2px", color:agent.color, fontWeight:"700" }}>{agent.title} OUTPUT</div>
          <div style={{ fontSize:"10px", color:"#64748b" }}>{agent.label} · max {agent.maxTokens} tokens</div>
        </div>
        <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"1px solid #334155", borderRadius:"6px", color:"#64748b", cursor:"pointer", padding:"3px 10px", fontSize:"12px" }}>✕</button>
      </div>
      <div style={{ padding:"18px", maxHeight:"45vh", overflowY:"auto", scrollbarWidth:"thin", scrollbarColor:`${agent.color}44 transparent` }}>
        {content.split("\n").map((line, i) => {
          const isH = line.startsWith("#");
          const isBullet = line.startsWith("- ") || line.startsWith("• ");
          return (
            <div key={i} style={{ marginBottom: isH?"10px":"3px", marginTop: isH?"14px":0, fontFamily: isH?"'Space Mono',monospace":"'IBM Plex Mono',monospace", fontSize: isH?"11px":"13px", lineHeight:"1.7", color: isH ? agent.accent : isBullet?"#cbd5e1":"#94a3b8", letterSpacing: isH?"1.5px":0, borderLeft: isH?`2px solid ${agent.color}`:"none", paddingLeft: isH?"8px":isBullet?"4px":0 }}>
              {line.replace(/\*\*/g,"").replace(/^#+\s/,"")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Load from cache — instantly restore all state ─────────────────────────────
function restoreFromCache(run) {
  const restoredStatuses = Object.fromEntries(AGENTS.map(a => [a.id, run.outputs[a.id] ? STATUS.DONE : STATUS.IDLE]));
  return { outputs: run.outputs, statuses: restoredStatuses, tokenLog: run.tokenLog || [] };
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [goal, setGoal]           = useState("");
  const [running, setRunning]     = useState(false);
  const [statuses, setStatuses]   = useState(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
  const [outputs, setOutputs]     = useState({});
  const [selected, setSelected]   = useState(null);
  const [phase, setPhase]         = useState("");
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");
  const [tokenLog, setTokenLog]   = useState([]);
  const [fromCache, setFromCache] = useState(false);
  const [cachedRun, setCachedRun] = useState(null);   // pending cache hit
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef(false);

  const setStatus = (id, s) => setStatuses(p => ({ ...p, [id]: s }));
  const completedCount = Object.values(statuses).filter(s => s === STATUS.DONE).length;
  const progress = (completedCount / AGENTS.length) * 100;

  // Check cache whenever goal changes (debounced)
  useEffect(() => {
    if (!goal.trim() || running || done) { setCachedRun(null); return; }
    const hit = findCachedRun(goal);
    setCachedRun(hit || null);
  }, [goal]);

  // ── Load from cache ──────────────────────────────────────────────────────────
  const loadFromCache = (run) => {
    const { outputs: o, statuses: s, tokenLog: t } = restoreFromCache(run);
    setOutputs(o); setStatuses(s); setTokenLog(t);
    setDone(true); setFromCache(true); setSelected("reviewer");
    setCachedRun(null); setShowHistory(false);
  };

  // ── Run fresh ────────────────────────────────────────────────────────────────
  const runFresh = async () => {
    abortRef.current = false;
    setCachedRun(null); setRunning(true); setDone(false); setError("");
    setOutputs({}); setSelected(null); setTokenLog([]); setFromCache(false);
    setStatuses(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
    const collected = {};

    for (let i = 0; i < AGENTS.length; i++) {
      if (abortRef.current) break;
      const agent = AGENTS[i];
      setStatus(agent.id, STATUS.RUNNING);
      setPhase(agent.label);
      try {
        const prompt = buildPrompt(agent, goal, collected);
        const { text, usage } = await callAgent(agent, prompt);
        collected[agent.id] = text;
        setOutputs(p => ({ ...p, [agent.id]: text }));
        setTokenLog(p => [...p, usage]);
        setStatus(agent.id, STATUS.DONE);
        if (i === 0) setSelected(agent.id);
      } catch (e) {
        setStatus(agent.id, STATUS.ERROR);
        setError(e.message);
        collected[agent.id] = "Error: " + e.message;
        setTokenLog(p => [...p, { input: 0, output: 0 }]);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Save to cache after successful run
    if (!abortRef.current) {
      storeCachedRun(goal, collected, []);
    }
    setPhase(""); setRunning(false); setDone(true); setSelected("reviewer");
  };

  // ── Handle launch button ─────────────────────────────────────────────────────
  const handleLaunch = () => {
    const hit = findCachedRun(goal);
    if (hit) { setCachedRun(hit); } else { runFresh(); }
  };

  const reset = () => {
    abortRef.current = true;
    setRunning(false); setDone(false); setError(""); setFromCache(false);
    setOutputs({}); setSelected(null); setPhase(""); setTokenLog([]); setCachedRun(null);
    setStatuses(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
  };

  const historyCount = loadCache().length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@300;400;500&family=Syne:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#060b14;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
        @keyframes ping{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.08);opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes bounce-dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .goal-input:focus{outline:none;border-color:#F59E0B!important;box-shadow:0 0 0 3px #F59E0B22!important}
        .run-btn:active{transform:scale(0.97)}
        .agent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        @media(max-width:480px){.agent-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      {showHistory && (
        <HistoryPanel
          onLoad={loadFromCache}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div style={{ minHeight:"100vh", background:"#060b14", color:"#e2e8f0", fontFamily:"'Syne',sans-serif", padding:"env(safe-area-inset-top,20px) 14px 32px" }}>
        <div style={{ position:"fixed", inset:0, backgroundImage:"linear-gradient(#1e293b0d 1px,transparent 1px),linear-gradient(90deg,#1e293b0d 1px,transparent 1px)", backgroundSize:"36px 36px", pointerEvents:"none" }} />

        <div style={{ maxWidth:"860px", margin:"0 auto", position:"relative" }}>

          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:"24px", animation:"fadeInUp 0.5s ease", position:"relative" }}>
            {/* History button */}
            <button onClick={() => setShowHistory(true)} style={{ position:"absolute", right:0, top:0, background:"transparent", border:"1px solid #1e293b", borderRadius:"8px", color:"#64748b", fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px", padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:"5px" }}>
              ◷ HISTORY
              {historyCount > 0 && <span style={{ background:"#F59E0B", color:"#000", borderRadius:"10px", padding:"0px 5px", fontSize:"8px", fontWeight:"700" }}>{historyCount}</span>}
            </button>

            <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:"#F59E0B11", border:"1px solid #F59E0B33", borderRadius:"100px", padding:"3px 12px", marginBottom:"12px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#F59E0B", animation:"blink 1.5s ease-in-out infinite" }} />
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", color:"#F59E0B" }}>MULTI-AGENT SYSTEM v2.0</span>
            </div>
            <h1 style={{ fontSize:"clamp(26px,7vw,44px)", fontWeight:"800", letterSpacing:"-1px", background:"linear-gradient(135deg,#F59E0B,#FCD34D 40%,#fff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:"6px" }}>
              AgentFlow 2.0
            </h1>
            <p style={{ color:"#64748b", fontSize:"13px" }}>One goal → 9 AI agents → Full company execution</p>
          </div>

          {/* Input */}
          <div style={{ background:"#0a0f1e", border:"1px solid #1e293b", borderRadius:"16px", padding:"18px", marginBottom:"16px" }}>
            <label style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", color:"#F59E0B", display:"block", marginBottom:"8px" }}>MISSION BRIEF</label>
            <textarea className="goal-input" value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="Describe your business goal or product idea..."
              disabled={running}
              style={{ width:"100%", background:"#060b14", border:"1px solid #1e293b", borderRadius:"10px", color:"#e2e8f0", fontFamily:"'IBM Plex Mono',monospace", fontSize:"13px", padding:"12px", resize:"none", height:"74px", transition:"all 0.2s", lineHeight:"1.6" }}
            />
            {!running && !done && !cachedRun && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", marginTop:"8px" }}>
                {EXAMPLES.map((eg, i) => (
                  <button key={i} onClick={() => setGoal(eg)} style={{ background:"transparent", border:"1px solid #1e293b", borderRadius:"20px", color:"#64748b", fontSize:"10px", padding:"3px 9px", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace" }}>
                    {eg.substring(0, 38)}…
                  </button>
                ))}
              </div>
            )}
            {error && <div style={{ marginTop:"8px", padding:"8px 12px", background:"#EF444411", border:"1px solid #EF444433", borderRadius:"8px", color:"#FCA5A5", fontSize:"12px", fontFamily:"'IBM Plex Mono',monospace" }}>⚠ {error}</div>}
            <div style={{ display:"flex", gap:"8px", marginTop:"12px" }}>
              <button className="run-btn" onClick={handleLaunch} disabled={running || !goal.trim()} style={{
                flex:1, background: running || !goal.trim() ? "#1e293b" : cachedRun ? "linear-gradient(135deg,#10B981,#059669)" : "linear-gradient(135deg,#F59E0B,#D97706)",
                border:"none", borderRadius:"10px", color: running || !goal.trim() ? "#475569" : "#000",
                fontFamily:"'Space Mono',monospace", fontSize:"11px", fontWeight:"700", letterSpacing:"1.5px",
                padding:"13px", cursor: running || !goal.trim() ? "not-allowed" : "pointer", transition:"all 0.2s",
              }}>
                {running ? `⟳  ${phase.toUpperCase()} WORKING...` : cachedRun ? "♻  CACHED RESULT AVAILABLE" : "▶  LAUNCH COMPANY"}
              </button>
              {(running || done) && (
                <button onClick={reset} style={{ background:"transparent", border:"1px solid #334155", borderRadius:"10px", color:"#64748b", fontFamily:"'Space Mono',monospace", fontSize:"11px", padding:"13px 16px", cursor:"pointer", letterSpacing:"1px" }}>RESET</button>
              )}
            </div>
          </div>

          {/* Cache hit banner */}
          {cachedRun && !running && !done && (
            <CacheHitBanner
              cachedRun={cachedRun}
              onUseCached={() => loadFromCache(cachedRun)}
              onRunFresh={() => { setCachedRun(null); runFresh(); }}
            />
          )}

          {/* Progress */}
          {(running || done) && (
            <div style={{ background:"#0a0f1e", border:"1px solid #1e293b", borderRadius:"10px", padding:"10px 14px", marginBottom:"14px", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px", color: done ? (fromCache?"#10B981":"#10B981") : "#F59E0B", minWidth:"90px" }}>
                {done ? (fromCache ? "♻ FROM CACHE" : "✓ COMPLETE") : "RUNNING"}
              </span>
              <div style={{ flex:1, height:"3px", background:"#1e293b", borderRadius:"4px", overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${done ? 100 : progress}%`, background: done ? (fromCache?"linear-gradient(90deg,#10B981,#34D399)":"linear-gradient(90deg,#10B981,#34D399)") : "linear-gradient(90deg,#F59E0B,#FCD34D)", borderRadius:"4px", transition:"width 0.5s ease" }} />
              </div>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#475569", minWidth:"40px", textAlign:"right" }}>
                {done ? "9/9" : `${completedCount}/9`}
              </span>
            </div>
          )}

          {/* Token Meter */}
          <TokenMeter tokenLog={tokenLog} running={running} fromCache={fromCache} />

          {/* Agent Grid */}
          <div className="agent-grid" style={{ marginBottom:"16px" }}>
            {AGENTS.map(agent => (
              <AgentCard key={agent.id} agent={agent} status={statuses[agent.id]}
                output={outputs[agent.id]} isSelected={selected === agent.id} onClick={setSelected} />
            ))}
          </div>

          {/* Output panel */}
          {selected && outputs[selected] && (
            <div style={{ animation:"fadeInUp 0.4s ease" }}>
              <OutputPanel agent={AGENTS.find(a => a.id === selected)} content={outputs[selected]} onClose={() => setSelected(null)} />
            </div>
          )}

          {done && !selected && (
            <div style={{ background:`linear-gradient(135deg,${fromCache?"#10B98111":"#F59E0B11"},#0a0f1e)`, border:`1px solid ${fromCache?"#10B98144":"#F59E0B44"}`, borderRadius:"12px", padding:"14px 18px", textAlign:"center", animation:"fadeInUp 0.4s ease" }}>
              <p style={{ color:"#94a3b8", fontSize:"12px", marginBottom:"10px" }}>
                {fromCache ? "♻ Loaded from cache — $0.00 spent. Tap any card to view output." : "★ All 9 agents complete. Tap any card to view output."}
              </p>
              <button onClick={() => setSelected("reviewer")} style={{ background: fromCache ? "linear-gradient(135deg,#10B981,#059669)" : "linear-gradient(135deg,#F59E0B,#D97706)", border:"none", borderRadius:"8px", color:"#fff", fontFamily:"'Space Mono',monospace", fontSize:"11px", fontWeight:"700", letterSpacing:"1.5px", padding:"10px 20px", cursor:"pointer" }}>
                ★  VIEW BOARD REPORT
              </button>
            </div>
          )}

          <div style={{ textAlign:"center", marginTop:"20px", fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px", color:"#1e293b" }}>
            AGENTFLOW 2.0 · CACHED · TOKEN-OPTIMISED · PWA
          </div>
        </div>
      </div>
    </>
  );
}
