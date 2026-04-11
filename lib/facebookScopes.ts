export const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
] as const;

// Needed by Meta when Page access is granted through Business Manager.
export const INSTAGRAM_BUSINESS_MANAGER_EXTRA_SCOPES = [
  'ads_management',
  'ads_read',
] as const;

export const DEFAULT_FACEBOOK_SCOPES = [
  'public_profile',
  'ads_read',
  ...INSTAGRAM_REQUIRED_SCOPES,
];

export function normalizeScopes(scopes: string): string {
  const parts = scopes
    .split(/[,\s]+/g)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join(' ');
}

export function mergeScopes(...scopeSets: Array<readonly string[] | string>): string {
  const merged = scopeSets
    .flatMap((scopeSet) => typeof scopeSet === 'string' ? scopeSet.split(/[,\s]+/g) : scopeSet)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return Array.from(new Set(merged)).join(' ');
}
