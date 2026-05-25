import * as htmlparser2 from 'htmlparser2'
import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { Article } from 'src/types'

// --- HackerNews (Firebase public API) ---

type HNItem = {
  id: number; by?: string; time?: number; title?: string
  url?: string; score?: number; descendants?: number
}

const fetchHackernews = async (): Promise<Article[]> => {
  const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
  const ids: number[] = await idsRes.json()
  const items = await Promise.all(
    ids.slice(0, 30).map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json() as Promise<HNItem>)
    )
  )
  return items.filter((it) => it?.title).map((it) => ({
    id: String(it.id),
    title: it.title || '',
    url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
    source: 'hackernews', tags: [],
    comments_count: it.descendants || 0,
    points_count: it.score || 0,
    image_url: '',
    published_at: (it.time || 0) * 1000,
  }))
}

// --- Dev.to (public REST API) ---

const fetchDevto = async (tags: string[]): Promise<Article[]> => {
  const tag = tags.find((t) => t && t !== 'global') || 'webdev'
  const res = await fetch(`https://dev.to/api/articles?per_page=25&tag=${encodeURIComponent(tag)}&top=7`)
  if (!res.ok) throw new Error(`Dev.to API error: ${res.status}`)
  const data = await res.json()
  return data.map((it: any) => ({
    id: String(it.id),
    title: it.title,
    url: it.url,
    source: 'devto',
    tags: it.tag_list || [],
    comments_count: it.comments_count || 0,
    points_count: it.positive_reactions_count || 0,
    image_url: it.cover_image || it.social_image || '',
    published_at: new Date(it.published_at).getTime(),
  }))
}

// --- Reddit (public JSON API) ---

const fetchReddit = async (tags: string[]): Promise<Article[]> => {
  const sub = tags.find((t) => t && t !== 'global') || 'programming'
  const res = await fetch(
    `https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=25`,
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`Reddit API error: ${res.status}`)
  const json = await res.json()
  return (json.data?.children || []).map((child: any) => {
    const d = child.data
    return {
      id: d.id,
      title: d.title,
      url: d.url?.startsWith('https://www.reddit.com') ? d.url : (d.url || `https://www.reddit.com${d.permalink}`),
      source: 'reddit',
      tags: [],
      comments_count: d.num_comments || 0,
      points_count: d.score || 0,
      image_url: d.thumbnail?.startsWith('http') ? d.thumbnail : '',
      published_at: d.created_utc * 1000,
    }
  })
}

// --- Lobsters (public JSON API) ---

const fetchLobsters = async (tags: string[]): Promise<Article[]> => {
  const tag = tags.find((t) => t && t !== 'global')
  const url = tag ? `https://lobste.rs/t/${encodeURIComponent(tag)}.json` : 'https://lobste.rs/hottest.json'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Lobsters API error: ${res.status}`)
  const data = await res.json()
  return data.slice(0, 25).map((it: any) => ({
    id: it.short_id,
    title: it.title,
    url: it.url || it.short_id_url,
    source: 'lobsters',
    tags: it.tags || [],
    comments_count: it.comment_count || 0,
    points_count: it.score || 0,
    image_url: '',
    published_at: new Date(it.created_at).getTime(),
  }))
}

// --- RSS via background.js (for CORS-restricted sources) ---

const fetchRssViaBackground = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      reject(new Error('Extension API not available'))
      return
    }
    chrome.runtime.sendMessage({ type: 'FETCH_RSS_FEED', url }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      if (response?.error) return reject(new Error(response.error))
      resolve(response.text)
    })
  })

const parseRssToArticles = (xml: string, source: string): Article[] => {
  const feed = htmlparser2.parseFeed(xml)
  return (feed?.items || []).map((item) => ({
    id: item.id || item.link || String(Math.random()),
    title: item.title || '',
    url: item.link || '',
    source,
    tags: [],
    comments_count: 0,
    points_count: 0,
    image_url: '',
    published_at: item.pubDate ? +item.pubDate : Date.now(),
  }))
}

const fetchMedium = async (tags: string[]): Promise<Article[]> => {
  const tag = tags.find((t) => t && t !== 'global') || 'programming'
  const xml = await fetchRssViaBackground(`https://medium.com/feed/tag/${encodeURIComponent(tag)}`)
  return parseRssToArticles(xml, 'medium')
}

const fetchHackernoon = async (tags: string[]): Promise<Article[]> => {
  const tag = tags.find((t) => t && t !== 'global')
  const url = tag ? `https://hackernoon.com/tagged/${encodeURIComponent(tag)}/feed` : 'https://hackernoon.com/feed'
  const xml = await fetchRssViaBackground(url)
  return parseRssToArticles(xml, 'hackernoon')
}

const fetchFreecodecamp = async (): Promise<Article[]> => {
  const xml = await fetchRssViaBackground('https://www.freecodecamp.org/news/rss/')
  return parseRssToArticles(xml, 'freecodecamp')
}

// --- Dispatcher ---

const getArticles = async ({ source, tags }: { source: string; tags?: string[] }): Promise<Article[]> => {
  const t = tags || []
  switch (source) {
    case 'hackernews':   return fetchHackernews()
    case 'devto':        return fetchDevto(t)
    case 'reddit':       return fetchReddit(t)
    case 'lobsters':     return fetchLobsters(t)
    case 'medium':       return fetchMedium(t)
    case 'hackernoon':   return fetchHackernoon(t)
    case 'freecodecamp': return fetchFreecodecamp()
    default:             return []
  }
}

type QueryFnType = typeof getArticles

type UseGetArticlesOptions = {
  config?: QueryConfig<QueryFnType>
  source: string
  tags?: string[]
}

export const useGetSourceArticles = ({ config, source, tags }: UseGetArticlesOptions) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: [source, ...(tags || [])],
    queryFn: () => getArticles({ source, tags }),
  })
}
