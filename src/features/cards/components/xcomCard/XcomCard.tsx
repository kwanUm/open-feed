import { useCallback, useState } from 'react'
import { BiCommentDetail } from 'react-icons/bi'
import { AiOutlineHeart, AiOutlineRetweet } from 'react-icons/ai'
import { Card } from 'src/components/Elements'
import { ListComponent } from 'src/components/List/ListComponent'
import { useUserPreferences } from 'src/stores/preferences'
import { XcomArticle, CardPropsType } from 'src/types'
import { useShallow } from 'zustand/shallow'
import { useGetXcomFeed } from '../../api/getXcomFeed'
import { useLazyListLoad } from '../../hooks/useLazyListLoad'
import { MemoizedCardSettings } from '../CardSettings'
import ArticleItem from './ArticleItem'

export function XcomCard(props: CardPropsType) {
  const { meta } = props
  const { ref, isVisible } = useLazyListLoad()
  const sortBy = useUserPreferences(
    useShallow((state) => state.cardsSettings?.[meta.value]?.sortBy)
  )
  const { data, isLoading, error } = useGetXcomFeed({
    config: {
      enabled: isVisible,
    },
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const errorMessage = (error as Error | null)?.message
  const isNotLoggedIn = errorMessage === 'NOT_LOGGED_IN'

  const renderItem = useCallback(
    (item: XcomArticle) => (
      <ArticleItem
        item={item}
        key={item.id}
        analyticsTag={meta.analyticsTag}
        expandedId={expandedId}
        onToggleExpand={setExpandedId}
      />
    ),
    [meta.analyticsTag, expandedId]
  )

  return (
    <Card
      ref={ref}
      {...props}
      settingsComponent={
        <MemoizedCardSettings
          url={meta.link}
          id={meta.value}
          showLanguageFilter={false}
          sortBy={sortBy}
          sortOptions={(defaults) => [
            ...defaults,
            {
              label: 'Likes',
              value: 'points_count',
              icon: <AiOutlineHeart />,
            },
            {
              label: 'Retweets',
              value: 'retweet_count',
              icon: <AiOutlineRetweet />,
            },
            {
              label: 'Replies',
              value: 'comments_count',
              icon: <BiCommentDetail />,
            },
          ]}
        />
      }>
      {isNotLoggedIn ? (
        <div className="errorMsg">
          <p>
            Please{' '}
            <a href="https://x.com/login" target="_blank" rel="noreferrer">
              log in to X.com
            </a>{' '}
            to see your feed.
          </p>
        </div>
      ) : (
        <ListComponent<XcomArticle>
          sortBy={sortBy as keyof XcomArticle}
          items={data}
          error={isNotLoggedIn ? undefined : error}
          isLoading={isLoading}
          renderItem={renderItem}
        />
      )}
    </Card>
  )
}
