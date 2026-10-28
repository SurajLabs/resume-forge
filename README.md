# ResumeForge — ATS Resume Optimizer & Bento Studio

> **An ultra-modern, high-parsing-fidelity resume studio built with Bento Grid Glassmorphism UI, Stitch MCP single-column typography, 3-layer free AI fallback (Gemini + Groq), and one-click PDF, DOCX, and TXT downloads.**

---

## 🌟 What's New in This Version

### 1. Fix 1: Non-Destructive Sample Data Modal
- **4-Way Close Protection**:
  1. Top-right `✕` icon
  2. "Cancel & Keep My Resume" button
  3. Backdrop click
  4. `Escape` key
- **Zero Data Loss Guarantee**: Closing or canceling the modal instantly restores the user's previously edited resume. The resume is only replaced if the user explicitly confirms **"Load Sample Data"**.

### 2. Fix 2: Unified "Generate ATS Resume" Button with 10s Undo
- Directly applies the ATS optimization prompt:
  > *"You are an ATS resume optimizer. Rewrite the resume content. Rules: strong action verbs, quantified metrics, keyword-rich, no first-person pronouns, each bullet ≤ 2 lines, standard section headings, professional tone. Return valid JSON only: { summary, experience[], skills[] }"*
- Shimmer skeleton and spinner during generation.
- **10-Second Undo Toast**: User can click "Undo (10s)" to immediately revert back to their original text.

### 3. Fix 3: Sticky Multi-Format Download Dropdown
- Sticky top-right **"⬇ Download"** button with dropdown:
  - 📄 **PDF**: Selectable vector text, single-column, standard ATS fonts, named `${FirstName}_${LastName}_Resume.pdf`.
  - 📝 **DOCX**: Native Microsoft Word document generated client-side via `docx` + `FileSaver.js`.
  - 📋 **TXT**: Clean ASCII/UTF-8 formatted linear text file.
  - 🔗 **Copy as Plain Text**: Instant clipboard copy with success toast notification.
- **Download Preview Modal**: Review ATS checks before confirming download.

### 4. Upgrade 4: Bento Grid + Glassmorphism UI
- **Responsive Bento Grid Architecture**:
  - **Row 1**: `[Profile Card - large]` `[ATS Score Meter]` `[2 Small Stat Cards]`
  - **Row 2**: `[Experience Editor - wide]` `[Skills + AI Suggestions]`
  - **Row 3**: `[Education & Projects]` `[Generate ATS Button & Target JD]`
- **Glassmorphism Design**:
  - `backdrop-filter: blur(20px) saturate(180%)`
  - Subtle dark gradient with animated mesh glow
  - Inter for clean UI typography + **JetBrains Mono** for the ATS score gauge
  - Violet (`#7C3AED`), Cyan (`#06B6D4`), and Success (`#10B981`) accents
- **Live Resume Canvas Drawer**: Click **"👁 Live Preview"** in the top bar to inspect the printable single-column Stitch MCP document.

---

## 🚀 Running Locally

The static page can be previewed with Python, but AI generation requires the Netlify function:

```bash
cd "c:\Resume Maker"
netlify dev
```

Create a local `.env` file from `.env.example` and fill in the keys for the providers you want to enable. `.env` is ignored by Git; never commit it. The Netlify CLI serves the site and function together.

## 🔐 Deploying with private API keys

1. Push the project to GitHub without API keys.
2. Import the GitHub repository into Netlify. The included `netlify.toml` configures the publish directory and serverless function.
3. In Netlify, open **Site configuration → Environment variables** and add `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, and/or `GROQ_API_KEY`.
4. Redeploy the site so the function receives the variables.

The browser sends prompts to the Netlify function at `/api/ai`. The function reads keys from `process.env`; they are not embedded in the HTML or JavaScript. GitHub repository secrets are not automatically available to a Netlify-hosted function, so configure these values in Netlify. Do not put keys in a source file, GitHub Actions workflow, or frontend build variable.

The proxy endpoint is reachable by visitors to a public site, even though its provider keys are not. Monitor provider usage and configure spending/usage limits; add authentication and rate limiting before offering the endpoint publicly at scale.

**Important:** API keys previously included in the repository must be revoked and replaced. Removing a key from the latest version does not erase it from Git history.
