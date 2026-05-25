import { useQuery } from '@tanstack/react-query'
import { Product } from 'src/types'

const getArticles = async (): Promise<Product[]> => []

export const useGeProductHuntProducts = ({ date, config }: { date: string; config?: any }) => {
  return useQuery<Product[]>({
    ...config,
    queryKey: ['producthunt_v2', date],
    queryFn: getArticles,
  })
}
