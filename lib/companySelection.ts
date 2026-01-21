const storageKey = (userId: string) => `cr8:selectedCompanyId:${userId}`;

export const loadSelectedCompanyId = (userId: string): string | undefined => {
  try {
    const value = window.localStorage.getItem(storageKey(userId));
    return value || undefined;
  } catch {
    return undefined;
  }
};

export const saveSelectedCompanyId = (userId: string, companyId: string) => {
  try {
    window.localStorage.setItem(storageKey(userId), companyId);
  } catch {
    // ignore
  }
};

export const clearSelectedCompanyId = (userId: string) => {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
};

