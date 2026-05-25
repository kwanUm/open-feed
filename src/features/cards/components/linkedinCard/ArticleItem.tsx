import { useState as useLocalState } from 'react'
import { AiOutlineLike } from 'react-icons/ai'
import { BiCommentDetail, BiCopy, BiShare } from 'react-icons/bi'
import { SiAnthropic } from 'react-icons/si'
import { MdAccessTime } from 'react-icons/md'
import { CardItemWithActions, CardLink } from 'src/components/Elements'
import { Attributes } from 'src/lib/analytics'
import { useUserPreferences } from 'src/stores/preferences'
import { LinkedinArticle, BaseItemPropsType, SharedPost } from 'src/types'

type Props = BaseItemPropsType<LinkedinArticle> & {
  expandedId: string | null
  onToggleExpand: (id: string | null) => void
}

const ArticleItem = (props: Props) => {
  const { item, analyticsTag, expandedId, onToggleExpand } = props
  const { listingMode } = useUserPreferences()
  const expanded = expandedId === item.id
  const [copied, setCopied] = useLocalState(false)

  const buildPostText = () => {
    const parts = [item.title]
    if (item.author_title) parts[0] += ` · ${item.author_title}`
    if (item.description) parts.push(item.description)
    if (item.shared_post) {
      parts.push(`> ${item.shared_post.author}${item.shared_post.author_title ? ` · ${item.shared_post.author_title}` : ''}:\n> ${item.shared_post.text}`)
    }
    if (item.link_preview?.title) parts.push(`${item.link_preview.title}\n${item.link_preview.url}`)
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
                  <AiOutlineLike />
                  <span className="value">{item.points_count}</span>
                </span>
              )}
              <span className="subTitle">
                <strong>{item.title}</strong>
                {item.author_title ? ` · ${item.author_title}` : ''}
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
                  <div dir="auto">{item.description}</div>
                  {item.media_urls?.length > 0 && (
                    <div className="rowMediaGallery">
                      {item.media_urls.map((url, i) => (
                        <img key={i} src={url} className="rowMediaImage" alt="" />
                      ))}
                    </div>
                  )}
                  {item.shared_post && (
                    <div className="rowQuotedTweet" dir="auto">
                      <div className="rowQuotedTweetHeader">
                        {item.shared_post.avatar_url && (
                          <img src={item.shared_post.avatar_url} className="rowQuotedTweetAvatar" alt="" />
                        )}
                        <strong>{item.shared_post.author}</strong>
                        {item.shared_post.author_title && (
                          <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>
                            {item.shared_post.author_title}
                          </span>
                        )}
                      </div>
                      {item.shared_post.text && (
                        <p className="rowQuotedTweetText">{item.shared_post.text}</p>
                      )}
                      {item.shared_post.media_urls?.length > 0 && (
                        <div className="rowMediaGallery">
                          {item.shared_post.media_urls.map((url, i) => (
                            <img key={i} src={url} className="rowMediaImage" alt="" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {item.link_preview && (
                    <a
                      href={item.link_preview.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rowLinkPreview"
                      onClick={(e) => e.stopPropagation()}>
                      {item.link_preview.image_url && (
                        <img src={item.link_preview.image_url} className="rowLinkPreviewImage" alt="" />
                      )}
                      <div className="rowLinkPreviewText">
                        <span className="rowLinkPreviewTitle">{item.link_preview.title}</span>
                        {item.link_preview.subtitle && (
                          <span className="rowLinkPreviewSubtitle">{item.link_preview.subtitle}</span>
                        )}
                      </div>
                    </a>
                  )}
                </div>
              ) : (
                <p
                  className="rowDescription"
                  dir="auto"
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(item.id) }}
                  style={{ cursor: 'pointer' }}>
                  {item.description?.substring(0, 200)}
                  {item.description && item.description.length > 200 ? '...' : ''}
                </p>
              )}
              <div className="rowDetails">
                <span className="rowItem">
                  <AiOutlineLike className="rowItemIcon" /> {item.points_count} reactions
                </span>
                <span className="rowItem">
                  <BiCommentDetail className="rowItemIcon" /> {item.comments_count} comments
                </span>
                {item.shares_count > 0 && (
                  <span className="rowItem">
                    <BiShare className="rowItemIcon" /> {item.shares_count} reposts
                  </span>
                )}
                {item.time_ago && (
                  <span className="rowItem">
                    <MdAccessTime className="rowItemIcon" /> {item.time_ago}
                  </span>
                )}
              </div>
            </>
          )}
        </>
      }
    />
  )
}

export default ArticleItem
