import { useState, useRef, useEffect } from "react";
import { generateAgentFlowPDF } from "./generatePDF";

// ─── Token helpers ─────────────────────────────────────────────────────────────
const estimateTokens = (text = "") => Math.ceil(text.length / 4);
const truncate = (text = "", maxChars) =>
  text.length > maxChars ? text.substring(0, maxChars) + "…[truncated]" : text;
const estimateCost = (i, o) => ((i / 1_000_000) * 3 + (o / 1_000_000) * 15).toFixed(4);
const BASELINE_OUTPUT = 9 * 1000;
const BASELINE_INPUT  = 9 * 800;

// ─── L1: localStorage cache (per device, instant) ──────────────────────────────
const L1_KEY    = "agentflow_runs";
const L1_MAX    = 10;
// No TTL — runs stored permanently until manually deleted

const normalizeGoal = (g) => g.toLowerCase().trim().replace(/\s+/g, " ");

function l1Load()           { try { return JSON.parse(localStorage.getItem(L1_KEY) || "[]"); } catch { return []; } }
function l1Save(runs)       { try { localStorage.setItem(L1_KEY, JSON.stringify(runs)); } catch {} }
function l1Delete(id)       { l1Save(l1Load().filter(r => r.id !== id)); }
function l1Find(goal) {
  const key = normalizeGoal(goal);
  return l1Load().find(r => r.goalKey === key) || null;
}
function l1Store(goal, outputs, tokenLog) {
  const key  = normalizeGoal(goal);
  const runs = l1Load().filter(r => r.goalKey !== key);
  l1Save([{ id: Date.now().toString(), goal, goalKey: key, timestamp: Date.now(), outputs, tokenLog }, ...runs].slice(0, L1_MAX));
}

// ─── L2: Vercel KV shared team cache ──────────────────────────────────────────
const KV_AVAILABLE = { checked: false, ok: false }; // runtime check

async function kvCheck() {
  if (KV_AVAILABLE.checked) return KV_AVAILABLE.ok;
  try {
    const r = await fetch("/api/shared-cache?list=true");
    KV_AVAILABLE.ok = r.ok && !(await r.clone().json()).error?.includes("KV_NOT_CONFIGURED");
    KV_AVAILABLE.checked = true;
  } catch { KV_AVAILABLE.ok = false; KV_AVAILABLE.checked = true; }
  return KV_AVAILABLE.ok;
}

async function kvFind(goal) {
  try {
    const r = await fetch(`/api/shared-cache?goal=${encodeURIComponent(goal)}`);
    const d = await r.json();
    return d.hit ? d : null;
  } catch { return null; }
}

async function kvStore(goal, outputs, tokenLog) {
  try {
    await fetch("/api/shared-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, outputs, tokenLog }),
    });
  } catch {}
}

async function kvList() {
  try {
    const r = await fetch("/api/shared-cache?list=true");
    const d = await r.json();
    return d.runs || [];
  } catch { return []; }
}

async function kvDelete(goal) {
  try {
    await fetch(`/api/shared-cache?goal=${encodeURIComponent(goal)}`, { method: "DELETE" });
  } catch {}
}

