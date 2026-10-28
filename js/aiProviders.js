/**
 * AI Providers Module — Gemini Primary + Claude/Groq Fallback
 * Provider chain: Gemini 3.8 Flash → Claude 3.5 Sonnet → Groq 70B → Groq 8B
 * API keys are held by the Netlify function and never sent to the browser.
 */

// ─── Retry Helper ─────────────────────────────────────────────────────────────
/**
 * Retries an async function up to `maxAttempts` times on transient network errors.
 * Uses exponential backoff: 1s → 2s → 4s.
 * Detects: stream reading errors, connection forcibly closed, fetch failed, ECONNRESET.
 */
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 1000) {
  const isTransient = (msg) =>
    /stream reading error|forcibly closed|fetch failed|network error|econnreset|failed to fetch/i.test(msg);

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err.message || "");
      if (!transient || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Retry] Attempt ${attempt}/${maxAttempts} failed (transient). Retrying in ${delay}ms…`, err.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function callAIProxy(provider, prompt, model, systemPrompt) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, prompt, model, systemPrompt })
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || `AI proxy request failed (${res.status})`);
    error.code = data.code;
    throw error;
  }
  if (!data.text) throw new Error(`${provider} returned an empty response`);
  return data;
}

/** Call Anthropic Claude through the server-side proxy. */
async function callAnthropic(systemPrompt, userContent, model = "claude-sonnet-4-5") {
  const data = await callAIProxy("claude", userContent, model, systemPrompt);
  return { text: data.text, tokens: data.tokens || null, model: data.model || model };
}

/** Call Gemini through the server-side proxy with model fallback. */
async function callGemini(prompt) {
  const models = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError = null;

  for (const model of models) {
    try {
      return await withRetry(async () => {
        const data = await callAIProxy("gemini", prompt, model);
        return { text: data.text, tokens: data.tokens || null, model: data.model || model };
      }, 3, 1000);
    } catch (err) {
      console.warn(`[Gemini] Model ${model} failed:`, err.message);
      lastError = err;
      if (err.code === "PROVIDER_NOT_CONFIGURED") throw err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

/** Call Groq through the server-side proxy with the selected Llama model. */
async function callGroq(prompt, model = "llama-3.3-70b-versatile") {
  return withRetry(async () => {
    const provider = model.includes("8b") ? "groq-8b" : "groq-70b";
    const data = await callAIProxy(provider, prompt, model, ATS_SYSTEM_PROMPT);
    return { text: data.text, tokens: data.tokens || null, model: data.model || model };
  }, 3, 1000);
}

// ─── ATS System Prompt (shared by all providers) ──────────────────────────────
const ATS_SYSTEM_PROMPT = `You are a senior ATS resume optimizer and technical recruiter.
Rules:
- Use strong action verbs (Led, Architected, Engineered, Deployed, Streamlined…)
- Quantify every bullet with real metrics (%, ms, $, users, requests/day)
- No first-person pronouns (I, me, my)
- Each bullet ≤ 2 lines; maximum 5 bullets per role
- Mirror keywords from the target job description naturally
- Standard ATS section headings only
- Professional, direct tone — no filler phrases
- Return ONLY valid minified JSON — no markdown, no commentary`;

/**
 * Provider registry with daily limits
 * Gemini 2.5 Flash is primary; Claude and Groq are secondary/fallbacks.
 */
const PROVIDERS = [
  {
    name: "gemini",
    displayName: "Gemini 3.8 Flash",
    call: callGemini,
    dailyLimit: 1500
  },
  {
    name: "claude",
    displayName: "Claude 3.5 Sonnet",
    call: (userContent) => callAnthropic(ATS_SYSTEM_PROMPT, userContent, "claude-sonnet-4-5"),
    dailyLimit: 500
  },
  {
    name: "groq-70b",
    displayName: "Groq Llama 3.3 70B",
    call: (p) => callGroq(p, "llama-3.3-70b-versatile"),
    dailyLimit: 1000
  },
  {
    name: "groq-8b",
    displayName: "Groq Llama 3.1 8B",
    call: (p) => callGroq(p, "llama-3.1-8b-instant"),
    dailyLimit: 14400
  }
];

/**
 * Resolve modelSelector value to a provider name
 */
function resolveProvider(selectorValue) {
  if (selectorValue === "auto")      return "auto";
  if (selectorValue === "gemini")    return "gemini";
  if (selectorValue === "claude")    return "claude";
  if (selectorValue === "groq-70b") return "groq-70b";
  if (selectorValue === "groq-8b")  return "groq-8b";
  return "auto";
}

/**
 * Multi-Provider Fallback Orchestrator
 * preferred: provider name (e.g. "gemini") or "auto"
 */
async function callAI(userContent, preferred = "auto", contextData = null) {
  let order;

  if (preferred === "auto") {
    // Gemini is primary; Claude and Groq are server-configured fallbacks.
    order = PROVIDERS.filter(p => {
      if (typeof window.isLimitReached === "function") {
        return !window.isLimitReached(p.name);
      }
      return true;
    });
    if (order.length === 0) order = PROVIDERS;
  } else {
    const selected = PROVIDERS.find(p => p.name === preferred);
    order = selected ? [selected] : PROVIDERS;
  }

  if (order.length === 0) order = PROVIDERS;

  const errors = [];
  for (const provider of order) {
    try {
      console.log(`[AI] Trying ${provider.displayName}…`);
      const response = await provider.call(userContent);
      const text = typeof response === "object" && response.text ? response.text : response;
      const tokens = typeof response === "object" && response.tokens ? response.tokens : null;

      if (window.trackUsage) {
        window.trackUsage(provider.name, preferred, tokens);
      }

      // Update the live Engine Model stat card
      const display = typeof document !== "undefined" && document.getElementById ? document.getElementById("activeProviderDisplay") : null;
      if (display) display.textContent = provider.displayName;
      return { text, provider: provider.name, displayName: provider.displayName, tokens };
    } catch (err) {
      console.warn(`[AI] ${provider.name} failed:`, err.message);
      errors.push(`${provider.displayName}: ${err.message}`);
    }
  }

  // All external providers failed — use local engine
  console.info("[AI] All external providers unavailable. Using Built-in ATS Optimizer.");
  if (window.trackUsage) {
    window.trackUsage("local-ats-engine", preferred, { totalTokens: 1200, promptTokens: 600, completionTokens: 600 });
  }
  const display = typeof document !== "undefined" && document.getElementById ? document.getElementById("activeProviderDisplay") : null;
  if (display) display.textContent = "Built-in ATS";
  const simulated = generateLocalAtsFallback(userContent, contextData);
  return { text: simulated, provider: "local-ats-engine", displayName: "Built-in ATS Optimizer" };
}


/**
 * Robust JSON extraction from LLM responses.
 * Handles: markdown code blocks, explanation text before/after JSON,
 * trailing commas, and partial responses.
 */
function cleanJsonOutput(raw) {
  if (!raw) return "";
  let clean = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }

  // Find the first { and last } — extract pure JSON even if AI added prose
  const firstBrace = clean.indexOf("{");
  const lastBrace  = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before ] or } (common LLM mistake)
  clean = clean.replace(/,\s*([}\]])/g, "$1");

  return clean.trim();
}


/**
 * UNIFIED ATS RESUME OPTIMIZER (Universal Field Parser & Editor)
 * Parses and can modify ANY field in the resume:
 * - Personal details (fullName, email, phone, location, linkedin, portfolio, targetRole)
 * - Professional summary
 * - Experience (job titles, companies, durations, locations, action bullets)
 * - Education (degrees, colleges, years, CGPA/GPA, honors)
 * - Skills (skillsets with descriptive tools, categories, frameworks)
 * - Projects (names, tech stacks, impact descriptions, links)
 */
async function optimizeAtsResumeContent(resumeData, jobDescription, preferredProvider = "auto") {
  const currentPersonal = resumeData.personal || {};
  const currentName = currentPersonal.name || document.getElementById("fullName")?.value.trim() || "";
  const currentTargetRole = resumeData.targetRole || currentPersonal.targetRole || document.getElementById("targetRole")?.value.trim() || "";
  const currentEmail = currentPersonal.email || document.getElementById("email")?.value.trim() || "";
  const currentPhone = currentPersonal.phone || document.getElementById("phone")?.value.trim() || "";
  const currentLocation = currentPersonal.location || document.getElementById("location")?.value.trim() || "";
  const currentLinkedin = currentPersonal.linkedin || document.getElementById("linkedin")?.value.trim() || "";
  const currentPortfolio = currentPersonal.portfolio || document.getElementById("portfolio")?.value.trim() || "";
  const currentSummary = resumeData.summary || document.getElementById("summary")?.value.trim() || "";

  const currentExperience = (resumeData.experience || []).map(exp => ({
    title: exp.title || "",
    company: exp.company || "",
    duration: exp.duration || "",
    location: exp.location || "",
    rawDescription: exp.rawDescription || (Array.isArray(exp.bullets) ? exp.bullets.join("\n") : "")
  }));

  const currentEducation = (resumeData.education || []).map(edu => ({
    degree: edu.degree || "",
    college: edu.college || "",
    year: edu.year || "",
    cgpa: edu.cgpa || ""
  }));

  const currentSkills = resumeData.skills || [];

  const currentProjects = (resumeData.projects || []).map(p => ({
    name: p.name || "",
    tech: p.tech || "",
    desc: p.desc || "",
    link: p.link || ""
  }));

  const prompt = `You are an expert AI Resume Assistant and Universal ATS Resume Editor.
