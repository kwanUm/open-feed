import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { Conference } from 'src/types'

const TOPIC_MAP: Record<string, string> = {
  javascript: 'javascript', typescript: 'javascript', react: 'javascript',
  python: 'python', ruby: 'ruby', php: 'php', golang: 'golang',
  rust: 'rust', java: 'java', css: 'css', devops: 'devops',
  security: 'security', data: 'data', android: 'android', ios: 'ios',
  graphql: 'graphql', dotnet: 'dotnet', scala: 'scala', elixir: 'elixir',
  kotlin: 'kotlin', clojure: 'clojure', ux: 'ux',
}

const BASE = 'https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences'

const getConferences = async (tags: string[]): Promise<Conference[]> => {
  const year = new Date().getFullYear()
  const topic = tags.map((t) => TOPIC_MAP[t.toLowerCase()]).find(Boolean) || 'general'

  const urls = [`${BASE}/${year}/${topic}.json`]
  if (topic !== 'general') urls.push(`${BASE}/${year}/general.json`)

  const results = await Promise.allSettled(urls.map((u) => fetch(u).then((r) => r.ok ? r.json() : [])))

  const all: any[] = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
  const now = Date.now()

  return all
    .filter((c) => c?.name && c?.startDate && new Date(c.startDate).getTime() >= now)
    .map((c) => ({
      id: c.url || c.name,
      title: c.name,
      url: c.url || '',
      tags: c.topics || [],
      comments_count: 0,
      points_count: 0,
      image_url: '',
      published_at: new Date(c.startDate).getTime(),
      start_date: new Date(c.startDate).getTime(),
      end_date: c.endDate ? new Date(c.endDate).getTime() : new Date(c.startDate).getTime(),
      online: c.online || false,
      city: c.city,
      country: c.country,
    }))
    .sort((a, b) => a.start_date - b.start_date)
    .slice(0, 30)
}

type QueryFnType = typeof getConferences

type UseGetConferencesOptions = {
  config?: QueryConfig<QueryFnType>
  tags: string[]
}

export const useGetConferences = ({ config, tags }: UseGetConferencesOptions) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: ['conferences_v2', ...tags],
    queryFn: () => getConferences(tags),
  })
}
