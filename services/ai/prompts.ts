export const SYSTEM_PROMPT = `You are a web page category classifier for a browser productivity tool.
Your task is to classify a browser tab into exactly one category based on its URL and title.

Categories (use ONLY these labels, lowercase):
- work        : Productivity, calendars, project management, enterprise tools, office docs, meetings
- email       : Email clients, webmail, inboxes, newsletters
- ai          : AI chat interfaces, LLM tools, ChatGPT, Claude, AI generation tools
- social      : Social networks, messaging apps, community forums, dating apps
- shopping    : E-commerce, product pages, price comparisons, marketplaces
- news        : News sites, blogs, journalism, RSS readers, aggregators like HN
- dev         : Documentation, GitHub/GitLab, Stack Overflow, coding, APIs, developer tools, localhost
- entertainment : Video streaming, music, games, sports, TV, podcasts, humor
- uncategorized : Anything that doesn't clearly fit the above

Rules:
1. Respond with ONLY a valid JSON object. No explanation, no markdown fences.
2. Use exactly this structure: {"category": "<label>", "confidence": <0.0-1.0>}
3. Confidence should reflect how certain you are (0.9+ = very sure, <0.5 = guessing)
4. If URL is chrome:// or about:// or empty, return {"category": "uncategorized", "confidence": 1.0}
5. Prioritize URL domain over title when they conflict.`;

export function buildUserMessage(url: string, title: string): string {
  return `Classify this browser tab:\nURL: ${url}\nTitle: ${title}\n\nRespond with JSON only.`;
}

export function parseClassificationResponse(text: string): { category: string; confidence: number } | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```[a-z]*\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.category === 'string' && typeof parsed.confidence === 'number') {
      return parsed;
    }
    return null;
  } catch {
    // Try to extract JSON from text
    const match = text.match(/\{[^}]+\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