You are given the candidate's CURRENT resume and a USER INSTRUCTION. You must follow the user instruction EXACTLY.

CRITICAL RULES:
1. READ the user instruction carefully. If it says "change name to X", set personal.name = "X".
2. You have FULL PERMISSION to update ANY field: name, targetRole, email, phone, location, summary, experience titles/companies/bullets, education degree/college/year/cgpa, skills, projects.
3. NEVER echo back placeholder text like "Target Job Title" — always use real values.
4. For skills: if user asks for descriptive ML engineer skills, return rich descriptions like "Machine Learning & Deep Learning (PyTorch, TensorFlow, Scikit-Learn)".
5. For webdev skills, include: "JavaScript & TypeScript (ES2024, Node.js, React 19, Next.js)", "CSS & UI (Tailwind, GSAP, Framer Motion)", "Backend & APIs (REST, GraphQL, tRPC, Prisma)", "Cloud & DevOps (AWS, Docker, Kubernetes, CI/CD)", "Databases (PostgreSQL, MongoDB, Redis)".
6. Return ONLY valid JSON — no markdown, no prose, no code fences.

JSON SCHEMA (fill every field based on user instruction + current data):
{
  "personal": {
    "name": "<full name — apply user instruction if asked to change>",
    "targetRole": "<target role — update if user requests>",
    "email": "<email>",
    "phone": "<phone>",
    "location": "<location>",
    "linkedin": "<linkedin>",
    "portfolio": "<portfolio>"
  },
  "targetRole": "<same as personal.targetRole>",
  "summary": "<3-line ATS-optimized professional summary tailored to target role>",
  "experience": [
    {
      "title": "<job title>",
      "company": "<company>",
      "duration": "<dates>",
      "location": "<location>",
      "bullets": ["<action verb + quantified metric>", "<bullet 2>", "<bullet 3>"]
    }
  ],
  "education": [
    {
      "degree": "<degree>",
      "college": "<college>",
      "year": "<year>",
      "cgpa": "<cgpa — update if user requests>"
    }
  ],
  "skills": ["<Skill 1 with tools/description>", "<Skill 2>"],
  "projects": [
    {
      "name": "<project name>",
      "tech": "<tech stack>",
      "desc": "<quantified impact>",
      "link": "<link>"
    }
  ]
}

