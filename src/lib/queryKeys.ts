export const qk = {
  profile: (uid?: string) => ['profile', uid] as const,
  accounts: ['accounts'] as const,
  balances: ['account-balances'] as const,
  categories: ['categories'] as const,
  activity: ['activity'] as const,
  activityList: (filters: unknown) => ['activity', filters] as const,
  summary: (filters: unknown) => ['activity-summary', filters] as const,
  dashboardAll: ['dashboard'] as const,
  dashboard: (month: string, filters: unknown) => ['dashboard', month, filters] as const,
  recent: ['recent-txns'] as const,
  suggestions: (prefix: string) => ['title-suggestions', prefix] as const,
}
