import { useQuery } from '@tanstack/react-query'
import { ExtractFnReturnType, QueryConfig } from 'src/lib/react-query'
import { changeLogLink } from 'src/config'
import { Version } from '../types'

const getVersions = async (): Promise<Version[]> => {
  const res = await fetch(changeLogLink, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Changelog fetch error: ${res.status}`)
  return res.json()
}

type QueryFnType = typeof getVersions

type UseGetAdOptions = {
  config?: QueryConfig<QueryFnType>
}

export const useGetVersions = ({ config }: UseGetAdOptions = {}) => {
  return useQuery<ExtractFnReturnType<QueryFnType>>({
    ...config,
    queryKey: ['versions'],
    queryFn: getVersions,
  })
}
