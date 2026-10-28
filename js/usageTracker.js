/**
 * Usage Tracker Module
 * Tracks real provider token usage, request counts, and real-time percentage consumption.
 * Updated to match official current API rate limits (Gemini 2.5 Flash, Claude 3.5, Groq).
 */

const PROVIDER_LIMITS = {
  // Official Google AI Studio Free Tier (Gemini 2.5 Flash / Flash family)
  // Per-project limits: 10-15 RPM, 250,000 - 1,000,000 TPM, 500 - 1,500 RPD
  "gemini": {
    name: "Gemini",
    displayName: "Google Gemini 2.5 Flash",
    tier: "Free Tier",
    dailyRequests: 1500,     // 1,500 RPD (Standard Free Tier ceiling)
    rpm: 15,                 // 15 RPM (Free Tier requests per minute)
    tpm: 1000000,            // 1,000,000 TPM (Free Tier tokens per minute)
    dailyTokenBudget: 5000000 // 5,000,000 daily token budget
  },
  // Groq Cloud Official Free Tier (llama-3.3-70b-versatile)
  // Org-level limits: 30 RPM, 1,000 RPD, 12,000 TPM, 100,000 TPD
  "groq-70b": {
    name: "Groq 70B",
    displayName: "Groq Llama 3.3 70B",
    tier: "Free Tier",
    dailyRequests: 1000,     // 1,000 RPD (Free Tier requests per day)
    rpm: 30,                 // 30 RPM (Free Tier requests per minute)
    tpm: 12000,              // 12,000 TPM (Free Tier tokens per minute)
    dailyTokenBudget: 100000  // 100,000 TPD (Free Tier tokens per day)
  },
  // Groq Cloud Official Free Tier (llama-3.1-8b-instant)
  // Org-level limits: 30 RPM, 14,400 RPD, 6,000 TPM, 500,000 TPD
  "groq-8b": {
    name: "Groq 8B",
    displayName: "Groq Llama 3.1 8B",
    tier: "Free Tier",
    dailyRequests: 14400,    // 14,400 RPD (Free Tier requests per day)
    rpm: 30,                 // 30 RPM (Free Tier requests per minute)
    tpm: 6000,               // 6,000 TPM (Free Tier tokens per minute)
    dailyTokenBudget: 500000  // 500,000 TPD (Free Tier tokens per day)
  },
  // Anthropic Claude 3.5 Sonnet (API Tier 1 starter)
  // Note: Claude.ai web is free; direct API starts at 50 RPM, 40,000 TPM, 500 RPD
  "claude": {
    name: "Claude",
    displayName: "Claude 3.5 Sonnet",
    tier: "API Tier 1",
    dailyRequests: 500,      // 500 RPD
    rpm: 50,                 // 50 RPM
    tpm: 40000,              // 40,000 TPM
    dailyTokenBudget: 250000  // 250,000 daily tokens
  }
};

/**
 * Retrieves the daily usage record from localStorage.
 * Automatically resets if a new day has arrived.
 */
function getUsage() {
  const today = new Date().toDateString();
  const saved = JSON.parse(localStorage.getItem("aiUsage") || "{}");
  if (saved.date !== today) {
    const initial = {
      date: today,
      counts: { "gemini": 0, "groq-70b": 0, "groq-8b": 0, "claude": 0 },
      tokens: { "gemini": 0, "groq-70b": 0, "groq-8b": 0, "claude": 0 },
      lastTokens: { "gemini": 0, "groq-70b": 0, "groq-8b": 0, "claude": 0 },
      totalRequests: 0,
      totalTokens: 0
    };
    localStorage.setItem("aiUsage", JSON.stringify(initial));
    return initial;
  }
  if (!saved.tokens) saved.tokens = { "gemini": 0, "groq-70b": 0, "groq-8b": 0, "claude": 0 };
  if (!saved.lastTokens) saved.lastTokens = { "gemini": 0, "groq-70b": 0, "groq-8b": 0, "claude": 0 };
  return saved;
}

/**
 * Tracks one successful AI request and records real token usage.
 * @param {string} providerName - 'gemini' | 'groq-70b' | 'groq-8b' | 'claude' | 'local-ats-engine'
 * @param {string} [selectedModel] - user-selected model option
 * @param {object} [tokens] - { promptTokens, completionTokens, totalTokens }
 */
function trackUsage(providerName, selectedModel = null, tokens = null) {
  const usage = getUsage();
  if (!usage.counts) usage.counts = {};
  if (!usage.tokens) usage.tokens = {};
  if (!usage.lastTokens) usage.lastTokens = {};

  // Map provider to one of the tracked quota buckets
  let key = providerName;
  if (!PROVIDER_LIMITS[key]) {
    const sel = selectedModel || (typeof document !== "undefined" ? document.getElementById("modelSelector")?.value : "gemini");
    if (sel === "groq-70b") {
      key = "groq-70b";
    } else if (sel === "groq-8b") {
      key = "groq-8b";
    } else if (sel === "claude") {
      key = "claude";
    } else {
      key = "gemini";
    }
  }

  // Count requests
  usage.counts[key] = (usage.counts[key] || 0) + 1;
  usage.totalRequests = (usage.totalRequests || 0) + 1;

  // Track token consumption (actual tokens returned by API or realistic estimation)
  const tokenCount = tokens?.totalTokens || (tokens?.promptTokens && tokens?.completionTokens ? (tokens.promptTokens + tokens.completionTokens) : 1250);
  usage.tokens[key] = (usage.tokens[key] || 0) + tokenCount;
  usage.lastTokens[key] = tokenCount;
  usage.totalTokens = (usage.totalTokens || 0) + tokenCount;

  localStorage.setItem("aiUsage", JSON.stringify(usage));
  updateQuotaUI(key);
}

