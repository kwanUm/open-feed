import { useState } from 'react'
import { AiOutlineHeart, AiOutlineRetweet, AiOutlineEye } from 'react-icons/ai'
import { BiCommentDetail, BiCopy } from 'react-icons/bi'
import { SiAnthropic } from 'react-icons/si'
import { MdAccessTime, MdVerified } from 'react-icons/md'
import { CardItemWithActions, CardLink } from 'src/components/Elements'
import { Attributes } from 'src/lib/analytics'
import { useUserPreferences } from 'src/stores/preferences'
import { XcomArticle, BaseItemPropsType } from 'src/types'
import { format } from 'timeago.js'

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

type Props = BaseItemPropsType<XcomArticle> & {
  expandedId: string | null
  onToggleExpand: (id: string | null) => void
}

const ArticleItem = (props: Props) => {
  const { item, analyticsTag, expandedId, onToggleExpand } = props
  const { listingMode } = useUserPreferences()
  const expanded = expandedId === item.id
  const [copied, setCopied] = useState(false)

  const buildPostText = () => {
    const parts = [`${item.title} (@${item.screen_name})`]
    if (item.thread_tweets?.length > 0) {
      for (const t of item.thread_tweets) {
        parts.push(t.text)
      }
    }
    if (item.description) parts.push(item.description)
    if (item.quoted_tweet) {
      parts.push(`> ${item.quoted_tweet.author} (@${item.quoted_tweet.screen_name}):\n> ${item.quoted_tweet.text}`)
    }
    parts.push(item.url)
    return parts.join('\n\n')
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(buildPostText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSumWithClaude = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = buildPostText() + '\n\n------\n\nSum this'
    chrome.storage.local.set({ claude_pending_message: text }, () => {
      window.open('https://claude.ai/new', '_blank')
    })
  }

  return (
    <CardItemWithActions
      source={analyticsTag}
      item={item}
      cardItem={
        <>
          <p className="rowTitle">
            <CardLink
              link={item.url}
              analyticsAttributes={{
                [Attributes.POINTS]: item.points_count,
                [Attributes.TRIGERED_FROM]: 'card',
                [Attributes.TITLE]: item.title,
                [Attributes.LINK]: item.url,
                [Attributes.SOURCE]: analyticsTag,
              }}>
              {listingMode === 'compact' && (
                <span className="counterWrapper">
                  <AiOutlineHeart />
                  <span className="value">{formatCount(item.points_count)}</span>
                </span>
              )}
              <span className="subTitle">
                <strong>{item.title}</strong>
                {item.is_blue_verified && (
                  <MdVerified
                    style={{
                      color: '#1D9BF0',
                      marginLeft: 4,
                      verticalAlign: 'middle',
                      fontSize: '0.9em',
                    }}
                  />
                )}
                <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                  @{item.screen_name}
                </span>
              </span>
            </CardLink>
          </p>
          {listingMode === 'normal' && (
            <>
              {expanded ? (
                <div className="rowDescriptionExpanded" style={{ userSelect: 'text' }}>
                  <div className="rowDescriptionActions">
                    <span className="rowDescriptionToggle" onClick={handleCopy}>
                      <BiCopy style={{ verticalAlign: 'middle', marginRight: 2 }} />
                      {copied ? 'copied' : 'copy'}
                    </span>
                    <span className="rowDescriptionToggle" onClick={handleSumWithClaude}>
                      <SiAnthropic style={{ verticalAlign: 'middle', marginRight: 2 }} />
                      sum
                    </span>
                    <span
                      className="rowDescriptionToggle"
                      onClick={(e) => { e.stopPropagation(); onToggleExpand(null) }}>
                      show less
                    </span>
                  </div>
                  {item.thread_tweets?.length > 0 && (
                    <div className="rowThread">
                      {item.thread_tweets.map((t, i) => (
                        <div key={i} className="rowThreadTweet" dir="auto">
                          <div className="rowThreadTweetText">{t.text}</div>
                          {t.media_urls?.length > 0 && (
                            <div className="rowMediaGallery">
                              {t.media_urls.map((url, j) => (
                                <img key={j} src={url} className="rowMediaImage" alt="" />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div dir="auto">{item.description}</div>
                  {item.media_urls?.length > 0 && (
                    <div className="rowMediaGallery">
                      {item.media_urls.map((url, i) => (
                        <img key={i} src={url} className="rowMediaImage" alt="" />
                      ))}
                    </div>
                  )}
                  {item.quoted_tweet && (
                    <div className="rowQuotedTweet" dir="auto">
                      <div className="rowQuotedTweetHeader">
                        {item.quoted_tweet.image_url && (
                          <img src={item.quoted_tweet.image_url} className="rowQuotedTweetAvatar" alt="" />
                        )}
                        <strong>{item.quoted_tweet.author}</strong>
                        <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                          @{item.quoted_tweet.screen_name}
                        </span>
                      </div>
                      <p className="rowQuotedTweetText">{item.quoted_tweet.text}</p>
                      {item.quoted_tweet.media_urls?.length > 0 && (
                        <div className="rowMediaGallery">
                          {item.quoted_tweet.media_urls.map((url, i) => (
                            <img key={i} src={url} className="rowMediaImage" alt="" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p
                  className="rowDescription"
                  dir="auto"
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(item.id) }}
                  style={{ cursor: 'pointer' }}>
                  {item.thread_tweets?.length > 0 && (
                    <span className="rowThreadBadge">Thread ({item.thread_tweets.length + 1})</span>
                  )}
                  {item.description?.substring(0, 280)}
                  {item.description && item.description.length > 280 ? '...' : ''}
                </p>
              )}
              <div className="rowDetails">
                <span className="rowItem">
                  <AiOutlineHeart className="rowItemIcon" /> {formatCount(item.points_count)}
                </span>
                <span className="rowItem">
                  <AiOutlineRetweet className="rowItemIcon" /> {formatCount(item.retweet_count)}
                </span>
                <span className="rowItem">
                  <BiCommentDetail className="rowItemIcon" /> {formatCount(item.comments_count)}
                </span>
                {item.views_count > 0 && (
                  <span className="rowItem">
                    <AiOutlineEye className="rowItemIcon" /> {formatCount(item.views_count)}
                  </span>
                )}
                <span className="rowItem" title={new Date(item.published_at).toUTCString()}>
                  <MdAccessTime className="rowItemIcon" /> {format(new Date(item.published_at))}
                </span>
              </div>
            </>
          )}
        </>
      }
    />
  )
}

export default ArticleItem
