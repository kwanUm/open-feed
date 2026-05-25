import * as htmlparser2 from 'htmlparser2'
import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { Article } from 'src/types'

type RssInfoType = {
  title: string
  link: string
  icon?: string
}

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

export const getRssUrlFeed = async (rssUrl: string): Promise<RssInfoType> => {
  const xml = await fetchRssViaBackground(rssUrl)
  const feed = htmlparser2.parseFeed(xml)
  return {
    title: feed?.title || rssUrl,
    link: feed?.link || rssUrl,
    icon: undefined,
  }
}

const getArticles = async (feedUrl: string): Promise<Article[]> => {
  const xml = await fetchRssViaBackground(feedUrl)
  try {
    const feed = htmlparser2.parseFeed(xml)
    return (feed?.items || []).map((item) => ({
      id: item.id || item.link || String(Math.random()),
      title: item.title || '',
      url: item.link || '',
      published_at: item.pubDate ? +item.pubDate : Date.now(),
      source: 'customFeed',
      tags: [],
      comments_count: 0,
      points_count: 0,
      image_url: '',
    }))
  } catch {
    return []
  }
}

type QueryFnType = typeof getArticles

type UseGetArticlesOptions = {
  config?: QueryConfig<QueryFnType>
  feedUrl: string
}

export const useRssFeed = ({ feedUrl, config }: UseGetArticlesOptions) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: [feedUrl],
    queryFn: () => getArticles(feedUrl),
  })
}
