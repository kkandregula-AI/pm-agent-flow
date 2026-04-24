# AgentFlow 2.0 — PWA Deployment Guide

A multi-agent AI company as a Progressive Web App.  
One business goal → 9 AI agents → Full company execution.

---

## 🚀 Deploy to Vercel (5 minutes)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Test locally
```bash
# Add a .env.local file:
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local

npm run dev
```
Open http://localhost:5173

### Step 3 — Deploy to Vercel
```bash
npm install -g vercel   # if not installed
vercel
```
Follow the prompts. When asked about framework: select **Vite**.

### Step 4 — Add API key to Vercel
Go to your Vercel dashboard → Project → Settings → Environment Variables:
```
Name:   ANTHROPIC_API_KEY
Value:  sk-ant-xxxxxxxxxxxx
```
Then redeploy: `vercel --prod`

### Step 5 — Add PWA Icons
Place two icon files in the `public/icons/` folder:
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

You can generate these at https://realfavicongenerator.net

---

## 📱 How Team Members Install the PWA

### On iPhone/iPad (Safari):
1. Open the Vercel URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **Add** → App appears on home screen

### On Android (Chrome):
1. Open the Vercel URL in Chrome
2. Tap the **⋮ menu** → "Add to Home Screen"
3. Or tap the **Install** banner that appears automatically

### On Desktop (Chrome/Edge):
1. Open the Vercel URL
2. Click the **install icon** in the address bar
3. Click **Install**

---

## 🏗 Project Structure

```
agentflow-pwa/
├── api/
│   └── chat.js          ← Vercel serverless proxy (keeps API key safe)
├── src/
│   ├── main.jsx         ← Entry point + PWA service worker registration
│   └── App.jsx          ← Main AgentFlow UI + all 9 agent logic
├── public/
│   └── icons/           ← Add icon-192.png and icon-512.png here
├── index.html           ← PWA meta tags
├── vite.config.js       ← Vite + PWA plugin config
├── vercel.json          ← Routing config
└── package.json
```

---

## 🔑 Security

- Your `ANTHROPIC_API_KEY` is stored in Vercel's environment — never in the browser
- All Claude API calls route through `/api/chat` (serverless function)
- Team members access the app via URL, no key needed on their end

---

## 🛠 Local Development with Vercel Functions

To test the serverless function locally:
```bash
npm install -g vercel
vercel dev
```
This runs both the Vite frontend and the `/api/chat` function together.
