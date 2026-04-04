import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { XcomArticle } from 'src/types'

const getXcomFeed = async (): Promise<XcomArticle[]> => {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Extension API not available'))
      return
    }
    chrome.runtime.sendMessage({ type: 'FETCH_XCOM_FEED' }, (response) => {
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

type QueryFnType = typeof getXcomFeed

type UseGetXcomFeedOptions = {
  config?: QueryConfig<QueryFnType>
}

export const useGetXcomFeed = ({ config }: UseGetXcomFeedOptions = {}) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: ['xcom-feed'],
    queryFn: getXcomFeed,
  })
}