/**
 * Checks if the limit for a specific provider has been reached.
 * @param {string} providerName
 * @returns {boolean}
 */
function isLimitReached(providerName) {
  const usage = getUsage();
  const limitObj = PROVIDER_LIMITS[providerName];
  if (!limitObj) return false;

  const reqUsed = usage.counts[providerName] || 0;
  const tokenUsed = usage.tokens[providerName] || 0;

  return reqUsed >= limitObj.dailyRequests || tokenUsed >= limitObj.dailyTokenBudget;
}

/**
 * Returns detailed percentage and remaining quota metrics for all providers.
 */
function getRemainingQuota() {
  const usage = getUsage();
  return Object.keys(PROVIDER_LIMITS).map(key => {
    const info = PROVIDER_LIMITS[key];
    const reqUsed = usage.counts[key] || 0;
    const tokensUsed = usage.tokens[key] || 0;
    const reqPercent = Math.min(100, Math.round((reqUsed / info.dailyRequests) * 100));
    const tokenPercent = Math.min(100, Math.round((tokensUsed / info.dailyTokenBudget) * 100));
    const effectivePercent = Math.max(reqPercent, tokenPercent);

    return {
      name: key,
      displayName: info.displayName,
      requestsUsed: reqUsed,
      requestLimit: info.dailyRequests,
      tokensUsed: tokensUsed,
      tokenLimit: info.dailyTokenBudget,
      percentageUsed: effectivePercent,
      remainingRequests: Math.max(0, info.dailyRequests - reqUsed)
    };
  });
}

/**
 * Updates the header quota pills in the UI with dynamic percentage used,
 * token metrics, and visual color warning indicators.
 * @param {string} [highlightKey] - optional provider key to animate
 */
function updateQuotaUI(highlightKey = null) {
  const usage = getUsage();
  if (!usage.counts) usage.counts = {};
  if (!usage.tokens) usage.tokens = {};

  const renderPill = (elemId, key, label) => {
    const el = document.getElementById(elemId);
    if (!el) return;

    const info = PROVIDER_LIMITS[key];
    if (!info) return;

    const reqUsed = usage.counts[key] || 0;
    const tokensUsed = usage.tokens[key] || 0;

    // Calculate percentage based on requests and token consumption
    const reqPct = (reqUsed / info.dailyRequests) * 100;
    const tokenPct = (tokensUsed / info.dailyTokenBudget) * 100;
    const pct = Math.min(100, Math.max(reqPct, tokenPct));
    const formattedPct = pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct);

    // Warning status class
    let statusClass = "status-good";
    if (pct >= 90) {
      statusClass = "danger";
    } else if (pct >= 65) {
      statusClass = "warning";
    }

    // Format tokens (e.g. 1.2k, 25k)
    const formattedTokens = tokensUsed >= 1000 ? (tokensUsed / 1000).toFixed(1) + "k" : tokensUsed;

    el.innerHTML = `
      <span class="dot"></span>
      <span class="quota-name">${label}:</span>
      <strong>${formattedPct}%</strong>
      <span class="quota-meta" title="${info.tier}: ${reqUsed}/${info.dailyRequests} RPD (${info.rpm} RPM), ${formattedTokens} tokens used (${info.tpm ? (info.tpm >= 1000 ? (info.tpm / 1000) + 'k' : info.tpm) : ''} TPM limit)">(${reqUsed}/${info.dailyRequests} req)</span>
    `;

    el.className = `quota-pill ${statusClass}` + (highlightKey === key ? " ai-updated-field" : "");
    el.title = `${info.displayName} [${info.tier}]: ${formattedPct}% used today.\n• Daily Quota: ${reqUsed}/${info.dailyRequests} RPD\n• Speed Limits: ${info.rpm} RPM | ${(info.tpm / 1000).toLocaleString()}k TPM\n• Tokens Consumed: ${tokensUsed.toLocaleString()} / ${info.dailyTokenBudget.toLocaleString()} TPD budget\nFree tier resets daily at midnight Pacific Time.`;

    if (highlightKey === key) {
      setTimeout(() => el?.classList?.remove("ai-updated-field"), 2000);
    }
  };

  renderPill("quotaGemini", "gemini", "Gemini");
  renderPill("quotaGroq70", "groq-70b", "Groq 70B");
  renderPill("quotaGroq8", "groq-8b", "Groq 8B");
}

// Export functions to global scope for vanilla JS access
window.getUsage = getUsage;
window.trackUsage = trackUsage;
window.isLimitReached = isLimitReached;
window.getRemainingQuota = getRemainingQuota;
window.updateQuotaUI = updateQuotaUI;

/**
 * Checks for date rollover at midnight and updates quota pills automatically.
 * Also listens to window focus and visibilitychange so if the tab was kept open overnight,
 * it resets immediately when you return to the page.
 */
function setupMidnightAutoReset() {
  // Listen for tab focus/visibility change (e.g. user leaves tab open overnight)
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        updateQuotaUI();
      }
    });
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => updateQuotaUI());

    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = Math.max(1000, tomorrow.getTime() - now.getTime());

    // Schedule exact midnight refresh
    setTimeout(() => {
      updateQuotaUI();
      // Afterwards, check hourly
      setInterval(() => updateQuotaUI(), 3600000);
    }, msUntilMidnight);
  }
}

// Auto-initialize UI on load
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateQuotaUI();
      setupMidnightAutoReset();
    });
  } else {
    updateQuotaUI();
    setupMidnightAutoReset();
  }
}

