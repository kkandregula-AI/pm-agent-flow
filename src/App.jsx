import { useState, useRef } from "react";

const AGENTS = [
  {
    id: "ceo", title: "CEO", label: "Chief Executive", icon: "◈", color: "#F59E0B", accent: "#FCD34D",
    systemPrompt: `You are the CEO Agent of an AI startup incubator. Given a business goal, you define:
1. Strategic Vision (2-3 sentences)
2. Core Value Proposition (1 sentence)
3. Target Customer (1 sentence)
4. Top 3 Strategic Priorities (numbered list)
5. Success Metrics (3 KPIs)
Be decisive, visionary, and concise. Use bold headers for each section.`,
  },
  {
    id: "pm", title: "PM", label: "Product Manager", icon: "⬡", color: "#6366F1", accent: "#A5B4FC",
    systemPrompt: `You are a Senior Product Manager. Based on the CEO strategy, create a concise PRD:
1. Problem Statement
2. User Personas (2 personas with pain points)
3. Core Features (MVP - 5 features with priority: P0/P1/P2)
4. 3-Month Roadmap (Month 1/2/3 milestones)
5. Success Metrics
Format with clear headers and bullet points.`,
  },
  {
    id: "ux", title: "UX", label: "UX Designer", icon: "◎", color: "#EC4899", accent: "#F9A8D4",
    systemPrompt: `You are a Senior UX Designer. Based on the product requirements, provide:
1. User Journey (5-step flow from discovery to core action)
2. Key Screens List (name + purpose for 5 screens)
3. UI Design Principles (3 principles for this product)
4. Navigation Architecture (describe main nav structure)
5. Accessibility Considerations (3 key points)
Be specific to the product. Use clear headers.`,
  },
  {
    id: "eng", title: "ENG", label: "Engineer", icon: "⬢", color: "#10B981", accent: "#6EE7B7",
    systemPrompt: `You are a Senior Software Architect. Based on the product specs, define:
1. Tech Stack Recommendation (frontend, backend, DB, AI/ML)
2. System Architecture (3-4 key components and their roles)
3. API Design (3-4 core endpoints with method and purpose)
4. Data Model (2-3 key entities and fields)
5. Scalability Considerations (3 points)
6. Estimated Dev Timeline (phases with weeks)
Be specific and technical.`,
  },
  {
    id: "research", title: "RESEARCH", label: "Market Research", icon: "◉", color: "#0EA5E9", accent: "#7DD3FC",
    systemPrompt: `You are a Market Research Analyst. For this product idea, provide:
1. Market Size (TAM/SAM/SOM estimates with reasoning)
2. Top 3 Competitors (name, strengths, weaknesses)
3. Market Gaps & Opportunities (3 key differentiators to pursue)
4. Customer Acquisition Channels (top 3 with rationale)
5. Industry Trends (3 trends supporting this product)
Be data-driven. Use realistic numbers with reasoning.`,
  },
  {
    id: "marketing", title: "MKTG", label: "Marketing", icon: "◆", color: "#F97316", accent: "#FED7AA",
    systemPrompt: `You are a Growth Marketing Director. Create marketing assets:
1. Tagline (one punchy line under 10 words)
2. LinkedIn Launch Post (150 words, hook + value + CTA)
3. Landing Page Hero Copy (headline + subheadline + 3 benefit bullets + CTA button text)
4. GTM Strategy (3 phases: Pre-launch / Launch / Growth)
5. Key Marketing Channels (top 3 with tactics)
Make it compelling, specific, and conversion-focused.`,
  },
  {
    id: "finance", title: "FIN", label: "Finance", icon: "◇", color: "#8B5CF6", accent: "#C4B5FD",
    systemPrompt: `You are a Startup CFO. Build a financial model outline:
1. Pricing Strategy (tiers with price points and what's included)
2. Revenue Projections (Month 3, Month 6, Year 1 estimates with assumptions)
3. Cost Structure (key cost categories and estimates)
4. Unit Economics (CAC, LTV, LTV:CAC ratio targets)
5. Funding Requirement (amount, use of funds, runway)
6. Break-even Analysis (when and at what revenue)
Be specific with numbers. State key assumptions clearly.`,
  },
  {
    id: "qa", title: "QA", label: "QA & Risk", icon: "⊗", color: "#EF4444", accent: "#FCA5A5",
    systemPrompt: `You are a QA Lead and Risk Analyst. Review the entire plan and identify:
1. Critical Risks (top 5 risks with likelihood: High/Med/Low and mitigation)
2. Product Gaps (3 missing features or considerations)
3. Technical Debt Risks (2-3 architectural concerns)
4. Compliance/Legal Risks (relevant regulations, e.g. HIPAA, GDPR)
5. Launch Readiness Checklist (10-item go/no-go checklist)
Be critical and thorough.`,
  },
  {
    id: "reviewer", title: "BOARD", label: "Board Reviewer", icon: "★", color: "#F59E0B", accent: "#FEF3C7",
    systemPrompt: `You are a Board-Level Reviewer synthesizing all agent outputs into a final executive summary:
1. Executive Summary (3 sentences: what, why, how)
2. Venture Viability Score (/10) with reasoning
3. Top 3 Strengths of this plan
4. Top 3 Concerns to address before launch
5. Recommended Next Actions (5 concrete steps in priority order)
6. Final Verdict: GO / NO-GO / PIVOT with one-paragraph justification
Write as a wise, experienced board member. Be direct and actionable.`,
  },
];

