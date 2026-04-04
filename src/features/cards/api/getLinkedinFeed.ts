import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { LinkedinArticle } from 'src/types'

const getLinkedinFeed = async (): Promise<LinkedinArticle[]> => {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Extension API not available'))
      return
    }
    chrome.runtime.sendMessage({ type: 'FETCH_LINKEDIN_FEED' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.error) {
        reject(new Error(response.error))
        return
      }
      resolve(response || [])
    })
  })
}

type QueryFnType = typeof getLinkedinFeed

type UseGetLinkedinFeedOptions = {
  config?: QueryConfig<QueryFnType>
}

export const useGetLinkedinFeed = ({ config }: UseGetLinkedinFeedOptions = {}) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: ['linkedin-feed'],
    queryFn: getLinkedinFeed,
  })
}
