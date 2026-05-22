import { SYSTEM_PROMPT, buildUserMessage, parseClassificationResponse } from './prompts';

// @ts-ignore — Chrome 138+ built-in AI API
type LanguageModelSession = { prompt: (text: string) => Promise<string>; destroy: () => void };

let session: LanguageModelSession | null = null;

async function getSession(): Promise<LanguageModelSession> {
  if (session) return session;

  // @ts-ignore
  const created = await LanguageModel.create({
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0,
    topK: 1,
    expectedLanguage: 'en'
  });
  session = created;
  return created;
}

export async function checkChromeAIAvailability(): Promise<'available' | 'unavailable' | 'downloading'> {
  try {
    // @ts-ignore
    if (!globalThis.LanguageModel) return 'unavailable';
    // @ts-ignore
    const status = await LanguageModel.availability();
    if (status === 'readily') return 'available';
    if (status === 'after-download') return 'downloading';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function classifyWithChromeAI(url: string, title: string): Promise<{ category: string; confidence: number } | null> {
  try {
    const s = await getSession();
    const response = await s.prompt(buildUserMessage(url, title));
    return parseClassificationResponse(response);
  } catch {
    // Reset session on error
    session?.destroy();
    session = null;
    return null;
  }
}
