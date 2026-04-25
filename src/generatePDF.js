// generatePDF.js — AgentFlow elegant PDF export using jsPDF

import { jsPDF } from "jspdf";

const AGENTS = [
  { id: "ceo",      title: "CEO",      label: "Chief Executive",  icon: "◈", r: 245, g: 158, b: 11  },
  { id: "pm",       title: "PM",       label: "Product Manager",  icon: "⬡", r: 99,  g: 102, b: 241 },
  { id: "ux",       title: "UX",       label: "UX Designer",      icon: "◎", r: 236, g: 72,  b: 153 },
  { id: "eng",      title: "ENG",      label: "Engineer",         icon: "⬢", r: 16,  g: 185, b: 129 },
  { id: "research", title: "RESEARCH", label: "Market Research",  icon: "◉", r: 14,  g: 165, b: 233 },
  { id: "marketing",title: "MKTG",     label: "Marketing",        icon: "◆", r: 249, g: 115, b: 22  },
  { id: "finance",  title: "FIN",      label: "Finance",          icon: "◇", r: 139, g: 92,  b: 246 },
  { id: "qa",       title: "QA",       label: "QA & Risk",        icon: "⊗", r: 239, g: 68,  b: 68  },
  { id: "reviewer", title: "BOARD",    label: "Board Reviewer",   icon: "★", r: 245, g: 158, b: 11  },
];

// Wrap text into lines within a max width
function splitLines(doc, text, maxWidth) {
  const words = text.replace(/\r/g, "").split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (doc.getTextWidth(test) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Draw a subtle dot-grid background
function drawBackground(doc, W, H) {
  doc.setFillColor(8, 12, 22);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(30, 41, 59);
  const step = 14;
  for (let x = step; x < W; x += step) {
    for (let y = step; y < H; y += step) {
      doc.circle(x, y, 0.3, "F");
    }
  }
}

// Draw thin accent line
function accentLine(doc, x, y, w, r, g, b, alpha = 0.6) {
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.line(x, y, x + w, y);
}

// ── COVER PAGE ─────────────────────────────────────────────────────────────────
function drawCover(doc, goal, W, H) {
  drawBackground(doc, W, H);

  // Top amber bar
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, W, 2, "F");

  // Large decorative circle
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.3);
  doc.setFillColor(245, 158, 11, 0.04);
  doc.circle(W - 40, H * 0.35, 80, "FD");
  doc.circle(30, H * 0.72, 50, "FD");

  // AGENTFLOW label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(245, 158, 11);
  doc.setCharSpace(4);
  doc.text("AGENTFLOW  2.0", 20, 30);
  doc.setCharSpace(0);

  // MULTI-AGENT COMPANY REPORT
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.setCharSpace(2);
  doc.text("MULTI-AGENT COMPANY REPORT", 20, 38);
  doc.setCharSpace(0);

  // Divider
  accentLine(doc, 20, 44, W - 40, 245, 158, 11);

  // Main title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(255, 255, 255);
  doc.text("Company", 20, 80);
  doc.setTextColor(245, 158, 11);
  doc.text("Intelligence", 20, 100);
  doc.setTextColor(255, 255, 255);
  doc.text("Report", 20, 120);

  // Goal box
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(20, 134, W - 40, 30, 3, 3, "F");
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.5);
  doc.line(20, 134, 20, 164); // left accent bar

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setCharSpace(1.5);
  doc.text("MISSION BRIEF", 27, 142);
  doc.setCharSpace(0);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  const goalLines = splitLines(doc, goal, W - 60);
  goalLines.slice(0, 3).forEach((line, i) => doc.text(line, 27, 152 + i * 6));

  // 9-agent grid preview
  const agents9 = AGENTS;
  const cols = 3, rows = 3;
  const boxW = (W - 40 - (cols - 1) * 4) / cols;
  const boxH = 18;
  const startX = 20, startY = 180;

  doc.setFont("helvetica", "normal");
  agents9.forEach((ag, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (boxW + 4);
    const y = startY + row * (boxH + 4);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    doc.setDrawColor(ag.r, ag.g, ag.b);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "D");
    doc.setFillColor(ag.r, ag.g, ag.b);
    doc.circle(x + 6, y + boxH / 2, 2, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ag.r, ag.g, ag.b);
    doc.text(ag.title, x + 11, y + boxH / 2 - 1.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(ag.label, x + 11, y + boxH / 2 + 4);
  });

  // Bottom strip
  doc.setFillColor(15, 23, 42);
  doc.rect(0, H - 20, W, 20, "F");
  accentLine(doc, 0, H - 20, W, 245, 158, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.setCharSpace(1);
  doc.text("GENERATED BY AGENTFLOW 2.0  ·  9 AI AGENTS  ·  TOKEN-OPTIMISED", 20, H - 10);
  doc.text(new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }), W - 35, H - 10);
  doc.setCharSpace(0);
}

