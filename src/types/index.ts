export type SearchEngineType = {
  url: string
  label: string
  logo?: string
  className?: string
  default?: boolean
}

export type SelectedCard = {
  id: number
  name: string
  type: 'rss' | 'supported'
}

export type SelectedTag = {
  label: string
  value: string
}

export type SearchEngine = {
  url: string
  label: string
  logo: React.FunctionComponent<React.SVGProps<SVGSVGElement>>
  className?: string
}

export type Layout = 'grid' | 'cards'
export type Theme = 'dark' | 'light'
export type ListingMode = 'normal' | 'compact'

export type BaseEntry = {
  id: string
  url: string
  title: string
  tags: Array<string>
  comments_count: number
  points_count: number
  image_url: string
  published_at: number
  description?: string
}

export type Article = BaseEntry & {
  source: string
  canonical_url?: string
}

export type LinkPreview = {
  title: string
  subtitle: string
  image_url: string
  url: string
}

export type LinkedinArticle = Article & {
  author_title: string
  time_ago: string
  shares_count: number
  media_urls: string[]
  link_preview: LinkPreview | null
  shared_post: SharedPost | null
}

export type QuotedTweet = {
  author: string
  screen_name: string
  text: string
  image_url: string
  media_urls: string[]
}

export type ThreadTweet = {
  text: string
  media_urls: string[]
}

export type SharedPost = {
  author: string
  author_title: string
  text: string
  avatar_url: string
  media_urls: string[]
}

export type XcomArticle = Article & {
  screen_name: string
  retweet_count: number
  views_count: number
  is_blue_verified: boolean
  bookmark_count: number
  media_urls: string[]
  quoted_tweet: QuotedTweet | null
  thread_tweets: ThreadTweet[]
}

export type Product = BaseEntry & {
  tagline: string
  votes_count: number
  topics: Array<string>
}
export type FeedItem = {
  title: string
  id: string
  url: string
  date: Date
  image: string
  tags: Array<string>
}

export type ArticleFeedItemData = FeedItem & {
  type: 'post'
  source: string
}

export type ProductHuntFeedItemData = FeedItem & {
  type: 'producthunt'
  tagline: string
  votes_count: number
  comments: number
}

export type GithubFeedItemData = FeedItem & {
  type: 'github'
  stars: number
  stars_in_range: number
  forks: number
  programmingLanguage: string
  description?: string
}

export type AdFeedItemData = {
  id: string
  type: 'ad'
}

export type FeedItemData =
  | ArticleFeedItemData
  | GithubFeedItemData
  | ProductHuntFeedItemData
  | AdFeedItemData

export type Repository = BaseEntry & {
  technology: string
  stars_count: number
  source: string
  description: string
  owner: string
  forks_count: number
  stars_in_range: number
  name: string
}

export type Conference = BaseEntry & {
  start_date: number
  end_date: number
  tags: string[]
  online: Boolean
  city?: string
  country?: string
}

export type SupportedCardType = {
  value: string
  analyticsTag: string
  label: string
  link?: string
  type: 'rss' | 'supported'
  component?: React.FunctionComponent<CardPropsType>
  feedUrl?: string
  icon?: React.ReactNode | string
  badge?: string
}

export type CardPropsType = {
  meta: Omit<SupportedCardType, 'component'>
  knob?: React.ReactNode
  className?: string
}

export type BaseItemPropsType<
  T extends {
    id: string
  }
> = {
  item: T
  className?: string
  analyticsTag: string
  dateRange?: string
  selectedTag?: SelectedTag
}

export type CardSettingsType = {
  language?: string
  sortBy: string
  dateRange?: string
}

export type Option = {
  label: string
  value: string
  icon?: React.ReactNode
  removeable?: boolean
}

export type DNDDuration =
  | {
      value: number
      countdown: number
    }
  | 'always'
  | 'never'
