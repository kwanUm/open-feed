import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { Repository } from 'src/types'

type GhSearchItem = {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  pushed_at: string
  owner: { login: string; avatar_url: string }
}

const dateRangeToSince = (range: 'daily' | 'weekly' | 'monthly'): string => {
  const d = new Date()
  if (range === 'daily') d.setDate(d.getDate() - 1)
  else if (range === 'weekly') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const getRepos = async ({
  tags,
  dateRange,
}: {
  tags: string[]
  dateRange: 'daily' | 'weekly' | 'monthly'
}): Promise<Repository[]> => {
  const since = dateRangeToSince(dateRange)
  const langClause = tags
    .filter((t) => t && t !== 'global')
    .slice(0, 1)
    .map((t) => `language:${t}`)
    .join(' ')
  const q = `stars:>10 pushed:>${since}${langClause ? ' ' + langClause : ''}`
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q
  )}&sort=stars&order=desc&per_page=25`

  const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
  const data: { items: GhSearchItem[] } = await resp.json()

  return (data.items || []).map((it) => ({
    id: String(it.id),
    name: it.name,
    title: it.full_name,
    url: it.html_url,
    description: it.description || '',
    image_url: it.owner.avatar_url,
    published_at: new Date(it.pushed_at).getTime(),
    tags: [],
    comments_count: 0,
    points_count: it.stargazers_count,
    source: 'github',
    technology: it.language || '',
    stars_count: it.stargazers_count,
    forks_count: it.forks_count,
    stars_in_range: it.stargazers_count,
    owner: it.owner.login,
  }))
}

type QueryFnType = typeof getRepos

type UseGetReposOptions = {
  config?: QueryConfig<QueryFnType>
  tags: string[]
  dateRange: 'daily' | 'monthly' | 'weekly'
}

export const useGetGithubRepos = ({ config, tags, dateRange }: UseGetReposOptions) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: ['github_v2', ...tags, dateRange],
    queryFn: () => getRepos({ tags, dateRange }),
  })
}