// ── AGENT CONTENT PAGE ─────────────────────────────────────────────────────────
function drawAgentPage(doc, agent, content, pageNum, totalPages, W, H) {
  drawBackground(doc, W, H);

  const { r, g, b } = agent;

  // Top colored bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 3, "F");

  // Header bg
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 3, W, 36, "F");

  // Agent color left strip
  doc.setFillColor(r, g, b);
  doc.rect(0, 3, 4, 36, "F");

  // Agent icon circle
  doc.setFillColor(r, g, b);
  doc.circle(24, 21, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(8, 12, 22);
  doc.text(agent.icon || "◆", 24, 24, { align: "center" });

  // Title + label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(r, g, b);
  doc.text(agent.title + " AGENT", 40, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(agent.label, 40, 24);

  // Page tag top right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.setCharSpace(1);
  doc.text(`PAGE ${pageNum} / ${totalPages}`, W - 20, 16, { align: "right" });
  doc.setCharSpace(0);

  // Divider
  accentLine(doc, 10, 42, W - 20, r, g, b);

  // Content area
  let y = 54;
  const margin = 16;
  const contentW = W - margin * 2;
  const lines = content.split("\n").filter(l => l !== undefined);

  doc.setFont("helvetica", "normal");

  for (const rawLine of lines) {
    if (y > H - 24) {
      // Footer before overflow
      drawPageFooter(doc, agent, W, H);
      doc.addPage();
      drawBackground(doc, W, H);
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, W, 1.5, "F");
      // Continuation header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 1.5, W, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(r, g, b);
      doc.setCharSpace(2);
      doc.text(agent.title + " — CONTINUED", margin, 11);
      doc.setCharSpace(0);
      accentLine(doc, margin, 17, W - margin * 2, r, g, b);
      y = 26;
    }

    const line = rawLine.replace(/\*\*/g, "").trim();
    if (!line) { y += 3; continue; }

    // Section header detection
    const isH1 = rawLine.match(/^#{1,2}\s/) || (rawLine.match(/^\d+\./) && rawLine.length < 60);
    const isH2 = rawLine.match(/^#{3}\s/);
    const isBullet = rawLine.startsWith("- ") || rawLine.startsWith("• ");
    const isNumbered = rawLine.match(/^\d+\.\s/);
    const isCheckItem = rawLine.includes("✓") || rawLine.includes("✗") || rawLine.includes("☐");

    const cleanLine = line.replace(/^#+\s/, "").replace(/^[-•]\s/, "");

    if (isH1 || isNumbered) {
      y += 4;
      // Highlight bar
      doc.setFillColor(r, g, b);
      doc.setGState && doc.setGState(doc.GState({ opacity: 0.12 }));
      doc.roundedRect(margin - 2, y - 5, contentW + 4, 8, 1, 1, "F");
      doc.setFillColor(r, g, b);

      // Left tick
      doc.rect(margin - 2, y - 5, 2, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(r, g, b);
      const hLines = splitLines(doc, cleanLine, contentW - 6);
      hLines.forEach((hl, hi) => { doc.text(hl, margin + 4, y + hi * 5.5); });
      y += hLines.length * 5.5 + 4;

    } else if (isH2) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      const hLines = splitLines(doc, cleanLine, contentW);
      hLines.forEach((hl, hi) => doc.text(hl, margin, y + hi * 5));
      y += hLines.length * 5 + 3;

    } else if (isBullet) {
      // Bullet dot
      doc.setFillColor(r, g, b);
      doc.circle(margin + 2, y - 1.5, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      const bLines = splitLines(doc, cleanLine, contentW - 8);
      bLines.forEach((bl, bi) => doc.text(bl, margin + 6, y + bi * 5));
      y += bLines.length * 5 + 2;

    } else if (isCheckItem) {
      const isCheck = line.includes("✓");
      doc.setFillColor(isCheck ? 16 : 239, isCheck ? 185 : 68, isCheck ? 129 : 68);
      doc.roundedRect(margin, y - 4, 4, 4, 0.5, 0.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.text(isCheck ? "✓" : "✗", margin + 0.7, y - 0.7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      const cLines = splitLines(doc, cleanLine.replace(/[✓✗☐]/g, "").trim(), contentW - 10);
      cLines.forEach((cl, ci) => doc.text(cl, margin + 7, y + ci * 5));
      y += cLines.length * 5 + 2;

    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      const tLines = splitLines(doc, cleanLine, contentW);
      tLines.forEach((tl, ti) => doc.text(tl, margin, y + ti * 5));
      y += tLines.length * 5 + 1.5;
    }
  }

  drawPageFooter(doc, agent, W, H);
}

function drawPageFooter(doc, agent, W, H) {
  const { r, g, b } = agent;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, H - 14, W, 14, "F");
  accentLine(doc, 0, H - 14, W, r, g, b);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105);
  doc.setCharSpace(1);
  doc.text("AGENTFLOW 2.0  ·  CONFIDENTIAL", 16, H - 5);
  doc.text(agent.label.toUpperCase(), W - 16, H - 5, { align: "right" });
  doc.setCharSpace(0);
}

// ── MAIN EXPORT FUNCTION ───────────────────────────────────────────────────────
export function generateAgentFlowPDF(goal, outputs) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const filledAgents = AGENTS.filter(a => outputs[a.id]);
  const totalPages   = 1 + filledAgents.length; // cover + agent pages

  // Cover
  drawCover(doc, goal, W, H);

  // One page per agent
  filledAgents.forEach((agent, i) => {
    doc.addPage();
    drawAgentPage(doc, agent, outputs[agent.id], i + 2, totalPages, W, H);
  });

  // Filename: agentflow-<slug>-<date>.pdf
  const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`agentflow-${slug}-${date}.pdf`);
}