const STATUS = { IDLE: "idle", RUNNING: "running", DONE: "done", ERROR: "error" };

const EXAMPLES = [
  "Create an AI product for doctors to summarize medical reports",
  "Build a SaaS platform for small restaurants to manage inventory with AI",
  "Develop an AI tutoring app for high school students in rural India",
  "Launch a B2B tool that auto-generates legal contracts using AI",
];

// ─── API call goes to our secure Vercel proxy ─────────────────────────────────
async function callAgent(agent, contextPrompt) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: contextPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "API error");
  }
  const data = await res.json();
  return data.content?.[0]?.text || "No output generated.";
}

// ─── Agent Card ───────────────────────────────────────────────────────────────
function AgentCard({ agent, status, output, isSelected, onClick }) {
  const active = status !== STATUS.IDLE;
  return (
    <div
      onClick={() => output && onClick(agent.id)}
      style={{
        position: "relative",
        background: isSelected
          ? `linear-gradient(135deg,${agent.color}22,#0a0f1e)`
          : active ? `linear-gradient(135deg,${agent.color}0d,#0a0f1e)` : "#0a0f1e",
        border: `1px solid ${isSelected ? agent.color : active ? `${agent.color}55` : "#1e293b"}`,
        borderRadius: "12px",
        padding: "14px",
        cursor: output ? "pointer" : "default",
        transition: "all 0.3s",
        boxShadow: isSelected ? `0 0 20px ${agent.color}44` : "none",
        overflow: "hidden",
      }}
    >
      {status === STATUS.RUNNING && (
        <div style={{ position: "absolute", inset: 0, borderRadius: "12px", border: `1px solid ${agent.color}`, animation: "ping 1.5s ease-in-out infinite", pointerEvents: "none" }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: status === STATUS.DONE ? "8px" : 0 }}>
        <div style={{
          width: "34px", height: "34px", borderRadius: "8px", flexShrink: 0,
          background: active ? `${agent.color}22` : "#1e293b",
          border: `1px solid ${active ? agent.color : "#334155"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px", color: active ? agent.color : "#475569", transition: "all 0.3s",
        }}>
          {status === STATUS.RUNNING
            ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            : agent.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "10px", fontWeight: "700", letterSpacing: "2px", color: active ? agent.color : "#475569" }}>
            {agent.title}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>{agent.label}</div>
        </div>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
          background: status === STATUS.DONE ? agent.color : status === STATUS.RUNNING ? agent.color : "#1e293b",
          border: status === STATUS.IDLE ? "1px solid #334155" : "none",
          boxShadow: status === STATUS.DONE ? `0 0 6px ${agent.color}` : "none",
          animation: status === STATUS.RUNNING ? "blink 0.8s ease-in-out infinite" : "none",
        }} />
      </div>
      {status === STATUS.DONE && output && (
        <div style={{ fontSize: "11px", color: "#64748b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {output.substring(0, 90)}…
        </div>
      )}
      {status === STATUS.RUNNING && (
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "6px" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", background: agent.color, animation: `bounce-dot 1.2s ${i*0.2}s ease-in-out infinite` }} />
          ))}
          <span style={{ fontSize: "10px", color: "#64748b", marginLeft: "4px" }}>Analyzing…</span>
        </div>
      )}
    </div>
  );
}

// ─── Output Panel ─────────────────────────────────────────────────────────────
function OutputPanel({ agent, content, onClose }) {
  if (!agent || !content) return null;
  return (
    <div style={{ background: "#0a0f1e", border: `1px solid ${agent.color}44`, borderRadius: "16px", overflow: "hidden", boxShadow: `0 0 40px ${agent.color}22` }}>
      <div style={{ background: `linear-gradient(90deg,${agent.color}22,transparent)`, borderBottom: `1px solid ${agent.color}33`, padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "18px", color: agent.color }}>{agent.icon}</span>
        <div>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "11px", letterSpacing: "2px", color: agent.color, fontWeight: "700" }}>{agent.title} OUTPUT</div>
          <div style={{ fontSize: "10px", color: "#64748b" }}>{agent.label}</div>
        </div>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "1px solid #334155", borderRadius: "6px", color: "#64748b", cursor: "pointer", padding: "3px 10px", fontSize: "12px" }}>✕</button>
      </div>
      <div style={{ padding: "18px", maxHeight: "45vh", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${agent.color}44 transparent` }}>
        {content.split("\n").map((line, i) => {
          const isH = line.startsWith("#");
          const isBullet = line.startsWith("- ") || line.startsWith("• ");
          return (
            <div key={i} style={{
              marginBottom: isH ? "10px" : "3px", marginTop: isH ? "14px" : 0,
              fontFamily: isH ? "'Space Mono',monospace" : "'IBM Plex Mono',monospace",
              fontSize: isH ? "11px" : "13px", lineHeight: "1.7",
              color: isH ? agent.accent : isBullet ? "#cbd5e1" : "#94a3b8",
              letterSpacing: isH ? "1.5px" : 0,
              borderLeft: isH ? `2px solid ${agent.color}` : "none",
              paddingLeft: isH ? "8px" : isBullet ? "4px" : 0,
            }}>
              {line.replace(/\*\*/g, "").replace(/^#+\s/, "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
  const [outputs, setOutputs] = useState({});
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(false);

  const setStatus = (id, s) => setStatuses(p => ({ ...p, [id]: s }));
  const completedCount = Object.values(statuses).filter(s => s === STATUS.DONE).length;
  const progress = (completedCount / AGENTS.length) * 100;

  const run = async () => {
    if (!goal.trim()) return;
    abortRef.current = false;
    setRunning(true); setDone(false); setError(""); setOutputs({}); setSelected(null);
    setStatuses(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
    const collected = {};

    for (let i = 0; i < AGENTS.length; i++) {
      if (abortRef.current) break;
      const agent = AGENTS[i];
      setStatus(agent.id, STATUS.RUNNING);
      setPhase(agent.label);

      let prompt = `Business Goal: "${goal}"\n\n`;
      if (i === 0) {
        prompt += "Provide strategic direction for this business goal.";
      } else if (agent.id === "reviewer") {
        prompt += "Here are all team outputs:\n\n";
        AGENTS.slice(0, -1).forEach(a => { if (collected[a.id]) prompt += `--- ${a.label.toUpperCase()} ---\n${collected[a.id]}\n\n`; });
        prompt += "Synthesize all of the above into a final board-level review.";
      } else {
        prompt += `CEO Strategy:\n${collected["ceo"] || ""}\n\n`;
        if (collected["pm"] && ["ux","eng","qa"].includes(agent.id)) prompt += `Product Requirements:\n${collected["pm"]}\n\n`;
        prompt += "Now fulfill your role for this business goal.";
      }

      try {
        const output = await callAgent(agent, prompt);
        collected[agent.id] = output;
        setOutputs(p => ({ ...p, [agent.id]: output }));
        setStatus(agent.id, STATUS.DONE);
        if (i === 0) setSelected(agent.id);
      } catch (e) {
        setStatus(agent.id, STATUS.ERROR);
        setError(e.message);
        collected[agent.id] = "Error: " + e.message;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    setPhase(""); setRunning(false); setDone(true); setSelected("reviewer");
  };

  const reset = () => {
    abortRef.current = true;
    setRunning(false); setDone(false); setError(""); setOutputs({}); setSelected(null); setPhase("");
    setStatuses(Object.fromEntries(AGENTS.map(a => [a.id, STATUS.IDLE])));
  };

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
        .goal-input:focus{outline:none;border-color:#F59E0B!important;box-shadow:0 0 0 3px #F59E0B22!important}
        .run-btn:active{transform:scale(0.97)}
        .agent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        @media(max-width:480px){.agent-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div style={{ minHeight:"100vh", background:"#060b14", color:"#e2e8f0", fontFamily:"'Syne',sans-serif", padding:"env(safe-area-inset-top,20px) 14px 32px", position:"relative" }}>
        {/* BG grid */}
        <div style={{ position:"fixed", inset:0, backgroundImage:"linear-gradient(#1e293b0d 1px,transparent 1px),linear-gradient(90deg,#1e293b0d 1px,transparent 1px)", backgroundSize:"36px 36px", pointerEvents:"none" }} />

        <div style={{ maxWidth:"860px", margin:"0 auto", position:"relative" }}>

          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:"24px", animation:"fadeInUp 0.5s ease" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:"#F59E0B11", border:"1px solid #F59E0B33", borderRadius:"100px", padding:"3px 12px", marginBottom:"12px" }}>
              <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#F59E0B", animation:"blink 1.5s ease-in-out infinite" }} />
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", color:"#F59E0B" }}>MULTI-AGENT SYSTEM v2.0</span>
            </div>
            <h1 style={{ fontSize:"clamp(26px,7vw,44px)", fontWeight:"800", letterSpacing:"-1px", background:"linear-gradient(135deg,#F59E0B,#FCD34D 40%,#fff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:"6px" }}>
              AgentFlow 2.0
            </h1>
            <p style={{ color:"#64748b", fontSize:"13px" }}>One goal → 9 AI agents → Full company execution</p>
          </div>

          {/* Input card */}
          <div style={{ background:"#0a0f1e", border:"1px solid #1e293b", borderRadius:"16px", padding:"18px", marginBottom:"16px" }}>
            <label style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"2px", color:"#F59E0B", display:"block", marginBottom:"8px" }}>MISSION BRIEF</label>
            <textarea
              className="goal-input"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="Describe your business goal or product idea..."
              disabled={running}
              style={{ width:"100%", background:"#060b14", border:"1px solid #1e293b", borderRadius:"10px", color:"#e2e8f0", fontFamily:"'IBM Plex Mono',monospace", fontSize:"13px", padding:"12px", resize:"none", height:"74px", transition:"all 0.2s", lineHeight:"1.6" }}
            />

            {/* Examples */}
            {!running && !done && (
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
              <button
                className="run-btn"
                onClick={run}
                disabled={running || !goal.trim()}
                style={{
                  flex:1, background: running || !goal.trim() ? "#1e293b" : "linear-gradient(135deg,#F59E0B,#D97706)",
                  border:"none", borderRadius:"10px", color: running || !goal.trim() ? "#475569" : "#000",
                  fontFamily:"'Space Mono',monospace", fontSize:"11px", fontWeight:"700", letterSpacing:"1.5px",
                  padding:"13px", cursor: running || !goal.trim() ? "not-allowed" : "pointer", transition:"all 0.2s",
                }}
              >
                {running ? `⟳  ${phase.toUpperCase()} WORKING...` : "▶  LAUNCH COMPANY"}
              </button>
              {(running || done) && (
                <button onClick={reset} style={{ background:"transparent", border:"1px solid #334155", borderRadius:"10px", color:"#64748b", fontFamily:"'Space Mono',monospace", fontSize:"11px", padding:"13px 16px", cursor:"pointer", letterSpacing:"1px" }}>
                  RESET
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {(running || done) && (
            <div style={{ background:"#0a0f1e", border:"1px solid #1e293b", borderRadius:"10px", padding:"10px 14px", marginBottom:"14px", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px", color: done ? "#10B981" : "#F59E0B", minWidth:"72px" }}>
                {done ? "✓ COMPLETE" : "RUNNING"}
              </span>
              <div style={{ flex:1, height:"3px", background:"#1e293b", borderRadius:"4px", overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${progress}%`, background: done ? "linear-gradient(90deg,#10B981,#34D399)" : "linear-gradient(90deg,#F59E0B,#FCD34D)", borderRadius:"4px", transition:"width 0.5s ease", boxShadow:`0 0 8px ${done?"#10B98188":"#F59E0B88"}` }} />
              </div>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:"9px", color:"#475569", minWidth:"40px", textAlign:"right" }}>{completedCount}/{AGENTS.length}</span>
            </div>
          )}

          {/* Agent Grid */}
          <div className="agent-grid" style={{ marginBottom:"16px" }}>
            {AGENTS.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                status={statuses[agent.id]}
                output={outputs[agent.id]}
                isSelected={selected === agent.id}
                onClick={setSelected}
              />
            ))}
          </div>

          {/* Output panel */}
          {selected && outputs[selected] && (
            <div style={{ animation:"fadeInUp 0.4s ease" }}>
              <OutputPanel
                agent={AGENTS.find(a => a.id === selected)}
                content={outputs[selected]}
                onClose={() => setSelected(null)}
              />
            </div>
          )}

          {/* Board report CTA */}
          {done && !selected && (
            <div style={{ background:"linear-gradient(135deg,#F59E0B11,#0a0f1e)", border:"1px solid #F59E0B44", borderRadius:"12px", padding:"14px 18px", textAlign:"center", animation:"fadeInUp 0.4s ease" }}>
              <p style={{ color:"#94a3b8", fontSize:"12px", marginBottom:"10px" }}>★ All 9 agents complete. Tap any card to view output.</p>
              <button onClick={() => setSelected("reviewer")} style={{ background:"linear-gradient(135deg,#F59E0B,#D97706)", border:"none", borderRadius:"8px", color:"#000", fontFamily:"'Space Mono',monospace", fontSize:"11px", fontWeight:"700", letterSpacing:"1.5px", padding:"10px 20px", cursor:"pointer" }}>
                ★  VIEW BOARD REPORT
              </button>
            </div>
          )}

          <div style={{ textAlign:"center", marginTop:"20px", fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:"1.5px", color:"#1e293b" }}>
            AGENTFLOW 2.0 · PWA · VERCEL · CLAUDE API
          </div>
        </div>
      </div>
    </>
  );
}
