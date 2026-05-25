// Keys
export const ANALYTICS_ENDPOINT = import.meta.env.VITE_AMPLITUDE_URL as string
export const ANALYTICS_SDK_KEY = import.meta.env.VITE_AMPLITUDE_KEY as string
export const API_ENDPOINT = import.meta.env.VITE_API_URL as string
export const LS_ANALYTICS_ID_KEY = 'openFeedAnalyticsId'
export const BUILD_TARGET = (import.meta.env.VITE_BUILD_TARGET as 'web' | 'extension') || 'web'
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN

// Meta
export const name = 'OpenFeed'
export const slogan = '— Your personal feed, served from your own browser'
export const repository = 'https://github.com/kwanUm/openfeed'
export const ref = 'ref=openfeed'
export const contactEmail = ''
export const maxCardsPerRow = 4
export const supportLink = 'https://github.com/kwanUm/openfeed/issues'
export const privacyPolicyLink = 'https://github.com/kwanUm/openfeed#privacy'
export const termsAndConditionsLink = 'https://github.com/kwanUm/openfeed#terms'
export const dataSourcesLink = 'https://github.com/kwanUm/openfeed#sources'
export const changeLogLink = 'https://api.github.com/repos/kwanUm/openfeed/releases'
export const twitterHandle = ''
export const reportLink = 'https://github.com/kwanUm/openfeed/issues/new'

export const LS_PREFERENCES_KEY = 'openFeedPrefs'
export const MAX_ITEMS_PER_CARD = 50

export type DateRangeType = {
  value: 'daily' | 'monthly' | 'weekly'
  label: string
}
export const dateRanges: DateRangeType[] = [
  { label: 'Today', value: 'daily' },
  { label: 'This week', value: 'weekly' },
  { label: 'This month', value: 'monthly' },
]