// ─── Agents ────────────────────────────────────────────────────────────────────
const AGENTS = [
  { id:"ceo",      title:"CEO",      label:"Chief Executive", icon:"◈", color:"#F59E0B", accent:"#FCD34D", maxTokens:450,  contextDeps:[],
    systemPrompt:`You are a CEO Agent. Given a business goal respond with ONLY:
1. Strategic Vision (2 sentences max)
2. Value Proposition (1 sentence)
3. Target Customer (1 sentence)
4. Top 3 Priorities (numbered, 1 line each)
5. 3 KPIs (1 line each)
Be extremely concise. No fluff.` },
  { id:"pm",       title:"PM",       label:"Product Manager", icon:"⬡", color:"#6366F1", accent:"#A5B4FC", maxTokens:650,  contextDeps:[{id:"ceo",chars:500}],
    systemPrompt:`You are a Senior PM. Be concise. Provide:
1. Problem Statement (2 sentences)
2. 2 User Personas (name, role, 1 pain point each)
3. MVP Features (5 features, P0/P1/P2, 1 line each)
4. 3-Month Roadmap (3 bullet milestones)
5. 2 Success Metrics` },
  { id:"ux",       title:"UX",       label:"UX Designer",     icon:"◎", color:"#EC4899", accent:"#F9A8D4", maxTokens:550,  contextDeps:[{id:"ceo",chars:200},{id:"pm",chars:400}],
    systemPrompt:`You are a Senior UX Designer. Be brief. Provide:
1. User Journey (5 steps, 1 line each)
2. Key Screens (5 screens, name + 1-line purpose)
3. 3 Design Principles (1 line each)
4. Nav Structure (1 sentence)
5. 2 Accessibility rules` },
  { id:"eng",      title:"ENG",      label:"Engineer",        icon:"⬢", color:"#10B981", accent:"#6EE7B7", maxTokens:650,  contextDeps:[{id:"ceo",chars:200},{id:"pm",chars:400}],
    systemPrompt:`You are a Software Architect. Be precise. Provide:
1. Tech Stack (frontend / backend / DB / AI — 1 line each)
2. Architecture (3 components, 1 line each)
3. 3 Core API Endpoints (METHOD /path — purpose)
4. 2 Key Data Models (entity + 3 fields)
5. Timeline (3 phases with week count)` },
  { id:"research", title:"RESEARCH", label:"Market Research", icon:"◉", color:"#0EA5E9", accent:"#7DD3FC", maxTokens:550,  contextDeps:[],
    systemPrompt:`You are a Market Analyst. Be data-driven and brief:
1. Market Size: TAM / SAM / SOM (1 line each with $ figure)
2. Top 3 Competitors (name + 1 strength + 1 weakness)
3. 3 Market Gaps (1 line each)
4. Top 2 Acquisition Channels (with tactic)
5. 2 Supporting Trends (1 line each)` },
  { id:"marketing",title:"MKTG",     label:"Marketing",       icon:"◆", color:"#F97316", accent:"#FED7AA", maxTokens:600,  contextDeps:[{id:"ceo",chars:250},{id:"pm",chars:300}],
    systemPrompt:`You are a Growth Marketer. Provide:
1. Tagline (under 8 words)
2. LinkedIn Post (100 words max — hook, value, CTA)
3. Hero Copy: headline + subheadline + 3 bullets + CTA text
4. GTM: Pre-launch / Launch / Growth (2 tactics each)
5. Top 2 Channels + tactics` },
  { id:"finance",  title:"FIN",      label:"Finance",         icon:"◇", color:"#8B5CF6", accent:"#C4B5FD", maxTokens:580,  contextDeps:[{id:"ceo",chars:200},{id:"pm",chars:250},{id:"research",chars:300}],
    systemPrompt:`You are a Startup CFO. Be specific with numbers:
1. Pricing: 2-3 tiers (name, price, 2 features each)
2. Revenue: Month 3 / Month 6 / Year 1 ($ with 1 assumption each)
3. Costs: Top 3 categories + monthly estimate
4. Unit Economics: CAC target / LTV target / ratio
5. Funding: Amount needed + 3 use-of-funds lines
6. Break-even: Month # at what MRR` },
  { id:"qa",       title:"QA",       label:"QA & Risk",       icon:"⊗", color:"#EF4444", accent:"#FCA5A5", maxTokens:600,  contextDeps:[{id:"ceo",chars:200},{id:"pm",chars:300},{id:"eng",chars:300}],
    systemPrompt:`You are a QA & Risk Lead. Be critical:
1. Top 5 Risks (name, High/Med/Low, 1-line mitigation each)
2. 3 Product Gaps (what's missing)
3. 2 Technical Debt risks
4. Compliance flags (HIPAA/GDPR/etc if relevant)
5. Go/No-Go Checklist (8 items, check/cross format)` },
  { id:"reviewer", title:"BOARD",    label:"Board Reviewer",  icon:"★", color:"#F59E0B", accent:"#FEF3C7", maxTokens:700,
    contextDeps:[{id:"ceo",chars:300},{id:"pm",chars:300},{id:"ux",chars:200},{id:"eng",chars:250},{id:"research",chars:250},{id:"marketing",chars:200},{id:"finance",chars:250},{id:"qa",chars:300}],
    systemPrompt:`You are a Board Reviewer. Synthesize everything concisely:
1. Executive Summary (3 sentences)
2. Viability Score: X/10 + 2-sentence rationale
3. Top 3 Strengths (1 line each)
4. Top 3 Concerns (1 line each)
5. Next 5 Actions (numbered, 1 line each, in priority order)
6. Verdict: GO / NO-GO / PIVOT + 2-sentence justification` },
];

const STATUS   = { IDLE:"idle", RUNNING:"running", DONE:"done", ERROR:"error" };
const EXAMPLES = [
  "A mobile app that helps freelancers send invoices and track payments using AI",
  "Create an AI product for doctors to summarize medical reports",
  "Build a SaaS platform for small restaurants to manage inventory with AI",
  "Launch a B2B tool that auto-generates legal contracts using AI",
];

// ─── Build prompt ──────────────────────────────────────────────────────────────
function buildPrompt(agent, goal, collected) {
  let p = `Business Goal: "${goal}"\n\n`;
  if (!agent.contextDeps.length) { p += "Fulfill your role for this business goal."; return p; }
  agent.contextDeps.forEach(({ id, chars }) => {
    const ag = AGENTS.find(a => a.id === id);
    if (collected[id]) p += `[${ag.label.toUpperCase()} — summary]\n${truncate(collected[id], chars)}\n\n`;
  });
  p += agent.id === "reviewer" ? "Provide your board-level synthesis." : "Now fulfill your role.";
  return p;
}

