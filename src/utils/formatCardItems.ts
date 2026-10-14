import { format as timeAgo } from 'timeago.js'

type AnyItem = Record<string, any>

export type EnrichedMedia = { url: string; kind: string }

export type EnrichedTweet = {
  id: string
  unavailable?: boolean
  error?: string
  text?: string
  thread?: Array<{ id: string; text: string; media: EnrichedMedia[] }>
  reply_to?: { author: string; screen_name: string; url: string; text: string; media: EnrichedMedia[] } | null
  quoted?: { author: string; screen_name: string; text: string; media: EnrichedMedia[] } | null
  article?: {
    title: string
    body: string
    partial?: boolean
    truncated_reason?: string
    summary?: string
    media?: EnrichedMedia[]
  } | null
  media?: EnrichedMedia[]
}

export type MediaRef = {
  token: string
  url: string
  kind: string
  file: string
}

export type FormattedExport = {
  text: string
  media: MediaRef[]
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isDate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const tidy = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const countLabel = (value: number, singular: string) =>
  `${value.toLocaleString()} ${singular}${value === 1 ? '' : 's'}`

const dayStamp = (value: number) => new Date(value).toISOString().slice(0, 10)

const STAT_FIELDS: Array<[string, string]> = [
  ['stars_count', 'star'],
  ['stars_in_range', 'star in period'],
  ['forks_count', 'fork'],
  ['points_count', 'point'],
  ['votes_count', 'vote'],
  ['comments_count', 'comment'],
  ['retweet_count', 'retweet'],
  ['shares_count', 'share'],
  ['views_count', 'view'],
  ['bookmark_count', 'bookmark'],
]

const isRepoLike = (item: AnyItem) =>
  isText(item.owner) && isText(item.name) && isCount(item.stars_count)

const extensionFor = (url: string): string => {
  const format = url.match(/[?&]format=([a-z0-9]+)/i)
  if (format) return format[1].toLowerCase()
  const path = url.split('?')[0]
  const dotted = path.match(/\.([a-z0-9]{2,4})$/i)
  return dotted ? dotted[1].toLowerCase() : 'jpg'
}

/**
 * Hands out stable [imgN] tokens and records which URL each one points at, so
 * the same picture referenced twice keeps one token and one file in the bundle.
 */
const createMediaCollector = (enabled: boolean) => {
  const refs: MediaRef[] = []
  const seen = new Map<string, string>()

  const add = (url: unknown, kind: string): string | null => {
    if (!enabled || !isText(url)) return null
    const existing = seen.get(url)
    if (existing) return existing
    const index = refs.length + 1
    const token = `[img${index}]`
    seen.set(url, token)
    refs.push({ token, url, kind, file: `images/img${index}.${extensionFor(url)}` })
    return token
  }

  const addAll = (media: EnrichedMedia[] | undefined, fallbackKind = 'image'): string =>
    (media || [])
      .map((m) => add(m?.url, m?.kind || fallbackKind))
      .filter(Boolean)
      .join(' ')

  return { refs, add, addAll }
}

type MediaCollector = ReturnType<typeof createMediaCollector>

const withMedia = (text: string, tokens: string) => {
  const body = tidy(text)
  if (!tokens) return body
  return body ? `${body} ${tokens}` : tokens
}

const buildMetaParts = (item: AnyItem): string[] => {
  const parts: string[] = []

  if (isText(item.screen_name)) parts.push(`@${item.screen_name}`)
  if (isText(item.author_title)) parts.push(item.author_title.trim())
  if (isText(item.technology)) parts.push(item.technology.trim())
  if (isText(item.tagline)) parts.push(item.tagline.trim())

  const seenStats = new Set<number>()
  STAT_FIELDS.forEach(([field, singular]) => {
    const value = item[field]
    if (!isCount(value) || seenStats.has(value)) return
    seenStats.add(value)
    parts.push(countLabel(value, singular))
  })

  if (isDate(item.start_date)) {
    const start = dayStamp(item.start_date)
    const end = isDate(item.end_date) ? dayStamp(item.end_date) : null
    parts.push(end && end !== start ? `${start} to ${end}` : start)
  } else if (isDate(item.published_at) && !isRepoLike(item)) {
    parts.push(timeAgo(new Date(item.published_at)))
  }

  const place = [item.city, item.country].filter(isText).join(', ')
  if (place) parts.push(place)
  if (item.online === true) parts.push('online')

  return parts
}

/** Blocks built from the deep X enrichment: thread, reply target, quote, article. */
const buildEnrichedBlocks = (
  enriched: EnrichedTweet,
  media: MediaCollector,
  fallbackText: string
): string[] => {
  const blocks: string[] = []

  if (enriched.reply_to && isText(enriched.reply_to.text)) {
    const who = isText(enriched.reply_to.screen_name)
      ? `@${enriched.reply_to.screen_name}`
      : enriched.reply_to.author || 'another account'
    const link = isText(enriched.reply_to.url) ? ` (${enriched.reply_to.url})` : ''
    blocks.push(
      `REPLYING TO ${who}${link}:\n${withMedia(
        enriched.reply_to.text,
        media.addAll(enriched.reply_to.media)
      )}`
    )
  }

  const thread = enriched.thread || []
  if (thread.length > 1) {
    thread.forEach((tweet, index) => {
      blocks.push(
        `THREAD ${index + 1}/${thread.length}:\n${withMedia(
          tweet.text || '',
          media.addAll(tweet.media)
        )}`
      )
    })
  } else {
    const only = thread[0]
    const text = isText(only?.text) ? only.text : enriched.text || fallbackText
    const tokens = media.addAll(only?.media?.length ? only.media : enriched.media)
    const body = withMedia(text || '', tokens)
    if (body) blocks.push(body)
  }

  if (enriched.quoted && isText(enriched.quoted.text)) {
    const who = isText(enriched.quoted.screen_name)
      ? `@${enriched.quoted.screen_name}`
      : enriched.quoted.author || 'another post'
    blocks.push(
      `QUOTING ${who}:\n${withMedia(enriched.quoted.text, media.addAll(enriched.quoted.media))}`
    )
  }

  const article = enriched.article
  if (article && (isText(article.title) || isText(article.body))) {
    const heading = isText(article.title) ? `ARTICLE: ${article.title}` : 'ARTICLE:'
    const parts = [heading]

    // Each article image gets its token in document order, so the markers the
    // parser left behind can be swapped for the exact spot the image appeared.
    const articleTokens = (article.media || []).map(
      (m) => media.add(m?.url, m?.kind || 'article image') || ''
    )
    let body = isText(article.body) ? tidy(article.body) : ''
    const MARKER = /\{\{ARTICLE_IMAGE_(\d+)\}\}/g
    const hasMarkers = MARKER.test(body)
    MARKER.lastIndex = 0

    if (hasMarkers) {
      body = body.replace(MARKER, (_, index) => articleTokens[Number(index) - 1] || '')
      if (body) parts.push(body)
    } else {
      const trailing = articleTokens.filter(Boolean).join(' ')
      if (body) parts.push(withMedia(body, trailing))
      else if (trailing) parts.push(trailing)
    }

    if (article.partial) {
      // Never let a 200-character stub pass as the whole article.
      parts.push(
        `NOTE: this is only X's short preview, NOT the full article body (${
          article.truncated_reason || 'full body could not be fetched'
        }). Do not treat it as the complete article.`
      )
    }

    blocks.push(parts.join('\n'))
  }

  return blocks
}

/** Blocks for everything that is not a deep-enriched X post. */
const buildPlainBlocks = (item: AnyItem, media: MediaCollector): string[] => {
  const blocks: string[] = []
  const inlineTokens = media.addAll(
    (Array.isArray(item.media_urls) ? item.media_urls : [])
      .filter(isText)
      .map((url: string) => ({ url, kind: 'image' }))
  )

  if (isText(item.description)) {
    blocks.push(withMedia(item.description, inlineTokens))
  } else if (inlineTokens) {
    blocks.push(inlineTokens)
  }

  if (Array.isArray(item.thread_tweets) && item.thread_tweets.length) {
    const thread = item.thread_tweets
      .map((tweet: AnyItem) =>
        isText(tweet?.text)
          ? withMedia(
              tweet.text,
              media.addAll(
                (tweet.media_urls || []).filter(isText).map((url: string) => ({ url, kind: 'image' }))
              )
            )
          : ''
      )
      .filter(Boolean)
    if (thread.length) blocks.push(`Thread:\n${thread.join('\n\n')}`)
  }

  const quoted = item.quoted_tweet
  if (quoted && isText(quoted.text)) {
    const who = isText(quoted.screen_name) ? `@${quoted.screen_name}` : quoted.author
    blocks.push(
      `Quoting ${isText(who) ? who : 'another post'}:\n${withMedia(
        quoted.text,
        media.addAll(
          (quoted.media_urls || []).filter(isText).map((url: string) => ({ url, kind: 'image' }))
        )
      )}`
    )
  }

  const shared = item.shared_post
  if (shared && isText(shared.text)) {
    const who = [shared.author, shared.author_title].filter(isText).join(' - ')
    blocks.push(
      `Reposting ${who || 'another post'}:\n${withMedia(
        shared.text,
        media.addAll(
          (shared.media_urls || []).filter(isText).map((url: string) => ({ url, kind: 'image' }))
        )
      )}`
    )
  }

  const preview = item.link_preview
  if (preview && isText(preview.title)) {
    const line = isText(preview.url) ? `${preview.title} (${preview.url})` : preview.title
    blocks.push(`Linked: ${line}`)
  }

  return blocks
}

const formatItem = (
  item: AnyItem,
  index: number,
  media: MediaCollector,
  enrichment: Record<string, EnrichedTweet>
): string => {
  const owner = isText(item.owner) && isText(item.name) ? `${item.owner}/${item.name}` : null
  const heading = owner || (isText(item.title) ? tidy(item.title) : 'Untitled')
  const lines = [`## ${index + 1}. ${heading}`]

  if (isText(item.url)) lines.push(`URL: ${item.url}`)

  const meta = buildMetaParts(item)
  if (meta.length) lines.push(`Meta: ${meta.join(' - ')}`)

  const tags = Array.isArray(item.tags) ? item.tags.filter(isText) : []
  const topics = Array.isArray(item.topics) ? item.topics.filter(isText) : []
  const allTags = Array.from(new Set([...tags, ...topics]))
  if (allTags.length) lines.push(`Tags: ${allTags.join(', ')}`)

  const enriched = isText(item.id) ? enrichment[item.id] : undefined
  const usable = enriched && !enriched.unavailable
  const body = usable
    ? buildEnrichedBlocks(enriched as EnrichedTweet, media, item.description || '')
    : buildPlainBlocks(item, media)

  if (enriched?.unavailable) {
    lines.push('Note: deeper X context could not be fetched for this post.')
  }

  const header = lines.join('\n')
  return body.length ? `${header}\n\n${body.join('\n\n')}` : header
}

export type FormatCardItemsArgs = {
  label: string
  sourceUrl?: string
  items: unknown[]
  /** Deep X context keyed by tweet id. */
  enrichment?: Record<string, EnrichedTweet>
  /** When true, media gets [imgN] tokens and is listed for bundling. */
  includeMedia?: boolean
}

/**
 * Renders a card's visible items as markdown ready to hand to an AI, together
 * with the media those items reference.
 */
export const formatCardItems = ({
  label,
  sourceUrl,
  items,
  enrichment = {},
  includeMedia = false,
}: FormatCardItemsArgs): FormattedExport | null => {
  if (!Array.isArray(items) || items.length === 0) return null

  const media = createMediaCollector(includeMedia)
  const body = items
    .map((item, index) => formatItem(item as AnyItem, index, media, enrichment))
    .join('\n\n')

  const header = [
    `# ${label} (${countLabel(items.length, 'item')})`,
    sourceUrl ? `Source: ${sourceUrl}` : null,
    `Copied: ${new Date().toISOString()}`,
    media.refs.length
      ? `Images: ${media.refs.length} attached in images/, referenced inline as [img1], [img2], ...`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  return { text: `${header}\n\n${body}\n`, media: media.refs }
}
