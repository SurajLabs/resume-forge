const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_PROMPT_LENGTH = 100000;
const GEMINI_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
]);
const GROQ_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
]);
const CLAUDE_MODELS = new Set(["claude-sonnet-4-5"]);

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function normalizeUsage(usage, promptKey, completionKey, totalKey) {
  const promptTokens = usage?.[promptKey] || 0;
  const completionTokens = usage?.[completionKey] || 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.[totalKey] || promptTokens + completionTokens
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method Not Allowed" });
  }

  let request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Request body must be valid JSON" });
  }

  const { provider, prompt, model, systemPrompt } = request;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return response(400, { error: "A non-empty prompt is required" });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return response(413, { error: "Prompt exceeds the maximum allowed length" });
  }

  try {
    if (provider === "gemini") {
      if (!GEMINI_MODELS.has(model)) {
        return response(400, { error: "Unsupported Gemini model" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return response(503, {
          code: "PROVIDER_NOT_CONFIGURED",
          error: "Gemini is not configured on the server"
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2500 }
        })
      });
      if (!upstream.ok) {
        return response(upstream.status, { error: `Gemini request failed (${upstream.status})` });
      }

      const data = await upstream.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return response(502, { error: "Gemini returned an empty response" });
      return response(200, {
        text,
        provider,
        model,
        tokens: normalizeUsage(data.usageMetadata, "promptTokenCount", "candidatesTokenCount", "totalTokenCount")
      });
    }

    if (provider === "claude") {
      if (!CLAUDE_MODELS.has(model)) {
        return response(400, { error: "Unsupported Anthropic model" });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return response(503, {
          code: "PROVIDER_NOT_CONFIGURED",
          error: "Anthropic is not configured on the server"
        });
      }

      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: typeof systemPrompt === "string" ? systemPrompt : "",
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!upstream.ok) {
        return response(upstream.status, { error: `Anthropic request failed (${upstream.status})` });
      }

      const data = await upstream.json();
      const text = data.content?.[0]?.text;
      if (!text) return response(502, { error: "Anthropic returned an empty response" });
      return response(200, {
        text,
        provider,
        model,
        tokens: normalizeUsage(data.usage, "input_tokens", "output_tokens", "total_tokens")
      });
    }

    if (provider === "groq-70b" || provider === "groq-8b") {
      if (!GROQ_MODELS.has(model)) {
        return response(400, { error: "Unsupported Groq model" });
      }
      if ((provider === "groq-8b") !== model.includes("8b")) {
        return response(400, { error: "Groq provider does not match the requested model" });
      }

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return response(503, {
          code: "PROVIDER_NOT_CONFIGURED",
          error: "Groq is not configured on the server"
        });
      }

      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: typeof systemPrompt === "string" && systemPrompt
                ? systemPrompt
                : "You are an ATS resume expert. Always return valid JSON when asked."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        })
      });
      if (!upstream.ok) {
        return response(upstream.status, { error: `Groq request failed (${upstream.status})` });
      }

      const data = await upstream.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return response(502, { error: "Groq returned an empty response" });
      return response(200, {
        text,
        provider,
        model,
        tokens: normalizeUsage(data.usage, "prompt_tokens", "completion_tokens", "total_tokens")
      });
    }

    return response(400, { error: "Unsupported AI provider" });
  } catch (error) {
    console.error("AI proxy request failed:", error.message);
    return response(502, { error: "AI provider request failed" });
  }
};
