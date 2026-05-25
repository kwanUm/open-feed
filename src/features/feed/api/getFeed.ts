import { useInfiniteQuery } from '@tanstack/react-query'
import { InfiniteQueryConfig } from 'src/lib/react-query'
import { FeedItemData } from 'src/types'

type Response = {
  data: FeedItemData[]
  metadata: { next: string | null; hasNextPage: boolean }
}

const getFeed = async (): Promise<Response> => ({ data: [], metadata: { next: null, hasNextPage: false } })

type UseGetArticlesOptions = {
  tags: string[]
  config?: InfiniteQueryConfig<typeof getFeed>
}

export const useGetFeed = ({ tags, config }: UseGetArticlesOptions) => {
  return useInfiniteQuery<Response>({
    ...config,
    queryKey: ['feed', 'v2', tags.join(',')],
    queryFn: getFeed,
    getNextPageParam: () => undefined,
  })
}
