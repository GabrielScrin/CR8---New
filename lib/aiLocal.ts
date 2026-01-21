export type LlmProvider = 'openai' | 'google' | 'anthropic' | 'deepseek';

export type LocalAiSettings = {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
};

const storageKey = (userId: string) => `cr8.ai.settings.v1:${userId}`;

export const loadLocalAiSettings = (userId?: string): LocalAiSettings | null => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAiSettings>;
    if (!parsed.provider || !parsed.apiKey) return null;
    return {
      provider: parsed.provider as LlmProvider,
      apiKey: String(parsed.apiKey),
      model: parsed.model ? String(parsed.model) : undefined,
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

