import { useCallback, useMemo, useState } from 'react'
import { BiCommentDetail } from 'react-icons/bi'
import { AiOutlineLike } from 'react-icons/ai'
import { MdOutlineVisibilityOff } from 'react-icons/md'
import { MenuItem } from '@szhsin/react-menu'
import { Card } from 'src/components/Elements'
import { ListComponent } from 'src/components/List/ListComponent'
import { useUserPreferences } from 'src/stores/preferences'
import { LinkedinArticle, CardPropsType } from 'src/types'
import { useShallow } from 'zustand/shallow'
import { useGetLinkedinFeed } from '../../api/getLinkedinFeed'
import { useLazyListLoad } from '../../hooks/useLazyListLoad'
import { MemoizedCardSettings } from '../CardSettings'
import ArticleItem from './ArticleItem'

const isPromotedItem = (item: LinkedinArticle) =>
  item.time_ago?.startsWith('Promoted') || item.author_title === 'Promoted'

export function LinkedinCard(props: CardPropsType) {
  const { meta } = props
  const { ref, isVisible } = useLazyListLoad()
  const { sortBy, hidePromoted, cardSettings, setCardSettings } = useUserPreferences(
    useShallow((state) => ({
      sortBy: state.cardsSettings?.[meta.value]?.sortBy,
      hidePromoted: state.cardsSettings?.[meta.value]?.hidePromoted,
      cardSettings: state.cardsSettings?.[meta.value],
      setCardSettings: state.setCardSettings,
    }))
  )
  const { data: rawData, isLoading, error } = useGetLinkedinFeed({
    config: {
      enabled: isVisible,
    },
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const data = useMemo(
    () => (hidePromoted ? rawData?.filter((item) => !isPromotedItem(item)) : rawData),
    [rawData, hidePromoted]
  )

  const errorMessage = (error as Error | null)?.message
  const isNotLoggedIn = errorMessage === 'NOT_LOGGED_IN'

  const renderItem = useCallback(
    (item: LinkedinArticle) => (
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
          customStartMenuItems={
            <MenuItem
              type="checkbox"
              checked={!!hidePromoted}
              className="menuItem"
              onClick={() => setCardSettings(meta.value, { ...cardSettings, sortBy: cardSettings?.sortBy || 'published_at', hidePromoted: !hidePromoted })}>
              <MdOutlineVisibilityOff /> Hide promoted
            </MenuItem>
          }
          sortOptions={(defaults) => [
            ...defaults,
            {
              label: 'Reactions',
              value: 'points_count',
              icon: <AiOutlineLike />,
            },
            {
              label: 'Comments',
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
            <a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer">
              log in to LinkedIn
            </a>{' '}
            to see your feed.
          </p>
        </div>
      ) : (
        <ListComponent<LinkedinArticle>
          sortBy={sortBy as keyof LinkedinArticle}
          items={data}
          error={isNotLoggedIn ? undefined : error}
          isLoading={isLoading}
          renderItem={renderItem}
        />
      )}
    </Card>
  )
}
