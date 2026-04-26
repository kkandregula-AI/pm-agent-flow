import { jsPDF } from "jspdf";

const AGENTS = [
  { id:"ceo",      title:"CEO",      label:"Chief Executive",  color:[245,158,11],  accent:[252,211,77]  },
  { id:"pm",       title:"PM",       label:"Product Manager",  color:[99,102,241],  accent:[165,180,252] },
  { id:"ux",       title:"UX",       label:"UX Designer",      color:[236,72,153],  accent:[249,168,212] },
  { id:"eng",      title:"ENG",      label:"Engineer",         color:[16,185,129],  accent:[110,231,183] },
  { id:"research", title:"RESEARCH", label:"Market Research",  color:[14,165,233],  accent:[125,211,252] },
  { id:"marketing",title:"MKTG",     label:"Marketing",        color:[249,115,22],  accent:[254,215,170] },
  { id:"finance",  title:"FIN",      label:"Finance",          color:[139,92,246],  accent:[196,181,253] },
  { id:"qa",       title:"QA",       label:"QA & Risk",        color:[239,68,68],   accent:[252,165,165] },
  { id:"reviewer", title:"BOARD",    label:"Board Reviewer",   color:[245,158,11],  accent:[254,243,199] },
];

// Wrap text to fit within maxWidth
function wrapText(doc, text, maxWidth) {
  const words = String(text || "").replace(/\r/g,"").split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (doc.getTextWidth(test) > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Clean text — remove markdown symbols and fix encoding issues
function clean(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[^\x00-\x7E]/g, (c) => {
      const map = { "\u2713":"[OK]", "\u2717":"[X]", "\u2718":"[X]", "\u2714":"[OK]",
                    "\u2019":"'", "\u2018":"'", "\u201C":'"', "\u201D":'"',
                    "\u2014":"-", "\u2013":"-", "\u2022":"*", "\u25CF":"*",
                    "\u25B6":">", "\u2764":"<3", "\u26A0":"!", "\u2B50":"*",
                    "\u2705":"[OK]", "\u274C":"[X]", "\u2611":"[OK]", "\u2610":"[ ]",
                    "\u00B7":"*", "\u2192":"->", "\u00A0":" " };
      return map[c] || "";
    })
    .trim();
}

function setColor(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
function setFill(doc, rgb)  { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setDraw(doc, rgb)  { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }

// ── COVER PAGE ──────────────────────────────────────────────────────────────
function drawCover(doc, goal, W, H) {
  // Background
  doc.setFillColor(8, 12, 22);
  doc.rect(0, 0, W, H, "F");

  // Dot grid
  doc.setFillColor(25, 35, 55);
  for (let x = 14; x < W; x += 14) {
    for (let y = 14; y < H; y += 14) {
      doc.circle(x, y, 0.25, "F");
    }
  }

  // Top amber bar
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, W, 2.5, "F");

  // Decorative circle top-right
  doc.setDrawColor(245, 158, 11);
  doc.setFillColor(245, 158, 11, 0.05);
  doc.setLineWidth(0.3);
  doc.circle(W - 35, 55, 65, "D");
  doc.circle(25, H - 50, 40, "D");

  // Header label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(245, 158, 11);
  doc.text("AGENTFLOW  2.0", 18, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text("MULTI-AGENT COMPANY REPORT", 18, 25);

  // Amber divider
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.4);
  doc.line(18, 30, W - 18, 30);

  // Main title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(255, 255, 255);
  doc.text("Company", 18, 68);
  doc.setTextColor(245, 158, 11);
  doc.text("Intelligence", 18, 86);
  doc.setTextColor(255, 255, 255);
  doc.text("Report", 18, 104);

  // Goal box
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(18, 114, W - 36, 32, 3, 3, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(18, 114, 2.5, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(245, 158, 11);
  doc.text("MISSION BRIEF", 25, 123);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(220, 230, 242);
  const goalLines = wrapText(doc, clean(goal), W - 52);
  goalLines.slice(0, 3).forEach((line, i) => doc.text(line, 25, 132 + i * 6));

  // Agent grid 3x3
  const cols = 3, boxW = (W - 36 - (cols-1)*4) / cols, boxH = 17;
  const gx = 18, gy = 162;

  doc.setFont("helvetica", "normal");
  AGENTS.forEach((ag, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = gx + c*(boxW+4), y = gy + r*(boxH+4);
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    setDraw(doc, ag.color);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "D");
    setFill(doc, ag.color);
    doc.circle(x + 5.5, y + boxH/2, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setColor(doc, ag.color);
    doc.text(ag.title, x + 10, y + boxH/2 - 1.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(120, 135, 155);
    doc.text(ag.label, x + 10, y + boxH/2 + 4);
  });

  // Footer
  doc.setFillColor(12, 18, 32);
  doc.rect(0, H - 16, W, 16, "F");
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.3);
  doc.line(0, H - 16, W, H - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(70, 85, 105);
  doc.text("GENERATED BY AGENTFLOW 2.0  |  9 AI AGENTS  |  TOKEN-OPTIMISED",
    W/2, H - 7, { align:"center" });
  doc.text(new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),
    W - 18, H - 7, { align:"right" });
}

// ── PAGE FOOTER ─────────────────────────────────────────────────────────────
function drawFooter(doc, agent, W, H) {
  doc.setFillColor(12, 18, 32);
  doc.rect(0, H-12, W, 12, "F");
  setDraw(doc, agent.color);
  doc.setLineWidth(0.3);
  doc.line(0, H-12, W, H-12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(70, 85, 105);
  doc.text("AGENTFLOW 2.0  |  CONFIDENTIAL", 16, H-4);
  doc.text(agent.label.toUpperCase(), W-16, H-4, { align:"right" });
}

// ── CONTINUATION HEADER ──────────────────────────────────────────────────────
function drawContHeader(doc, agent, W) {
  doc.setFillColor(8, 12, 22);
  doc.rect(0, 0, W, 22, "F");
  setFill(doc, agent.color);
  doc.rect(0, 0, W, 1.5, "F");
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 1.5, W, 20, "F");
  setFill(doc, agent.color);
  doc.rect(0, 1.5, 3, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  setColor(doc, agent.color);
  doc.text(agent.title + " -- CONTINUED", 10, 14);
  setDraw(doc, agent.color);
  doc.setLineWidth(0.3);
  doc.line(10, 19, W-10, 19);
}

// ── AGENT CONTENT PAGE ───────────────────────────────────────────────────────
function drawAgentPage(doc, agent, content, pageNum, totalPages, W, H) {
  const [r,g,b] = agent.color;
  const margin = 16, contentW = W - margin*2;

  // Background
  doc.setFillColor(8, 12, 22);
  doc.rect(0, 0, W, H, "F");
  // Subtle dot grid
  doc.setFillColor(22, 32, 48);
  for (let x = 14; x < W; x += 14)
    for (let y = 14; y < H; y += 14)
      doc.circle(x, y, 0.22, "F");

  // Top color bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 3, "F");

  // Header bg
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 3, W, 34, "F");
  doc.setFillColor(r, g, b);
  doc.rect(0, 3, 4, 34, "F");

  // Agent icon badge (text-based, no glyph)
  doc.setFillColor(r, g, b);
  doc.roundedRect(12, 8, 18, 18, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(8, 12, 22);
  const shortTitle = agent.title.length > 4 ? agent.title.slice(0,4) : agent.title;
  doc.text(shortTitle, 21, 19, { align:"center" });

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(r, g, b);
  doc.text(agent.title + " AGENT", 36, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 195, 215);
  doc.text(agent.label, 36, 25);

  // Page number
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(80, 95, 115);
  doc.text(`PAGE ${pageNum} / ${totalPages}`, W-16, 14, { align:"right" });

  // Divider
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(10, 40, W-10, 40);

  // ── Render content ─────────────────────────────────────────────────────────
  let y = 52;

  const newPage = () => {
    drawFooter(doc, agent, W, H);
    doc.addPage();
    doc.setFillColor(8, 12, 22);
    doc.rect(0, 0, W, H, "F");
    doc.setFillColor(22, 32, 48);
    for (let x = 14; x < W; x += 14)
      for (let yy = 14; yy < H; yy += 14)
        doc.circle(x, yy, 0.22, "F");
    drawContHeader(doc, agent, W);
    y = 30;
  };

  const checkY = (needed = 8) => { if (y + needed > H - 16) newPage(); };

  const rawLines = content.split("\n");

  for (let li = 0; li < rawLines.length; li++) {
    const raw = rawLines[li];
    const line = clean(raw);
    if (!line) { y += 3; continue; }

    const isH1 = /^#{1,2}\s/.test(raw) || (/^\d+\.\s/.test(raw) && line.length < 80);
    const isH2 = /^#{3}\s/.test(raw);
    const isBullet = /^[-*•]\s/.test(raw) || raw.startsWith("  -") || raw.startsWith("  *");
    const isNumbered = /^\d+\.\s/.test(raw);
    const isCheck = line.includes("[OK]") || line.includes("[X]") || line.includes("[ ]");

    if (isH1) {
      checkY(14);
      y += 4;
      // Highlight bar
      doc.setFillColor(r, g, b);
      doc.setGState(doc.GState({ opacity:0.12 }));
      doc.roundedRect(margin-2, y-5.5, contentW+4, 9, 1.5, 1.5, "F");
      doc.setGState(doc.GState({ opacity:1 }));
      // Left accent
      doc.setFillColor(r, g, b);
      doc.rect(margin-2, y-5.5, 2.5, 9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(r, g, b);
      const hLines = wrapText(doc, line, contentW-8);
      hLines.forEach((hl, hi) => { checkY(6); doc.text(hl, margin+4, y+hi*5.5); y += (hi>0?5.5:0); });
      y += 7;

    } else if (isH2) {
      checkY(10);
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(200, 215, 230);
      const h2Lines = wrapText(doc, line, contentW);
      h2Lines.forEach((hl, hi) => { checkY(5); doc.text(hl, margin, y+hi*5); y += (hi>0?5:0); });
      y += 6;

    } else if (isCheck) {
      const isOK = line.includes("[OK]");
      const isNo = line.includes("[X]");
      checkY(8);
      // Badge
      doc.setFillColor(isOK ? 16:239, isOK ? 185:68, isOK ? 129:68);
      doc.roundedRect(margin, y-4, 5, 5, 0.8, 0.8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.text(isOK?"OK":"X", margin+2.5, y-0.8, { align:"center" });
      // Text
      const cText = line.replace(/\[OK\]|\[X\]|\[\s\]/g,"").trim();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(195, 210, 228);
      const cLines = wrapText(doc, cText, contentW-10);
      cLines.forEach((cl,ci) => { checkY(5); doc.text(cl, margin+8, y+ci*5); y += (ci>0?5:0); });
      y += 7;

    } else if (isBullet) {
      checkY(8);
      const bText = line.replace(/^[-*•]\s*/,"").replace(/^\s+[-*]\s*/,"");
      doc.setFillColor(r, g, b);
      doc.circle(margin+2, y-1.5, 1.3, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(195, 210, 228);
      const bLines = wrapText(doc, bText, contentW-9);
      bLines.forEach((bl, bi) => { checkY(5); doc.text(bl, margin+6, y+bi*5); y += (bi>0?5:0); });
      y += 6;

    } else {
      checkY(8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      // Make regular body text clearly visible — light blue-white
      doc.setTextColor(195, 210, 228);
      const tLines = wrapText(doc, line, contentW);
      tLines.forEach((tl, ti) => { checkY(5); doc.text(tl, margin, y+ti*5); y += (ti>0?5:0); });
      y += 5.5;
    }
  }

  drawFooter(doc, agent, W, H);
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
export function generateAgentFlowPDF(goal, outputs) {
  const doc = new jsPDF({ unit:"mm", format:"a4", orientation:"portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const filled = AGENTS.filter(a => outputs[a.id]);
  const total  = 1 + filled.length;

  drawCover(doc, goal, W, H);

  filled.forEach((agent, i) => {
    doc.addPage();
    drawAgentPage(doc, agent, outputs[agent.id], i+2, total, W, H);
  });

  const slug = (goal||"report").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,30);
  const date = new Date().toISOString().slice(0,10);
  doc.save(`agentflow-${slug}-${date}.pdf`);
}