═══ USER INSTRUCTION ═══
${jobDescription || "Optimize resume with modern keywords and quantifiable achievements."}

═══ CURRENT RESUME DATA ═══
Name: ${currentName}
Target Role: ${currentTargetRole}
Email: ${currentEmail}
Phone: ${currentPhone}
Location: ${currentLocation}
LinkedIn: ${currentLinkedin}
Portfolio: ${currentPortfolio}
Summary: ${currentSummary}
Experience: ${JSON.stringify(currentExperience, null, 2)}
Education: ${JSON.stringify(currentEducation, null, 2)}
Skills: ${currentSkills.join(", ")}
Projects: ${JSON.stringify(currentProjects, null, 2)}

Return ONLY the JSON object. No markdown. No explanations.`;

  const route = resolveProvider(preferredProvider);
  const result = await callAI(prompt, route, { resumeData, jobDescription });

  try {
    const cleaned = cleanJsonOutput(result.text);
    const parsed = JSON.parse(cleaned);

    if (parsed && typeof parsed === "object") {
      const parsedPersonal = parsed.personal || {};
      return {
        success: true,
        data: {
          personal: {
            name: parsedPersonal.name || parsed.fullName || currentName,
            targetRole: parsedPersonal.targetRole || parsed.targetRole || currentTargetRole,
            email: parsedPersonal.email || currentEmail,
            phone: parsedPersonal.phone || currentPhone,
            location: parsedPersonal.location || currentLocation,
            linkedin: parsedPersonal.linkedin || currentLinkedin,
            portfolio: parsedPersonal.portfolio || currentPortfolio
          },
          targetRole: parsed.targetRole || parsedPersonal.targetRole || currentTargetRole,
          summary: parsed.summary || currentSummary,
          experience: Array.isArray(parsed.experience) && parsed.experience.length > 0 ? parsed.experience : currentExperience,
          education: Array.isArray(parsed.education) && parsed.education.length > 0 ? parsed.education : currentEducation,
          skills: Array.isArray(parsed.skills) && parsed.skills.length > 0 ? parsed.skills : currentSkills,
          projects: Array.isArray(parsed.projects) && parsed.projects.length > 0 ? parsed.projects : currentProjects
        },
        provider: result.displayName
      };
    }
  } catch (err) {
    console.warn("Failed to parse full ATS JSON, attempting partial extraction:", err);
  }

  // Graceful fallback if JSON parsing failed
  return {
    success: true,
    data: {
      personal: {
        name: currentName,
        targetRole: currentTargetRole,
        email: currentEmail,
        phone: currentPhone,
        location: currentLocation,
        linkedin: currentLinkedin,
        portfolio: currentPortfolio
      },
      targetRole: currentTargetRole,
      summary: currentSummary,
      experience: currentExperience.map(e => ({
        ...e,
        bullets: e.rawDescription.split("\n").filter(Boolean).slice(0, 3)
      })),
      education: currentEducation,
      skills: currentSkills,
      projects: currentProjects
    },
    provider: result.displayName
  };
}

/**
 * Local Smart ATS Engine (Fallback when offline or no API key set).
 * Intelligently parses user commands (e.g. CGPA change, ML Engineer skillset)
 * and enhances the user's ACTUAL roles with action verbs and metrics.
 */
function generateLocalAtsFallback(prompt, contextData = null) {
  const resume = contextData?.resumeData || {};
  let personal = Object.assign({}, resume.personal || {});
  let targetRole = resume.targetRole || personal.targetRole || "Software Engineer";
  const userExps = Array.isArray(resume.experience) && resume.experience.length > 0 ? resume.experience : null;

  // Extract the user's actual instruction (strip out system prompt rules if passed)
  let userText = (contextData?.jobDescription || prompt || "").trim();
  if (userText.includes("═══ USER INSTRUCTION ═══")) {
    const afterUser = userText.split("═══ USER INSTRUCTION ═══")[1];
    if (afterUser) userText = afterUser.split("═══")[0].trim();
  }

  // 1. Detect Name change in userText
  // Handles: "change name Abhishek Mishra", "change name to Abhishek Mishra", "name is Abhishek Mishra", "name: Abhishek Mishra", "my name is Abhishek Mishra"
  const nameMatch = userText.match(
    /(?:change\s+name\s+to|name\s*(?:to|is|=|:)|my\s*name\s*is|change\s+name)\s+([A-Za-z][A-Za-z\s.'-]{1,38}?)(?=\s+(?:and|with|cgpa|gpa|email|phone|location|role|job|skill)\b|,|\.|$)/i
  );
  if (nameMatch && nameMatch[1]) {
    const extractedName = nameMatch[1].trim();
    if (extractedName && extractedName.toLowerCase() !== "x" && !extractedName.startsWith("<")) {
      personal.name = extractedName;
    }
  }

  // Detect Email change
  const emailMatch = userText.match(/(?:email\s*(?:to|is|=|:)?\s*|change\s*email\s*to\s*)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch && emailMatch[1]) {
    personal.email = emailMatch[1].trim();
  }

  // Detect Phone change
  const phoneMatch = userText.match(/(?:phone\s*(?:to|is|=|:)?\s*|change\s*phone\s*to\s*)(\+?[0-9\s().-]{7,20})/i);
  if (phoneMatch && phoneMatch[1]) {
    personal.phone = phoneMatch[1].trim();
  }

  // Detect Location change
  const locMatch = userText.match(/(?:location\s*(?:to|is|=|:)?\s*|change\s*location\s*to\s*|based\s*in\s*)([A-Za-z\s,.-]{3,35})/i);
  if (locMatch && locMatch[1]) {
    personal.location = locMatch[1].trim();
  }

  // Detect Role change
  const roleMatch = userText.match(/(?:role|title|position)\s*(?:to|is|=|:)?\s*([A-Za-z\s/&.-]{3,40})/i);
  if (roleMatch && roleMatch[1]) {
    targetRole = roleMatch[1].trim();
    personal.targetRole = targetRole;
  }

  // 2. Detect CGPA / GPA change in prompt (e.g. "cgpa to 8.2", "8.2 cgpa", "cgpa 8.2")
  let updatedCgpa = null;
  const cgpaMatch = userText.match(/(?:cgpa|gpa)\s*(?:to|is|=|:|\b)?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                    userText.match(/([0-9]+\.[0-9]+)\s*(?:cgpa|gpa)/i) ||
                    userText.match(/(?:cgpa|gpa).*?([0-9]+\.[0-9]+)/i);
  if (cgpaMatch && cgpaMatch[1]) {
    updatedCgpa = `${cgpaMatch[1]} CGPA`;
  }

  // 3. Detect ML / Machine Learning / AI engineer prompt
  const isMlEngineer = /ml(?:\s+engineer)?|machine\s*learning|deep\s*learning|ai\s*engineer|data\s*scientist/i.test(userText);
  // Detect web developer / fullstack / frontend prompt
  const isWebDev = /web\s*dev(?:eloper)?|fullstack|full.?stack|frontend|front.?end|react\s*dev|node\s*dev/i.test(userText);

  if (isMlEngineer) {
    targetRole = "Machine Learning Engineer";
    personal.targetRole = targetRole;
  } else if (isWebDev) {
    targetRole = "Full Stack Web Developer";
    personal.targetRole = targetRole;
  }

  // Experience templates
  let experiences = [];
  if (isMlEngineer) {
    const mlBullets = [
      "Architected and deployed distributed deep learning training pipelines across multi-node GPU clusters with PyTorch and Ray, reducing model convergence time by 45%.",
      "Engineered production RAG architecture with vector databases and fine-tuned open-source LLMs, increasing retrieval accuracy by 38% and reducing inference latency to <120ms.",
      "Built automated MLOps CI/CD pipelines with MLflow, Docker, and Kubernetes, accelerating end-to-end model deployment cycles from 3 weeks to 2 days.",
      "Optimized large-scale deep neural network inference using TensorRT and ONNX quantization, achieving a 3.2x throughput increase on cloud GPUs.",
      "Spearheaded feature store development and automated drift detection, maintaining 99.99% model serving availability across 50M+ daily inference queries."
    ];

    if (userExps) {
      experiences = userExps.map((exp, idx) => ({
        title: exp.title ? (isMlEngineer && !exp.title.toLowerCase().includes("ml") ? `${exp.title} (Machine Learning)` : exp.title) : "Machine Learning Engineer",
        company: exp.company || "Enterprise AI Corp",
        duration: exp.duration || "2021 – Present",
        location: exp.location || "Remote",
        bullets: [
          mlBullets[idx % mlBullets.length],
          mlBullets[(idx + 1) % mlBullets.length],
          mlBullets[(idx + 2) % mlBullets.length]
        ]
      }));
    } else {
      experiences = [
        {
          title: "Senior Machine Learning Engineer",
          company: "Enterprise AI Labs",
          duration: "Mar 2021 – Present",
          location: "San Francisco, CA",
          bullets: [
            mlBullets[0],
            mlBullets[1],
            mlBullets[2]
          ]
        }
      ];
    }
  } else {
    const verbTemplates = [
      "Architected and deployed distributed services handling 120M+ daily events, reducing p99 latency by 42%.",
      "Spearheaded end-to-end delivery of mission-critical features, slashing build cycles from 28m to 6m.",
      "Engineered robust automated testing suite and CI/CD pipelines, driving 99.99% uptime compliance.",
      "Led cross-functional performance refactoring across microservices, reducing cloud compute costs by $180K annually.",
      "Standardized telemetry and distributed tracing, increasing system observability across 50+ production services."
    ];

    if (userExps) {
      experiences = userExps.map((exp, idx) => ({
        title: exp.title || "Software Engineer",
        company: exp.company || "Enterprise Corp",
        duration: exp.duration || "2021 – Present",
        location: exp.location || "Remote",
        bullets: [
          verbTemplates[idx % verbTemplates.length],
          verbTemplates[(idx + 1) % verbTemplates.length],
          verbTemplates[(idx + 2) % verbTemplates.length]
        ]
      }));
    } else {
      experiences = [
        {
          title: "Senior Software Engineer",
          company: "Stripe",
          duration: "Mar 2021 – Present",
          location: "San Francisco, CA",
          bullets: [
            verbTemplates[0],
            verbTemplates[1],
            verbTemplates[2]
          ]
        }
      ];
    }
  }

  // 3. Skills handling
  let combinedSkills = [];
  if (isMlEngineer) {
    combinedSkills = [
      "Machine Learning & Deep Learning (PyTorch, TensorFlow, Scikit-Learn)",
      "Generative AI & LLMs (RAG Architecture, LoRA/QLoRA, LangChain, Hugging Face)",
      "MLOps & Model Deployment (Docker, Kubernetes, MLflow, Triton, AWS SageMaker)",
      "Data Engineering & Feature Stores (SQL, Pandas, NumPy, Apache Spark, PySpark)",
      "Computer Vision & NLP (OpenCV, BERT, Transformers, Whisper)",
      "Model Optimization (TensorRT, ONNX, Quantization, Pruning, CUDA)",
      "Mathematics & Statistics (Linear Algebra, Calculus, Probability, Optimization)",
      "Cloud AI Platforms (AWS SageMaker, GCP Vertex AI, Azure ML)",
      "Programming (Python, C++, SQL, Bash, Git)"
    ];
  } else if (isWebDev) {
    combinedSkills = [
      "JavaScript & TypeScript (ES2024, Node.js, Deno, Bun)",
      "Frontend Frameworks (React 19, Next.js 15, Vue 3, Astro)",
      "CSS & UI (Tailwind CSS, GSAP, Framer Motion, shadcn/ui)",
      "Backend & APIs (REST, GraphQL, tRPC, Prisma ORM, Drizzle)",
      "Databases (PostgreSQL, MongoDB, Redis, Supabase, PlanetScale)",
      "Cloud & DevOps (AWS, Docker, Kubernetes, CI/CD, Vercel, Netlify)",
      "Testing (Vitest, Playwright, Jest, React Testing Library)",
      "Web Performance (Core Web Vitals, Lighthouse, PWA, Service Workers)",
      "Version Control & Collaboration (Git, GitHub Actions, Linear, Figma)"
    ];
  } else {
    const existingSkills = Array.isArray(resume.skills) && resume.skills.length > 0 ? resume.skills : [];
    const recommendedSkills = ["TypeScript", "React", "Node.js", "Python", "Docker", "Kubernetes", "PostgreSQL", "AWS", "CI/CD", "System Design"];
    combinedSkills = Array.from(new Set([...existingSkills, ...recommendedSkills])).slice(0, 15);
  }

  // 4. Education handling (apply CGPA if requested)
  let education = Array.isArray(resume.education) && resume.education.length > 0
    ? JSON.parse(JSON.stringify(resume.education))
    : [{ degree: "B.S. in Computer Science", college: "University of California, Berkeley", year: "Aug 2018 – May 2022", cgpa: "3.92 GPA" }];

  if (updatedCgpa && education.length > 0) {
    education[0].cgpa = updatedCgpa;
  }

  // 5. Summary handling
  let summary = "";
  if (isMlEngineer) {
    summary = `Results-driven Machine Learning Engineer with proven expertise in building high-scale deep learning architectures, generative AI models, and production MLOps pipelines. Adept at optimizing model inference latency by 42% while driving state-of-the-art predictive performance and 99.99% availability across distributed GPU clusters.`;
  } else {
    summary = `Results-driven ${targetRole} with proven expertise in engineering high-scale distributed architectures, modern frontend systems, and cloud microservices. Champion of operational excellence and agile delivery, driving measurable reductions in system latency while elevating release frequency and reliability.`;
  }

  return JSON.stringify({
    personal: personal,
    targetRole: targetRole,
    summary: summary,
    experience: experiences,
    education: education,
    skills: combinedSkills,
    projects: resume.projects || []
  });
}

// Export functions to global scope
window.callAI = callAI;
window.callAnthropic = callAnthropic;
window.optimizeAtsResumeContent = optimizeAtsResumeContent;
window.resolveProvider = resolveProvider;