// ─── API call ──────────────────────────────────────────────────────────────────
async function callAgent(agent, contextPrompt) {
  const res = await fetch("/api/chat", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:agent.maxTokens, system:agent.systemPrompt, messages:[{role:"user",content:contextPrompt}] }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "API error"); }
  const data = await res.json();
  const text = data.content?.[0]?.text || "No output.";
  return { text, usage:{ input: data.usage?.input_tokens || estimateTokens(contextPrompt + agent.systemPrompt), output: data.usage?.output_tokens || estimateTokens(text) } };
}

// ─── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(d/3600000), dy=Math.floor(d/86400000);
  if (dy>0) return `${dy}d ago`; if (h>0) return `${h}h ago`; if (m>0) return `${m}m ago`; return "just now";
}

// ─── Token Meter ───────────────────────────────────────────────────────────────
function TokenMeter({ tokenLog, running, cacheSource }) {
  if (!tokenLog.length) return null;
  const totalIn  = tokenLog.reduce((s,t)=>s+t.input,0);
  const totalOut = tokenLog.reduce((s,t)=>s+t.output,0);
  const savePct  = cacheSource ? 100 : Math.round(((Math.max(0,BASELINE_OUTPUT-totalOut)+Math.max(0,BASELINE_INPUT-totalIn))/(BASELINE_OUTPUT+BASELINE_INPUT))*100);
  const cost     = cacheSource ? "0.0000" : estimateCost(totalIn, totalOut);
  const saved    = (parseFloat(estimateCost(BASELINE_INPUT, BASELINE_OUTPUT)) - parseFloat(estimateCost(totalIn, totalOut))).toFixed(4);

  const sourceColor = cacheSource === "team" ? "#10B981" : cacheSource === "local" ? "#0EA5E9" : "#10B981";
  const sourceLabel = cacheSource === "team" ? "♻ TEAM CACHE HIT — $0.00" : cacheSource === "local" ? "💾 LOCAL CACHE HIT — $0.00" : "⚡ TOKEN SAVINGS";

  return (
    <div style={{background:"#0a0f1e",border:`1px solid ${cacheSource?"#10B98133":"#1e293b"}`,borderRadius:"12px",padding:"14px 16px",marginBottom:"14px",animation:"fadeInUp 0.4s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:sourceColor}}>{sourceLabel}</span>
        {running&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"#F59E0B",animation:"blink 1s ease-in-out infinite"}}>● LIVE</span>}
        {cacheSource&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:sourceColor,background:`${sourceColor}11`,padding:"2px 8px",borderRadius:"4px"}}>{cacheSource==="team"?"SHARED":"DEVICE"}</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom: cacheSource?"0":"10px"}}>
        {[
          {label:"INPUT",  value:cacheSource?"0":totalIn.toLocaleString(),  color:"#0EA5E9", sub:"tokens"},
          {label:"OUTPUT", value:cacheSource?"0":totalOut.toLocaleString(), color:"#6366F1", sub:"tokens"},
          {label:"SAVED",  value:`${savePct}%`,                             color:"#10B981", sub:cacheSource?"free!":"vs baseline"},
          {label:"COST",   value:`$${cost}`,                                color:"#F59E0B", sub:cacheSource?"free!": `saved $${saved}`},
        ].map(({label,value,color,sub})=>(
          <div key={label} style={{background:"#060b14",borderRadius:"8px",padding:"8px 6px",textAlign:"center"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",letterSpacing:"1.5px",color:"#475569",marginBottom:"3px"}}>{label}</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",fontWeight:"600",color}}>{value}</div>
            <div style={{fontSize:"9px",color:"#64748b",marginTop:"1px"}}>{sub}</div>
          </div>
        ))}
      </div>
      {!cacheSource&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
          {tokenLog.map((t,i)=>{const ag=AGENTS[i];if(!ag)return null;return(
            <div key={ag.id} title={`${t.input}in+${t.output}out`} style={{background:`${ag.color}11`,border:`1px solid ${ag.color}33`,borderRadius:"6px",padding:"2px 8px",display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{fontSize:"9px",color:ag.color,fontFamily:"'Space Mono',monospace"}}>{ag.title}</span>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"9px",color:"#64748b"}}>{t.input+t.output}</span>
              <span style={{fontSize:"8px",color:"#334155"}}>/{ag.maxTokens}</span>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

// ─── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ onLoad, onClose, kvOk }) {
  const [localRuns, setLocalRuns] = useState([]);
  const [teamRuns,  setTeamRuns]  = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [tab, setTab] = useState("team");

  useEffect(() => {
    setLocalRuns(l1Load());
    if (kvOk) {
      setLoadingTeam(true);
      kvList().then(r => { setTeamRuns(r); setLoadingTeam(false); });
    }
  }, []);

  const handleDeleteLocal = (id, e) => {
    e.stopPropagation();
    l1Delete(id);
    setLocalRuns(l1Load());
  };

  const handleDeleteTeam = async (goal, e) => {
    e.stopPropagation();
    await kvDelete(goal);
    setTeamRuns(t => t.filter(r => r.goal !== goal));
  };

  const TabBtn = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      flex:1, background: tab===id ? "#1e293b" : "transparent",
      border:`1px solid ${tab===id?"#334155":"transparent"}`,
      borderRadius:"8px", color: tab===id?"#e2e8f0":"#64748b",
      fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px",
      padding:"8px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
    }}>
      {label}
      {count > 0 && <span style={{background: id==="team"?"#10B981":"#0EA5E9",color:"#000",borderRadius:"10px",padding:"0 5px",fontSize:"8px",fontWeight:"700"}}>{count}</span>}
    </button>
  );

  const RunItem = ({ run, source, onDelete }) => (
    <div onClick={() => onLoad(run, source)} style={{
      background:"#0f172a", border:"1px solid #1e293b", borderRadius:"10px",
      padding:"12px 14px", marginBottom:"8px", cursor:"pointer", transition:"all 0.2s",
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor="#F59E0B55"}
    onMouseLeave={e=>e.currentTarget.style.borderColor="#1e293b"}
    >
      <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"13px",color:"#e2e8f0",lineHeight:"1.4",marginBottom:"6px",fontFamily:"'Syne',sans-serif"}}>{run.goal}</div>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"#64748b"}}>{timeAgo(run.timestamp)}</span>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color: source==="team"?"#10B981":"#0EA5E9",background: source==="team"?"#10B98111":"#0EA5E9111",padding:"1px 6px",borderRadius:"4px"}}>
              {source==="team"?"SHARED":"LOCAL"}
            </span>
            {run.tokenTotal>0&&<span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"9px",color:"#475569"}}>{run.tokenTotal.toLocaleString()} tok</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:"6px",flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onLoad(run,source);}} style={{background:"#F59E0B22",border:"1px solid #F59E0B55",borderRadius:"6px",color:"#F59E0B",fontSize:"10px",fontFamily:"'Space Mono',monospace",padding:"4px 10px",cursor:"pointer",letterSpacing:"1px"}}>LOAD</button>
          <button onClick={e=>onDelete(run.id||run.goal,e)} style={{background:"transparent",border:"1px solid #334155",borderRadius:"6px",color:"#64748b",fontSize:"11px",padding:"4px 8px",cursor:"pointer"}}>🗑</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:"860px",maxHeight:"75vh",display:"flex",flexDirection:"column",animation:"slideUp 0.3s ease"}}>

        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",letterSpacing:"2px",color:"#F59E0B",fontWeight:"700"}}>RUN HISTORY</div>
            <div style={{fontSize:"11px",color:"#64748b",marginTop:"2px"}}>All cached runs — reload free, zero tokens</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #334155",borderRadius:"6px",color:"#64748b",cursor:"pointer",padding:"4px 12px",fontSize:"12px"}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:"6px",padding:"10px 16px",borderBottom:"1px solid #1e293b",flexShrink:0}}>
          <TabBtn id="team"  label="TEAM SHARED" count={teamRuns.length} />
          <TabBtn id="local" label="MY DEVICE"   count={localRuns.length} />
        </div>

        {/* Team cache status banner */}
        {tab==="team" && !kvOk && (
          <div style={{margin:"12px 16px",padding:"10px 14px",background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:"8px",fontSize:"11px",color:"#FCD34D",fontFamily:"'IBM Plex Mono',monospace",lineHeight:"1.6"}}>
            ⚠ Team cache not set up yet.<br/>
            <span style={{color:"#64748b"}}>Go to <code style={{color:"#10B981"}}>upstash.com</code> → create free Redis DB → add 2 env vars to Vercel.</span>
          </div>
        )}

        {/* Run list */}
        <div style={{overflowY:"auto",padding:"12px 16px",flex:1}}>
          {tab==="team" && kvOk && (
            loadingTeam
              ? <div style={{textAlign:"center",padding:"30px",color:"#475569",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>Loading team runs…</div>
              : teamRuns.length===0
                ? <div style={{textAlign:"center",padding:"30px",color:"#475569",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>No shared runs yet.<br/><span style={{fontSize:"10px",color:"#334155"}}>First run by any team member will appear here.</span></div>
                : teamRuns.map(r=><RunItem key={r.goalKey} run={{...r,id:r.goalKey}} source="team" onDelete={(_, e)=>handleDeleteTeam(r.goal, e)} />)
          )}
          {tab==="local" && (
            localRuns.length===0
              ? <div style={{textAlign:"center",padding:"30px",color:"#475569",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>No runs on this device yet.</div>
              : localRuns.map(r=><RunItem key={r.id} run={r} source="local" onDelete={handleDeleteLocal} />)
          )}
        </div>

        {/* Legend */}
        <div style={{padding:"10px 16px",borderTop:"1px solid #1e293b",flexShrink:0,display:"flex",gap:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
            <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#10B981"}}/>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"#64748b",letterSpacing:"1px"}}>TEAM = all devices, auto-saved</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
            <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#0EA5E9"}}/>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"#64748b",letterSpacing:"1px"}}>LOCAL = this device only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Cache Hit Banner ──────────────────────────────────────────────────────────
function CacheHitBanner({ cached, source, onUseCached, onRunFresh }) {
  const isTeam  = source === "team";
  const color   = isTeam ? "#10B981" : "#0EA5E9";
  const label   = isTeam ? "TEAM CACHE" : "LOCAL CACHE";
  const icon    = isTeam ? "♻" : "💾";
  const freeMsg = isTeam ? "Saved by your team — free for everyone." : "From your device cache — free.";

  return (
    <div style={{background:`linear-gradient(135deg,${color}11,#0a0f1e)`,border:`1px solid ${color}33`,borderRadius:"12px",padding:"14px 16px",marginBottom:"16px",animation:"fadeInUp 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:"12px"}}>
        <div style={{fontSize:"20px",flexShrink:0}}>{icon}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",letterSpacing:"1.5px",color}}>{label} FOUND</span>
            {isTeam&&<span style={{background:"#10B98122",border:"1px solid #10B98133",borderRadius:"20px",padding:"1px 8px",fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"#10B981"}}>SHARED</span>}
          </div>
          <div style={{fontSize:"12px",color:"#94a3b8",marginBottom:"10px"}}>
            Run from <strong style={{color:"#e2e8f0"}}>{timeAgo(cached.timestamp)}</strong>. {freeMsg}
          </div>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <button onClick={onUseCached} style={{background:`linear-gradient(135deg,${color},${isTeam?"#059669":"#0284C7"})`,border:"none",borderRadius:"8px",color:"#fff",fontFamily:"'Space Mono',monospace",fontSize:"10px",fontWeight:"700",letterSpacing:"1px",padding:"8px 16px",cursor:"pointer"}}>
              {icon}  USE CACHED — FREE
            </button>
            <button onClick={onRunFresh} style={{background:"transparent",border:"1px solid #334155",borderRadius:"8px",color:"#94a3b8",fontFamily:"'Space Mono',monospace",fontSize:"10px",padding:"8px 16px",cursor:"pointer",letterSpacing:"1px"}}>
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
    <div onClick={()=>output&&onClick(agent.id)} style={{
      position:"relative",
      background:isSelected?`linear-gradient(135deg,${agent.color}22,#0a0f1e)`:active?`linear-gradient(135deg,${agent.color}0d,#0a0f1e)`:"#0a0f1e",
      border:`1px solid ${isSelected?agent.color:active?`${agent.color}55`:"#1e293b"}`,
      borderRadius:"12px",padding:"14px",cursor:output?"pointer":"default",
      transition:"all 0.3s",boxShadow:isSelected?`0 0 20px ${agent.color}44`:"none",overflow:"hidden",
    }}>
      {status===STATUS.RUNNING&&<div style={{position:"absolute",inset:0,borderRadius:"12px",border:`1px solid ${agent.color}`,animation:"ping 1.5s ease-in-out infinite",pointerEvents:"none"}}/>}
      <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:status===STATUS.DONE?"8px":0}}>
        <div style={{width:"34px",height:"34px",borderRadius:"8px",flexShrink:0,background:active?`${agent.color}22`:"#1e293b",border:`1px solid ${active?agent.color:"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",color:active?agent.color:"#475569",transition:"all 0.3s"}}>
          {status===STATUS.RUNNING?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>:agent.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"10px",fontWeight:"700",letterSpacing:"2px",color:active?agent.color:"#475569"}}>{agent.title}</div>
          <div style={{fontSize:"10px",color:"#64748b"}}>{agent.label} <span style={{color:"#334155"}}>· {agent.maxTokens}t</span></div>
        </div>
        <div style={{width:"8px",height:"8px",borderRadius:"50%",flexShrink:0,background:status===STATUS.DONE?agent.color:status===STATUS.RUNNING?agent.color:"#1e293b",border:status===STATUS.IDLE?"1px solid #334155":"none",boxShadow:status===STATUS.DONE?`0 0 6px ${agent.color}`:"none",animation:status===STATUS.RUNNING?"blink 0.8s ease-in-out infinite":"none"}}/>
      </div>
      {status===STATUS.DONE&&output&&<div style={{fontSize:"11px",color:"#64748b",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{output.substring(0,90)}…</div>}
      {status===STATUS.RUNNING&&<div style={{display:"flex",gap:"4px",alignItems:"center",marginTop:"6px"}}>{[0,1,2].map(i=><div key={i} style={{width:"4px",height:"4px",borderRadius:"50%",background:agent.color,animation:`bounce-dot 1.2s ${i*0.2}s ease-in-out infinite`}}/>)}<span style={{fontSize:"10px",color:"#64748b",marginLeft:"4px"}}>Analyzing…</span></div>}
    </div>
  );
}

// ─── Output Panel ──────────────────────────────────────────────────────────────
function OutputPanel({ agent, content, onClose }) {
  if (!agent||!content) return null;
  return (
    <div style={{background:"#0a0f1e",border:`1px solid ${agent.color}44`,borderRadius:"16px",overflow:"hidden",boxShadow:`0 0 40px ${agent.color}22`}}>
      <div style={{background:`linear-gradient(90deg,${agent.color}22,transparent)`,borderBottom:`1px solid ${agent.color}33`,padding:"12px 16px",display:"flex",alignItems:"center",gap:"10px"}}>
        <span style={{fontSize:"18px",color:agent.color}}>{agent.icon}</span>
        <div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:"11px",letterSpacing:"2px",color:agent.color,fontWeight:"700"}}>{agent.title} OUTPUT</div>
          <div style={{fontSize:"10px",color:"#64748b"}}>{agent.label} · max {agent.maxTokens} tokens</div>
        </div>
        <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",border:"1px solid #334155",borderRadius:"6px",color:"#64748b",cursor:"pointer",padding:"3px 10px",fontSize:"12px"}}>✕</button>
      </div>
      <div style={{padding:"18px",maxHeight:"45vh",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:`${agent.color}44 transparent`}}>
        {content.split("\n").map((line,i)=>{
          const isH=line.startsWith("#"),isBullet=line.startsWith("- ")||line.startsWith("• ");
          return <div key={i} style={{marginBottom:isH?"10px":"3px",marginTop:isH?"14px":0,fontFamily:isH?"'Space Mono',monospace":"'IBM Plex Mono',monospace",fontSize:isH?"11px":"13px",lineHeight:"1.7",color:isH?agent.accent:isBullet?"#cbd5e1":"#94a3b8",letterSpacing:isH?"1.5px":0,borderLeft:isH?`2px solid ${agent.color}`:"none",paddingLeft:isH?"8px":isBullet?"4px":0}}>{line.replace(/\*\*/g,"").replace(/^#+\s/,"")}</div>;
        })}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [goal, setGoal]           = useState("");
  const [running, setRunning]     = useState(false);
  const [statuses, setStatuses]   = useState(Object.fromEntries(AGENTS.map(a=>[a.id,STATUS.IDLE])));
  const [outputs, setOutputs]     = useState({});
  const [selected, setSelected]   = useState(null);
  const [phase, setPhase]         = useState("");
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");
  const [tokenLog, setTokenLog]   = useState([]);
  const [cacheSource, setCacheSource] = useState(null); // null | "local" | "team"
  const [cacheHit, setCacheHit]   = useState(null);     // { data, source }
  const [showHistory, setShowHistory] = useState(false);
  const [kvOk, setKvOk]           = useState(false);
  const abortRef                  = useRef(false);

  const setStatus = (id,s) => setStatuses(p=>({...p,[id]:s}));
  const completedCount = Object.values(statuses).filter(s=>s===STATUS.DONE).length;
  const progress = (completedCount/AGENTS.length)*100;

  // Check KV availability once on mount
  useEffect(()=>{ kvCheck().then(ok=>setKvOk(ok)); },[]);

  // Check cache whenever goal changes
  useEffect(()=>{
    if (!goal.trim()||running||done) { setCacheHit(null); return; }
    const local = l1Find(goal);
    if (local) { setCacheHit({ data:local, source:"local" }); return; }
    if (kvOk) {
      kvFind(goal).then(team => {
        if (team) setCacheHit({ data:team, source:"team" });
        else setCacheHit(null);
      });
    } else setCacheHit(null);
  }, [goal, kvOk]);

  // Load from cache (either source)
  const loadFromCache = (run, source) => {
    const allDone = Object.fromEntries(AGENTS.map(a=>[a.id, run.outputs[a.id]?STATUS.DONE:STATUS.IDLE]));
    setOutputs(run.outputs); setStatuses(allDone);
    setTokenLog(run.tokenLog||[]); setCacheSource(source);
    setDone(true); setSelected("reviewer"); setCacheHit(null); setShowHistory(false);
    // Promote to L1 if it came from team
    if (source==="team") l1Store(run.goal, run.outputs, run.tokenLog||[]);
  };

  // Run all agents fresh
  const runFresh = async () => {
    abortRef.current = false;
    setCacheHit(null); setRunning(true); setDone(false); setError("");
    setOutputs({}); setSelected(null); setTokenLog([]); setCacheSource(null);
    setStatuses(Object.fromEntries(AGENTS.map(a=>[a.id,STATUS.IDLE])));
    const collected = {};
    const log = [];

    for (let i=0; i<AGENTS.length; i++) {
      if (abortRef.current) break;
      const agent = AGENTS[i];
      setStatus(agent.id, STATUS.RUNNING); setPhase(agent.label);
      try {
        const { text, usage } = await callAgent(agent, buildPrompt(agent, goal, collected));
        collected[agent.id] = text;
        log.push(usage);
        setOutputs(p=>({...p,[agent.id]:text}));
        setTokenLog([...log]);
        setStatus(agent.id, STATUS.DONE);
        if (i===0) setSelected(agent.id);
      } catch(e) {
        setStatus(agent.id, STATUS.ERROR); setError(e.message);
        collected[agent.id]="Error: "+e.message; log.push({input:0,output:0});
      }
      await new Promise(r=>setTimeout(r,200));
    }

    if (!abortRef.current) {
      // Save to BOTH caches automatically
      l1Store(goal, collected, log);
      if (kvOk) kvStore(goal, collected, log);
    }
    setPhase(""); setRunning(false); setDone(true); setSelected("reviewer");
  };

  const handleLaunch = () => {
    if (cacheHit) setCacheHit(cacheHit); // show banner (already shown)
    else runFresh();
  };

  const reset = () => {
    abortRef.current=true;
    setRunning(false);setDone(false);setError("");setCacheSource(null);
    setOutputs({});setSelected(null);setPhase("");setTokenLog([]);setCacheHit(null);
    setStatuses(Object.fromEntries(AGENTS.map(a=>[a.id,STATUS.IDLE])));
  };

  const localCount = l1Load().length;

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

      {showHistory && <HistoryPanel onLoad={loadFromCache} onClose={()=>setShowHistory(false)} kvOk={kvOk} />}

      <div style={{minHeight:"100vh",background:"#060b14",color:"#e2e8f0",fontFamily:"'Syne',sans-serif",padding:"env(safe-area-inset-top,20px) 14px 32px"}}>
        <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(#1e293b0d 1px,transparent 1px),linear-gradient(90deg,#1e293b0d 1px,transparent 1px)",backgroundSize:"36px 36px",pointerEvents:"none"}}/>

        <div style={{maxWidth:"860px",margin:"0 auto",position:"relative"}}>

          {/* Header */}
          <div style={{textAlign:"center",marginBottom:"24px",animation:"fadeInUp 0.5s ease",position:"relative"}}>
            <button onClick={()=>setShowHistory(true)} style={{position:"absolute",right:0,top:0,background:"transparent",border:"1px solid #1e293b",borderRadius:"8px",color:"#64748b",fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"1.5px",padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:"5px"}}>
              ◷ HISTORY
              {(localCount>0||(kvOk))&&<span style={{background:"#F59E0B",color:"#000",borderRadius:"10px",padding:"0px 5px",fontSize:"8px",fontWeight:"700"}}>{localCount}</span>}
            </button>
            <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"#F59E0B11",border:"1px solid #F59E0B33",borderRadius:"100px",padding:"3px 12px",marginBottom:"12px"}}>
              <div style={{width:"5px",height:"5px",borderRadius:"50%",background:"#F59E0B",animation:"blink 1.5s ease-in-out infinite"}}/>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:"#F59E0B"}}>MULTI-AGENT SYSTEM v2.0</span>
              {kvOk&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:"8px",color:"#10B981",background:"#10B98111",padding:"1px 6px",borderRadius:"10px",marginLeft:"2px"}}>TEAM SYNC ●</span>}
            </div>
            <h1 style={{fontSize:"clamp(26px,7vw,44px)",fontWeight:"800",letterSpacing:"-1px",background:"linear-gradient(135deg,#F59E0B,#FCD34D 40%,#fff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:"6px"}}>AgentFlow 2.0</h1>
            <p style={{color:"#64748b",fontSize:"13px"}}>One goal → 9 AI agents → Full company execution</p>
          </div>

          {/* Input */}
          <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"16px",padding:"18px",marginBottom:"16px"}}>
            <label style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"2px",color:"#F59E0B",display:"block",marginBottom:"8px"}}>MISSION BRIEF</label>
            <textarea className="goal-input" value={goal} onChange={e=>setGoal(e.target.value)}
              placeholder="Describe your business goal or product idea..."
              disabled={running}
              style={{width:"100%",background:"#060b14",border:"1px solid #1e293b",borderRadius:"10px",color:"#e2e8f0",fontFamily:"'IBM Plex Mono',monospace",fontSize:"13px",padding:"12px",resize:"none",height:"74px",transition:"all 0.2s",lineHeight:"1.6"}}
            />
            {!running&&!done&&!cacheHit&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginTop:"8px"}}>
                {EXAMPLES.map((eg,i)=><button key={i} onClick={()=>setGoal(eg)} style={{background:"transparent",border:"1px solid #1e293b",borderRadius:"20px",color:"#64748b",fontSize:"10px",padding:"3px 9px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>{eg.substring(0,38)}…</button>)}
              </div>
            )}
            {error&&<div style={{marginTop:"8px",padding:"8px 12px",background:"#EF444411",border:"1px solid #EF444433",borderRadius:"8px",color:"#FCA5A5",fontSize:"12px",fontFamily:"'IBM Plex Mono',monospace"}}>⚠ {error}</div>}
            <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
              <button className="run-btn" onClick={runFresh} disabled={running||!goal.trim()} style={{
                flex:1, background:running||!goal.trim()?"#1e293b":cacheHit?"linear-gradient(135deg,#1e293b,#0f172a)":"linear-gradient(135deg,#F59E0B,#D97706)",
                border:cacheHit?"1px solid #334155":"none",
                borderRadius:"10px",color:running||!goal.trim()?"#475569":cacheHit?"#64748b":"#000",
                fontFamily:"'Space Mono',monospace",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",
                padding:"13px",cursor:running||!goal.trim()?"not-allowed":"pointer",transition:"all 0.2s",
              }}>
                {running?`⟳  ${phase.toUpperCase()} WORKING...`:cacheHit?"▶  RUN FRESH":"▶  LAUNCH COMPANY"}
              </button>
              {(running||done)&&<button onClick={reset} style={{background:"transparent",border:"1px solid #334155",borderRadius:"10px",color:"#64748b",fontFamily:"'Space Mono',monospace",fontSize:"11px",padding:"13px 16px",cursor:"pointer",letterSpacing:"1px"}}>RESET</button>}
            </div>
          </div>

          {/* Cache hit banner */}
          {cacheHit&&!running&&!done&&(
            <CacheHitBanner
              cached={cacheHit.data}
              source={cacheHit.source}
              onUseCached={()=>loadFromCache(cacheHit.data, cacheHit.source)}
              onRunFresh={()=>{setCacheHit(null);runFresh();}}
            />
          )}

          {/* Progress */}
          {(running||done)&&(
            <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:"10px",padding:"10px 14px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px"}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"1.5px",color:done?"#10B981":"#F59E0B",minWidth:"100px"}}>
                {done?(cacheSource==="team"?"♻ TEAM CACHE":cacheSource==="local"?"💾 LOCAL CACHE":"✓ COMPLETE"):"RUNNING"}
              </span>
              <div style={{flex:1,height:"3px",background:"#1e293b",borderRadius:"4px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${done?100:progress}%`,background:done?"linear-gradient(90deg,#10B981,#34D399)":"linear-gradient(90deg,#F59E0B,#FCD34D)",borderRadius:"4px",transition:"width 0.5s ease"}}/>
              </div>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:"9px",color:"#475569",minWidth:"40px",textAlign:"right"}}>{done?"9/9":`${completedCount}/9`}</span>
            </div>
          )}

          {/* Token Meter */}
          <TokenMeter tokenLog={tokenLog} running={running} cacheSource={cacheSource} />

          {/* Agent Grid */}
          <div className="agent-grid" style={{marginBottom:"16px"}}>
            {AGENTS.map(agent=><AgentCard key={agent.id} agent={agent} status={statuses[agent.id]} output={outputs[agent.id]} isSelected={selected===agent.id} onClick={setSelected}/>)}
          </div>

          {/* Output panel */}
          {selected&&outputs[selected]&&(
            <div style={{animation:"fadeInUp 0.4s ease"}}>
              <OutputPanel agent={AGENTS.find(a=>a.id===selected)} content={outputs[selected]} onClose={()=>setSelected(null)}/>
            </div>
          )}

          {/* Done CTA */}
          {done&&!selected&&(
            <div style={{background:`linear-gradient(135deg,${cacheSource?"#10B98111":"#F59E0B11"},#0a0f1e)`,border:`1px solid ${cacheSource?"#10B98144":"#F59E0B44"}`,borderRadius:"12px",padding:"14px 18px",textAlign:"center",animation:"fadeInUp 0.4s ease"}}>
              <p style={{color:"#94a3b8",fontSize:"12px",marginBottom:"12px"}}>
                {cacheSource==="team"?"♻ Loaded from team cache — saved for everyone, $0.00 spent.":cacheSource==="local"?"💾 Loaded from your device cache — $0.00 spent.":"★ All 9 agents complete. Auto-saved to team & local cache."}
              </p>
              <div style={{display:"flex",gap:"10px",justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={()=>setSelected("reviewer")} style={{background:cacheSource?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#F59E0B,#D97706)",border:"none",borderRadius:"8px",color:cacheSource?"#fff":"#000",fontFamily:"'Space Mono',monospace",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",padding:"10px 20px",cursor:"pointer"}}>
                  ★  VIEW BOARD REPORT
                </button>
                <button onClick={()=>generateAgentFlowPDF(goal,outputs)} style={{background:"linear-gradient(135deg,#6366F1,#4F46E5)",border:"none",borderRadius:"8px",color:"#fff",fontFamily:"'Space Mono',monospace",fontSize:"11px",fontWeight:"700",letterSpacing:"1.5px",padding:"10px 20px",cursor:"pointer"}}>
                  ↓  DOWNLOAD PDF
                </button>
              </div>
            </div>
          )}

          {done&&selected&&(
            <div style={{display:"flex",justifyContent:"center",marginTop:"12px"}}>
              <button onClick={()=>generateAgentFlowPDF(goal,outputs)} style={{background:"linear-gradient(135deg,#6366F1,#4F46E5)",border:"none",borderRadius:"8px",color:"#fff",fontFamily:"'Space Mono',monospace",fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",padding:"9px 18px",cursor:"pointer"}}>
                ↓  DOWNLOAD FULL REPORT PDF
              </button>
            </div>
          )}

          <div style={{textAlign:"center",marginTop:"20px",fontFamily:"'Space Mono',monospace",fontSize:"9px",letterSpacing:"1.5px",color:"#1e293b"}}>
            AGENTFLOW 2.0 · 2-LAYER CACHE · TEAM SYNC · PWA
          </div>
        </div>
      </div>
    </>
  );
}
