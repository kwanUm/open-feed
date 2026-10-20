import React, { memo, ReactNode, useEffect, useMemo } from 'react'
import { useCardItems } from 'src/components/Elements/Card/CardItemsContext'
import { Placeholder } from 'src/components/placeholders'
import { MAX_ITEMS_PER_CARD } from 'src/config'
import { useUserPreferences } from 'src/stores/preferences'
import { useReadPosts } from 'src/stores/readPosts'

type PlaceholdersProps = {
  placeholder: ReactNode
}

const Placeholders = memo<PlaceholdersProps>(({ placeholder }) => {
  return (
    <>
      {[...Array(7)].map((_, i) => (
        <span key={i}>{placeholder}</span>
      ))}
    </>
  )
})

export type ListComponentPropsType<T extends unknown> = {
  items?: T[]
  sortBy?: keyof T
  sortFn?: (a: T, b: T) => number
  isLoading: boolean
  renderItem: (item: T, index: number) => React.ReactNode
  placeholder?: React.ReactNode
  header?: React.ReactNode
  refresh?: boolean
  error?: any
  limit?: number
}

export function ListComponent<T extends any>(props: ListComponentPropsType<T>) {
  const {
    items,
    sortBy,
    isLoading,
    error,
    sortFn,
    renderItem,
    header,
    placeholder = <Placeholder />,
    limit = MAX_ITEMS_PER_CARD,
  } = props

  const { showReadPosts } = useUserPreferences()
  const readPostIdSet = useReadPosts((state) => state.readPostIdSet)

  const filteredItems = useMemo(() => {
    if (!items || items.length === 0) {
      return []
    }

    if (showReadPosts) {
      return items
    }

    return items.filter((item: any) => !readPostIdSet.has(item.id))
  }, [items, readPostIdSet, showReadPosts])

  const sortedData = useMemo(() => {
    if (!filteredItems || filteredItems.length == 0) return []

    if ((sortBy as string) === 'top_today') {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      return [...filteredItems]
        .filter((item: any) => typeof item.published_at === 'number' && item.published_at >= oneDayAgo)
        .sort((a: any, b: any) => (b.points_count ?? 0) - (a.points_count ?? 0))
    }

    if (!sortBy) return filteredItems

    const result = sortFn
      ? [...filteredItems].sort(sortFn)
      : [...filteredItems].sort((a, b) => {
          const aVal = a[sortBy]
          const bVal = b[sortBy]
          if (typeof aVal === 'number' && typeof bVal === 'number') return bVal - aVal
          if (typeof aVal === 'string' && typeof bVal === 'string') return bVal.localeCompare(aVal)
          return 0
        })

    return result
  }, [sortBy, sortFn, filteredItems])

  // Exactly what ends up on screen: filtered, sorted, then capped.
  const visibleItems = useMemo(() => sortedData.slice(0, limit), [sortedData, limit])

  // Publish the rendered items so the card header's "copy all" button can read
  // them without every card having to thread its data through by hand.
  const cardItems = useCardItems()
  const registerItems = cardItems?.registerItems
  useEffect(() => {
    registerItems?.(visibleItems)
  }, [registerItems, visibleItems])

  const enrichedItems = useMemo(() => {
    if (visibleItems.length === 0) {
      return []
    }

    try {
      return visibleItems.map((item, index) => {
        let content: ReactNode[] = [renderItem(item, index)]
        if (header && index === 0) {
          content.unshift(header)
        }

        return content
      })
    } catch (e) {
      return []
    }
  }, [visibleItems, header, renderItem])

  if (isLoading) {
    return <Placeholders placeholder={placeholder} />
  }
  if (error) {
    return <p className="errorMsg">{error?.message || error}</p>
  }

  if (items && items.length == 0) {
    return (
      <p className="errorMsg">
        No items found, try adjusting your filter or choosing a different tag.
      </p>
    )
  }

  if (items && items.length > 0 && filteredItems.length === 0) {
    return (
      <div className="errorMsg">
        <span>✨</span>
        <b>You're all caught up!</b>
        <p>Check back later for fresh content.</p>
      </div>
    )
  }

  if (items && items.length > 0 && sortedData.length === 0) {
    return <p className="errorMsg">No posts from the last 24 hours.</p>
  }

  return <>{enrichedItems}</>
}
