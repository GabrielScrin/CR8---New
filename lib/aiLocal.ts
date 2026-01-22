export type LlmProvider = 'openai' | 'google' | 'anthropic' | 'deepseek';

export type LocalAiSettings = {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
};

export const defaultModelByProvider: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  google: 'gemini-2.5-flash',
  anthropic: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
};

const storageKey = (userId: string) => `cr8.ai.settings.v1:${userId}`;

export const loadLocalAiSettings = (userId?: string): LocalAiSettings | null => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAiSettings>;
    if (!parsed.provider || !parsed.apiKey) return null;

    // Migration: older builds used gemini-1.5-flash as default. Keep the saved value only if the user explicitly changed it.
    const provider = parsed.provider as LlmProvider;
    const modelRaw = parsed.model ? String(parsed.model) : undefined;
    const model =
      provider === 'google' && modelRaw === 'gemini-1.5-flash' ? undefined : modelRaw;
    return {
      provider,
      apiKey: String(parsed.apiKey),
      model,
    };
  } catch {
    return null;
  }
};

export const saveLocalAiSettings = (userId: string, settings: LocalAiSettings) => {
  localStorage.setItem(storageKey(userId), JSON.stringify(settings));
};

export const clearLocalAiSettings = (userId: string) => {
  localStorage.removeItem(storageKey(userId));
};
