// Formatter + zip writer, bundled from src/utils/exportCore.ts by
// script/build-export-core.sh. Loaded as a classic script so this worker can
// stay non-module.
importScripts('./export-core.js')
// Daily digest: alarm, bundle builder, and the claude.ai handoff. Only touches
// this file's globals once an alarm or message fires, so load order is safe.
importScripts('./digest.js')

const BG_VERSION = 10 // bump to force SW update
console.log('background.js v' + BG_VERSION + ' loaded')

// Clear any uninstall URL left over from the upstream hackertab.dev codebase
chrome.runtime.setUninstallURL('')

// No action.onClicked handler: the toolbar button opens digest-popup.html, and a
// declared popup takes precedence over onClicked, so such a listener never runs.
// The popup carries its own "Open OpenFeed" button instead.

// --- Feed fetching for LinkedIn and X.com ---

const feedCache = {
  linkedin: { data: null, timestamp: 0 },
  xcom: { data: null, timestamp: 0 },
}
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function getCookie(url, name) {
  return new Promise((resolve) => {
    chrome.cookies.get({ url, name }, (cookie) => {
      resolve(cookie ? cookie.value : null)
    })
  })
}

function parseTimeAgo(str) {
  if (!str) return Date.now()
  const now = Date.now()
  const m = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/)
  if (!m) return now
  const n = parseInt(m[1], 10)
  const unit = m[2]
  const ms = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 3154e7 }
  return now - n * (ms[unit] || 0)
}

// --- LinkedIn Feed ---

async function fetchLinkedinFeed() {
  const now = Date.now()
  if (feedCache.linkedin.data && now - feedCache.linkedin.timestamp < CACHE_TTL) {
    return feedCache.linkedin.data
  }

  const jsessionid = await getCookie('https://www.linkedin.com', 'JSESSIONID')
  const liAt = await getCookie('https://www.linkedin.com', 'li_at')

  if (!jsessionid || !liAt) {
    return { error: 'NOT_LOGGED_IN', source: 'linkedin' }
  }

  const csrfToken = jsessionid.replace(/"/g, '')
  const headers = {
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'cookie': `JSESSIONID="${csrfToken}"; li_at=${liAt}`,
  }

  const LINKEDIN_PAGE_SIZE = 60
  const fetchPage = (start) => fetch(
    `https://www.linkedin.com/voyager/api/feed/updatesV2?count=${LINKEDIN_PAGE_SIZE}&q=feed&start=${start}`,
    { headers }
  )

  const [resp1, resp2] = await Promise.all([fetchPage(0), fetchPage(LINKEDIN_PAGE_SIZE)])

  if (resp1.status === 401 || resp1.status === 403) {
    return { error: 'NOT_LOGGED_IN', source: 'linkedin' }
  }

  if (!resp1.ok) {
    return { error: `LinkedIn API error: ${resp1.status}`, source: 'linkedin' }
  }

  const data1 = await resp1.json()
  const data2 = resp2.ok ? await resp2.json() : { elements: [] }
  const allElements = [...(data1.elements || []), ...(data2.elements || [])]

  const articles = allElements
    .map((el) => {
      const subDesc = el.actor?.subDescription?.accessibilityText || ''
      const isPromoted = subDesc === 'Promoted' || subDesc.startsWith('Promoted by')
      const shareAction = el.updateMetadata?.updateActions?.actions?.find(
        (a) => a.actionType === 'SHARE_VIA'
      )
      const profilePic = el.actor?.image?.attributes?.[0]?.miniProfile?.picture
      const vecImage = profilePic?.['com.linkedin.common.VectorImage']
      const avatarUrl = vecImage
        ? vecImage.rootUrl +
          (vecImage.artifacts?.find((a) => a.width >= 100) || vecImage.artifacts?.[0])
            ?.fileIdentifyingUrlPathSegment
        : ''

      // Helper to extract image URL from a VectorImage object
      const extractImageUrl = (vecImg) => {
        if (!vecImg?.rootUrl || !vecImg?.artifacts?.length) return ''
        const largest = vecImg.artifacts.reduce((a, b) => (b.width > a.width ? b : a), vecImg.artifacts[0])
        return vecImg.rootUrl + largest.fileIdentifyingUrlPathSegment
      }

      // Extract media images and link preview from LinkedIn content
      const mediaUrls = []
      let linkPreview = null

      // Voyager keys every render component by its fully-qualified Java class.
      // Earlier code looked for a camelCase `articleComponent` and a bare
      // `navigationContext` on content; neither exists in the response, so every
      // article and link preview was silently dropped. Measured against the live
      // feed: 9 ArticleComponent and 5 LinkedInVideoComponent posts out of 40,
      // and the old selectors matched 0 of both.
      const RENDER = 'com.linkedin.voyager.feed.render.'
      const component = (name) => el.content?.[RENDER + name]

      // Either slot can carry the article's picture; one is present, not both.
      const vectorOf = (slot) =>
        slot?.attributes?.[0]?.vectorImage || slot?.attributes?.[0]?.['com.linkedin.common.VectorImage']

      if (el.content) {
        // Try to extract images from various LinkedIn content structures
        const imgRoot = component('ImageComponent')?.images || el.content?.images || []
        for (const img of imgRoot) {
          const vecImg = vectorOf(img)
          if (vecImg) {
            const url = extractImageUrl(vecImg)
            if (url) mediaUrls.push(url)
          }
        }

        // Native video: keep the poster frame only. The video itself is useless
        // for a text summary, but the thumbnail often carries the actual slide
        // or chart the post is about.
        const videoThumb = component('LinkedInVideoComponent')?.videoPlayMetadata?.thumbnail
        if (videoThumb) {
          const url = extractImageUrl(videoThumb)
          if (url) mediaUrls.push(url)
        }

        const article = component('ArticleComponent')
        const contentNav = el.content?.navigationContext
        const contentTitle = el.content?.title?.text || el.content?.title?.accessibilityText
        const contentSubtitle = el.content?.description?.text || el.content?.landingPage?.title

        const previewTitle = contentTitle || article?.title?.text
        const previewSubtitle = contentSubtitle || article?.subtitle?.text || ''
        const previewNav = contentNav || article?.navigationContext
        const previewImgVec =
          vectorOf(el.content?.largeImage) ||
          vectorOf(el.content?.smallImage) ||
          vectorOf(article?.largeImage) ||
          vectorOf(article?.smallImage)

        if (previewTitle && previewNav?.actionTarget) {
          linkPreview = {
            title: previewTitle,
            subtitle: previewSubtitle,
            url: previewNav.actionTarget,
            image_url: previewImgVec ? extractImageUrl(previewImgVec) : '',
          }
        }
      }

      // Extract reshared/quoted post data
      let sharedPost = null
      const reshared = el.resharedUpdate
      if (reshared) {
        const resharedActor = reshared.actor || {}
        const resharedText = reshared.commentary?.text?.text || ''
        const resharedPic = resharedActor.image?.attributes?.[0]?.miniProfile?.picture
        const resharedVec = resharedPic?.['com.linkedin.common.VectorImage']
        const resharedAvatar = resharedVec
          ? resharedVec.rootUrl +
            (resharedVec.artifacts?.find((a) => a.width >= 100) || resharedVec.artifacts?.[0])
              ?.fileIdentifyingUrlPathSegment
          : ''
        const resharedMediaUrls = []
        if (reshared.content) {
          const imgRoot = reshared.content?.['com.linkedin.voyager.feed.render.ImageComponent']?.images
            || reshared.content?.images || []
          for (const img of imgRoot) {
            const attrs = img?.attributes?.[0]
            const vecImg = attrs?.vectorImage || attrs?.['com.linkedin.common.VectorImage']
            if (vecImg) {
              const url = extractImageUrl(vecImg)
              if (url) resharedMediaUrls.push(url)
            }
          }
        }
        if (resharedText || resharedMediaUrls.length > 0) {
          sharedPost = {
            author: resharedActor.name?.text || '',
            author_title: resharedActor.description?.text || '',
            text: resharedText,
            avatar_url: resharedAvatar,
            media_urls: resharedMediaUrls,
          }
        }
      }

      const commentaryText = el.commentary?.text?.text || ''
      // Skip non-post modules (suggestions, news cards, etc.) — keep anything with
      // text, media, a link preview, or a reshared post.
      if (!commentaryText && mediaUrls.length === 0 && !linkPreview && !sharedPost) {
        return null
      }

      return {
        id: el.updateMetadata?.urn || el.entityUrn || String(Date.now()),
        url: shareAction?.url || el.actor?.navigationContext?.actionTarget || '',
        title: el.actor?.name?.text || 'LinkedIn Post',
        source: 'linkedin',
        tags: [],
        comments_count: el.socialDetail?.totalSocialActivityCounts?.numComments || 0,
        points_count: el.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
        image_url: avatarUrl,
        published_at: el.createdTime || parseTimeAgo(el.actor?.subDescription?.accessibilityText || ''),
        description: commentaryText,
        author_title: el.actor?.description?.text || '',
        time_ago: el.actor?.subDescription?.accessibilityText || '',
        shares_count: el.socialDetail?.totalSocialActivityCounts?.numShares || 0,
        media_urls: mediaUrls,
        link_preview: linkPreview,
        shared_post: sharedPost,
        promoted: isPromoted,
      }
    })
    .filter(Boolean)

  const seenIds = new Set()
  const deduped = articles.filter((a) => {
    if (seenIds.has(a.id)) return false
    seenIds.add(a.id)
    return true
  })

  deduped.sort((a, b) => b.published_at - a.published_at)
  feedCache.linkedin = { data: deduped, timestamp: now }
  return deduped
}

// --- X.com Feed ---

const XCOM_FALLBACK_BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const XCOM_FALLBACK_QUERY_ID = 'L8Lb9oomccM012S7fQ-QKA'

const XCOM_FEATURES = {
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: true,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  rweb_video_screen_enabled: false,
  cards_platform_web_enabled: true,
}

async function getXcomTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['xcom_bearer_token', 'xcom_query_id'], (result) => {
      resolve({
        bearerToken: result.xcom_bearer_token || XCOM_FALLBACK_BEARER_TOKEN,
        queryId: result.xcom_query_id || XCOM_FALLBACK_QUERY_ID,
      })
    })
  })
}

async function fetchXcomFeed() {
  const now = Date.now()
  if (feedCache.xcom.data && now - feedCache.xcom.timestamp < CACHE_TTL) {
    return feedCache.xcom.data
  }

  const ct0 = await getCookie('https://x.com', 'ct0')
  const authToken = await getCookie('https://x.com', 'auth_token')

  if (!ct0 || !authToken) {
    return { error: 'NOT_LOGGED_IN', source: 'xcom' }
  }

  const { bearerToken, queryId } = await getXcomTokens()
  const features = encodeURIComponent(JSON.stringify(XCOM_FEATURES))
  const headers = {
    authorization: `Bearer ${bearerToken}`,
    'x-csrf-token': ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
    'cookie': `ct0=${ct0}; auth_token=${authToken}`,
  }

  const XCOM_PAGE_SIZE = 60
  const fetchPage = (cursor) => {
    const vars = {
      count: XCOM_PAGE_SIZE,
      includePromotedContent: false,
      withCommunity: true,
    }
    if (cursor) vars.cursor = cursor
    else vars.requestContext = 'launch'
    const variables = encodeURIComponent(JSON.stringify(vars))
    return fetch(
      `https://x.com/i/api/graphql/${queryId}/HomeTimeline?variables=${variables}&features=${features}`,
      { headers }
    )
  }

  const extractEntries = (data) => {
    const instructions = data?.data?.home?.home_timeline_urt?.instructions || []
    const addEntries = instructions.find((i) => i.type === 'TimelineAddEntries')
    return addEntries?.entries || []
  }

  const resp = await fetchPage(null)

  if (resp.status === 401 || resp.status === 403) {
    return { error: 'NOT_LOGGED_IN', source: 'xcom' }
  }

  if (!resp.ok) {
    return { error: `X.com API error: ${resp.status}`, source: 'xcom' }
  }

  const data = await resp.json()
  const page1Entries = extractEntries(data)

  const cursorEntry = page1Entries.find((e) => e.entryId?.startsWith('cursor-bottom-'))
  const bottomCursor = cursorEntry?.content?.value

  let page2Entries = []
  if (bottomCursor) {
    const resp2 = await fetchPage(bottomCursor)
    if (resp2.ok) {
      const data2 = await resp2.json()
      page2Entries = extractEntries(data2)
    }
  }

  const entries = [...page1Entries, ...page2Entries]

  // Helper: extract user info from a tweet result
  const extractUser = (t) => {
    const ur = t?.core?.user_results?.result || {}
    const uc = ur.core || {}
    const ul = ur.legacy || {}
    return {
      name: uc.name || ul.name || '',
      screenName: uc.screen_name || ul.screen_name || '',
      avatarUrl: (ur.avatar?.image_url || ul.profile_image_url_https || '').replace('_normal', '_bigger'),
      isBlueVerified: ur.is_blue_verified || false,
    }
  }

  // Helper: extract full text from a tweet, expanding t.co URLs
  const extractText = (t) => {
    const leg = t?.legacy || {}
    const note = t?.note_tweet?.note_tweet_results?.result
    let text = leg.full_text || ''
    const urls = leg.entities?.urls || []
    for (const u of urls) {
      if (u.url && u.expanded_url) text = text.replace(u.url, u.expanded_url)
    }
    return note?.text || text
  }

  // Helper: extract media URLs from a tweet
  const extractMedia = (t) => {
    const leg = t?.legacy || {}
    return (leg.extended_entities?.media || leg.entities?.media || [])
      .filter((m) => m.type === 'photo')
      .map((m) => m.media_url_https)
  }

  // Process a single tweet result into an article object
  const processTweet = (tweetResult) => {
    if (!tweetResult) return null

    const tweet = tweetResult.__typename === 'TweetWithVisibilityResults'
      ? tweetResult.tweet
      : tweetResult

    if (!tweet?.legacy) return null

    const legacy = tweet.legacy
    const user = extractUser(tweet)

    // Check if this is a retweet — get original tweet data
    const rtResult = legacy.retweeted_status_result?.result
    const isRetweet = !!rtResult
    const sourceTweet = isRetweet
      ? (rtResult.__typename === 'TweetWithVisibilityResults' ? rtResult.tweet : rtResult)
      : tweet
    const sourceUser = isRetweet ? extractUser(sourceTweet) : user
    const sourceText = extractText(sourceTweet)
    const sourceMedia = extractMedia(sourceTweet)

    // Extract quoted tweet data for preview card
    const qtResult = sourceTweet?.quoted_status_result?.result
    let quotedTweet = null
    if (qtResult) {
      const qt = qtResult.__typename === 'TweetWithVisibilityResults' ? qtResult.tweet : qtResult
      if (qt?.legacy) {
        const qtUser = extractUser(qt)
        const qtText = extractText(qt)
        const qtMedia = extractMedia(qt)
        quotedTweet = {
          author: qtUser.name,
          screen_name: qtUser.screenName,
          text: qtText,
          image_url: qtMedia[0] || qtUser.avatarUrl,
          media_urls: qtMedia,
        }
      }
    }

    // Extract card metadata for article/link previews
    const card = sourceTweet?.card?.legacy?.binding_values
    let cardTitle = ''
    let cardDescription = ''
    let cardImage = ''
    if (card) {
      const getCardVal = (key) => {
        const entry = card.find?.((b) => b.key === key) || card[key]
        return entry?.value?.string_value || entry?.value?.scribe_value || ''
      }
      if (Array.isArray(card)) {
        cardTitle = getCardVal('title')
        cardDescription = getCardVal('description')
        cardImage = getCardVal('thumbnail_image_original') || getCardVal('thumbnail_image')
      } else {
        cardTitle = card.title?.value?.string_value || ''
        cardDescription = card.description?.value?.string_value || ''
        cardImage = card.thumbnail_image_original?.value?.image_value?.url
          || card.thumbnail_image?.value?.image_value?.url || ''
      }
    }

    const tweetId = tweet.rest_id || legacy.id_str
    const tweetUrl = user.screenName
      ? `https://x.com/${user.screenName}/status/${tweetId}`
      : `https://x.com/i/status/${tweetId}`

    const mediaUrls = [...sourceMedia]

    // If text is just a URL and we have card data, use card description
    const isTextJustUrl = sourceText.match(/^https?:\/\/\S+$/)
    const displayText = isTextJustUrl && cardDescription
      ? cardDescription
      : sourceText

    // Add card image if no other images
    if (cardImage && mediaUrls.length === 0) {
      mediaUrls.push(cardImage)
    }

    // Build title: show RT source + card title if applicable
    let title = isRetweet
      ? `${sourceUser.name} (RT by ${user.name})`
      : (user.name || 'X Post')
    if (cardTitle && isTextJustUrl) title = `${sourceUser.name}: ${cardTitle}`

    return {
      id: tweetId,
      url: tweetUrl,
      title,
      source: 'xcom',
      tags: [],
      comments_count: legacy.reply_count || 0,
      points_count: legacy.favorite_count || 0,
      image_url: sourceUser.avatarUrl || user.avatarUrl,
      published_at: new Date(legacy.created_at).getTime(),
      description: displayText,
      screen_name: isRetweet ? sourceUser.screenName : user.screenName,
      retweet_count: legacy.retweet_count || 0,
      views_count: parseInt(tweet.views?.count || '0', 10),
      is_blue_verified: sourceUser.isBlueVerified || user.isBlueVerified,
      bookmark_count: legacy.bookmark_count || 0,
      media_urls: mediaUrls,
      quoted_tweet: quotedTweet,
      thread_tweets: [],
    }
  }

  // Process individual tweet entries
  const articles = entries
    .filter((entry) => entry.entryId?.startsWith('tweet-'))
    .map((entry) => processTweet(entry.content?.itemContent?.tweet_results?.result))
    .filter(Boolean)

  // Process conversation thread entries (self-threads by same author)
  entries
    .filter((entry) => entry.entryId?.startsWith('conversationthread-'))
    .forEach((entry) => {
      const items = entry.content?.items || []
      const threadArticles = items
        .map((item) => processTweet(item.item?.itemContent?.tweet_results?.result))
        .filter(Boolean)

      if (threadArticles.length > 0) {
        // Sort chronologically (oldest first)
        threadArticles.sort((a, b) => a.published_at - b.published_at)
        // The latest tweet is the main article; preceding ones are thread context
        const main = threadArticles[threadArticles.length - 1]
        if (threadArticles.length > 1) {
          main.thread_tweets = threadArticles.slice(0, -1).map((t) => ({
            text: t.description,
            media_urls: t.media_urls,
          }))
        }
        articles.push(main)
      }
    })

  const seenIds = new Set()
  const deduped = articles.filter((a) => {
    if (seenIds.has(a.id)) return false
    seenIds.add(a.id)
    return true
  })

  deduped.sort((a, b) => b.published_at - a.published_at)
  feedCache.xcom = { data: deduped, timestamp: now }
  return deduped
}

// --- RSS Feed fetcher ---

const rssCache = {}
const RSS_TTL = 30 * 60 * 1000 // 30 min

async function fetchRssFeed(url) {
  const now = Date.now()
  if (rssCache[url] && now - rssCache[url].timestamp < RSS_TTL) {
    return rssCache[url].text
  }
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`RSS fetch error: ${resp.status}`)
  const text = await resp.text()
  rssCache[url] = { text, timestamp: now }
  return text
}

// --- LinkedIn profile fetcher (for onboarding inference) ---

async function fetchLinkedinProfile() {
  const jsessionid = await getCookie('https://www.linkedin.com', 'JSESSIONID')
  const liAt = await getCookie('https://www.linkedin.com', 'li_at')
  if (!jsessionid || !liAt) return { error: 'NOT_LOGGED_IN' }
  const csrfToken = jsessionid.replace(/"/g, '')
  const headers = {
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'cookie': `JSESSIONID="${csrfToken}"; li_at=${liAt}`,
  }
  const resp = await fetch('https://www.linkedin.com/voyager/api/me', { headers })
  if (!resp.ok) return { error: `LinkedIn API error: ${resp.status}` }
  return resp.json()
}

async function fetchLinkedinFullProfile() {
  const jsessionid = await getCookie('https://www.linkedin.com', 'JSESSIONID')
  const liAt = await getCookie('https://www.linkedin.com', 'li_at')
  if (!jsessionid || !liAt) return { error: 'NOT_LOGGED_IN' }
  const csrfToken = jsessionid.replace(/"/g, '')
  const headers = {
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'cookie': `JSESSIONID="${csrfToken}"; li_at=${liAt}`,
  }

  const meResp = await fetch('https://www.linkedin.com/voyager/api/me', { headers })
  if (!meResp.ok) return { error: `LinkedIn API error: ${meResp.status}` }
  const meData = await meResp.json()
  const mini = meData?.miniProfile || {}
  const publicId = mini.publicIdentifier
  if (!publicId) return { error: 'Could not get profile ID' }

  const name = `${mini.firstName || ''} ${mini.lastName || ''}`.trim()
  const headline = mini.occupation || ''
  let summary = '', positions = '', skills = ''

  // Try the newer dash profiles API (replaces deprecated profileView)
  const dashResp = await fetch(
    `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=viewee&vieweeVanityName=${encodeURIComponent(publicId)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-91`,
    { headers }
  )
  if (dashResp.ok) {
    const dash = await dashResp.json()
    const el = dash?.elements?.[0] || {}
    summary = el.summary || ''
    const included = dash?.included || []
    positions = included
      .filter((x) => x.$type?.includes('Position'))
      .slice(0, 6)
      .map((p) => [p.title, p.companyName].filter(Boolean).join(' at '))
      .join('\n')
    skills = included
      .filter((x) => x.$type?.includes('Skill'))
      .slice(0, 20)
      .map((s) => s.name)
      .filter(Boolean)
      .join(', ')
  } else {
    // Fallback: try the older sub-resource endpoints individually
    const [posResp, skillResp] = await Promise.allSettled([
      fetch(`https://www.linkedin.com/voyager/api/identity/profiles/${publicId}/positions`, { headers }),
      fetch(`https://www.linkedin.com/voyager/api/identity/profiles/${publicId}/skills`, { headers }),
    ])
    if (posResp.status === 'fulfilled' && posResp.value.ok) {
      const posData = await posResp.value.json()
      positions = (posData?.elements || [])
        .slice(0, 6)
        .map((p) => [p.title, p.companyName].filter(Boolean).join(' at '))
        .join('\n')
    }
    if (skillResp.status === 'fulfilled' && skillResp.value.ok) {
      const skillData = await skillResp.value.json()
      skills = (skillData?.elements || [])
        .slice(0, 20)
        .map((s) => s.name)
        .filter(Boolean)
        .join(', ')
    }
  }

  return { name, headline, summary, positions, skills }
}

async function callClaudeViaSession(prompt) {
  const headers = { 'Content-Type': 'application/json' }

  // Get org ID from the organizations endpoint
  const orgResp = await fetch('https://claude.ai/api/organizations', { credentials: 'include', headers })
  if (orgResp.status === 401 || orgResp.status === 403) throw new Error('Not logged into claude.ai')
  if (!orgResp.ok) throw new Error(`claude.ai API error: ${orgResp.status}`)
  const orgs = await orgResp.json()
  const orgId = Array.isArray(orgs) ? orgs[0]?.uuid : orgs?.account?.memberships?.[0]?.organization?.uuid
  if (!orgId) throw new Error('No Claude organization found — are you logged into claude.ai?')

  // Create a temporary conversation
  const convId = crypto.randomUUID()
  const createResp = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ uuid: convId, name: '' }),
  })
  if (!createResp.ok) throw new Error(`Failed to create conversation: ${createResp.status}`)

  // Send message and stream response
  const completionResp = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ prompt, timezone: 'UTC', attachments: [], files: [] }),
  })
  if (!completionResp.ok) throw new Error(`Completion failed: ${completionResp.status}`)

  // Parse SSE stream
  const reader = completionResp.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') continue
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed.completion === 'string') fullText += parsed.completion
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') fullText += parsed.delta.text || ''
      } catch {}
    }
  }

  // Clean up the conversation
  fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}`, {
    method: 'DELETE', credentials: 'include',
  }).catch(() => {})

  return fullText
}

// --- Message handler ---

// --- X.com deep enrichment (used only when exporting a feed for analysis) ---
// Uses X's public syndication endpoint, which needs no bearer token or GraphQL
// query id, so it keeps working even when we have only the HomeTimeline query id.

const SYNDICATION_CACHE = new Map()
const TCO_CACHE = new Map()

// X derives the syndication token from the tweet id with this exact expression.
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '')
}

async function fetchSyndicationTweet(id) {
  if (!id) return null
  if (SYNDICATION_CACHE.has(id)) return SYNDICATION_CACHE.get(id)
  let result = null
  try {
    const token = syndicationToken(id)
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=${token}&lang=en`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (r.ok) result = await r.json()
  } catch (e) {
    result = null
  }
  SYNDICATION_CACHE.set(id, result)
  return result
}

// Follows a t.co short link to whatever it finally lands on.
// Each t.co hop is a real network round trip (measured ~2.6s). A 50-post feed
// carries ~30 of them, so resolving these one at a time blew past the 30s MV3
// worker budget and killed the entire enrichment batch, which is why exports
// silently shipped with no threads and no article bodies. Lookups are now
// capped and run concurrently, and the cache holds the in-flight promise so the
// same link is never fetched twice across posts.
// Firing all of a feed's links at once does not make them land sooner: the
// browser allows ~6 sockets per host, so the rest queue. Measured against t.co,
// 12 concurrent requests spread from 1.9s to 6.1s, and the tail only grows with
// the count. An unbounded fan-out therefore just means most requests sit in the
// queue until their own timeout fires and the link is handed back unresolved.
// Admitting six at a time gives each one a real socket inside its window.
const TCO_TIMEOUT_MS = 15000
const TCO_CONCURRENCY = 6
let tcoActive = 0
const tcoWaiting = []

function tcoAcquire() {
  if (tcoActive < TCO_CONCURRENCY) {
    tcoActive += 1
    return Promise.resolve()
  }
  return new Promise((release) => tcoWaiting.push(release))
}

function tcoRelease() {
  const next = tcoWaiting.shift()
  if (next) next()
  else tcoActive -= 1
}

function resolveTco(shortUrl) {
  if (TCO_CACHE.has(shortUrl)) return TCO_CACHE.get(shortUrl)

  const attempt = async () => {
    await tcoAcquire()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TCO_TIMEOUT_MS)
    try {
      const r = await fetch(shortUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      })
      return r.url || shortUrl
    } catch (e) {
      // Some targets reject HEAD; one GET retry, still inside the same cap.
      try {
        const r2 = await fetch(shortUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        })
        return r2.url || shortUrl
      } catch (e2) {
        return shortUrl
      }
    } finally {
      clearTimeout(timer)
      tcoRelease()
    }
  }

  // Cache the promise, not the result, so concurrent callers share one request.
  const pending = attempt()
  TCO_CACHE.set(shortUrl, pending)
  return pending
}

async function resolveTcoInText(text) {
  if (!text) return text
  const found = [...new Set(text.match(/https:\/\/t\.co\/[A-Za-z0-9]+/g) || [])]
  if (!found.length) return text
  const resolved = await Promise.all(found.map((short) => resolveTco(short)))
  let out = text
  found.forEach((short, i) => {
    const full = resolved[i]
    if (full && full !== short) out = out.split(short).join(full)
  })
  return out
}

// Full text of a syndication tweet, preferring the long-form note body and
// swapping every t.co in entities for the URL the author actually posted.
function syndicationText(t) {
  if (!t) return ''
  let text = t.note_tweet?.text || t.text || ''
  for (const u of t.entities?.urls || []) {
    if (u.url && u.expanded_url) text = text.split(u.url).join(u.expanded_url)
  }
  return text
}

// Twitter's default media URL serves a downscaled copy. name=orig returns the
// full-resolution file, which matters when the images are charts or tables the
// AI is expected to actually read.
function upgradeTwimgUrl(url) {
  if (!url || !url.includes('pbs.twimg.com')) return url
  if (url.includes('name=orig')) return url
  const [base, query] = url.split('?')
  const params = new URLSearchParams(query || '')
  const ext = base.match(/\.(jpg|jpeg|png|webp)$/i)
  let stem = base
  if (ext) {
    stem = base.replace(/\.(jpg|jpeg|png|webp)$/i, '')
    params.set('format', ext[1].toLowerCase() === 'jpeg' ? 'jpg' : ext[1].toLowerCase())
  } else if (!params.get('format')) {
    params.set('format', 'jpg')
  }
  params.set('name', 'orig')
  return `${stem}?${params.toString()}`
}

function syndicationMedia(t) {
  if (!t) return []
  const out = []
  for (const photo of t.photos || []) {
    if (photo?.url) out.push({ url: upgradeTwimgUrl(photo.url), kind: 'image' })
  }
  if (t.video?.poster) {
    out.push({ url: upgradeTwimgUrl(t.video.poster), kind: 'video thumbnail' })
  }
  const card = t.card?.binding_values
  const cardImage =
    card?.thumbnail_image_original?.image_value?.url || card?.thumbnail_image?.image_value?.url
  if (cardImage) out.push({ url: upgradeTwimgUrl(cardImage), kind: 'link thumbnail' })
  return out
}

// X Articles carry a rich-text body rather than a plain string. Shapes vary, so
// every known container is probed and whatever yields text wins.
function syndicationArticle(t) {
  const article = t?.article || t?.article_results?.result
  if (!article) return null
  const title = article.title || article.metadata?.title || ''
  const blocks =
    article.content_state?.blocks || article.blocks || article.rich_text?.blocks || []
  let body = ''
  if (Array.isArray(blocks)) {
    body = blocks
      .map((b) => (typeof b === 'string' ? b : typeof b?.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n\n')
  }
  let partial = false
  if (!body && typeof article.preview_text === 'string') {
    // Syndication only ever returns a short preview, never the whole article.
    body = article.preview_text
    partial = true
  }
  const cover = upgradeTwimgUrl(article.cover_media?.media_info?.original_img_url || '')
  if (!title && !body) return null
  return { title, body, partial, media: cover ? [{ url: cover, kind: 'article cover' }] : [] }
}

function syndicationAuthor(t) {
  return {
    author: t?.user?.name || '',
    screen_name: t?.user?.screen_name || '',
  }
}

async function getXcomOperationQueryId(operation) {
  return new Promise((resolve) => {
    chrome.storage.local.get('xcom_query_ids', (stored) => {
      resolve((stored.xcom_query_ids || {})[operation] || null)
    })
  })
}

async function buildXcomHeaders() {
  const ct0 = await getCookie('https://x.com', 'ct0')
  const authToken = await getCookie('https://x.com', 'auth_token')
  if (!ct0 || !authToken) return null
  const { bearerToken } = await getXcomTokens()
  return {
    authorization: `Bearer ${bearerToken}`,
    'x-csrf-token': ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
    cookie: `ct0=${ct0}; auth_token=${authToken}`,
  }
}

/**
 * Fetches a tweet's conversation and returns the author's own thread: the focal
 * tweet plus each self-reply that chains off it.
 *
 * The syndication endpoint only exposes a tweet's ancestors, so walking upward
 * finds nothing when the feed shows the *head* of a thread ("1/10") and the rest
 * are its descendants. TweetDetail returns the whole conversation, so the
 * continuations can be picked out of it.
 *
 * Matching on author alone is wrong: an author replying to other people's
 * comments is not writing a thread. Verified against a live conversation where
 * 4 of 4 same-author replies were answers to commenters and the true chain
 * length was 1. The rule is therefore structural: follow in_reply_to downward
 * from the focal tweet, taking only children written by the focal author. On a
 * real "1/10" thread that recovers all 10 parts in order.
 */
/** Text of a GraphQL tweet, preferring the long-form note body. */
function graphqlTweetText(t) {
  return t?.note_tweet?.note_tweet_results?.result?.text || t?.legacy?.full_text || ''
}

/** Photos and video posters from a GraphQL tweet, matching syndicationMedia. */
function graphqlTweetMedia(t) {
  const legacy = t?.legacy || {}
  const media = legacy.extended_entities?.media || legacy.entities?.media || []
  const out = []
  for (const m of media) {
    // Videos and gifs expose their poster frame as media_url_https, which is the
    // only part worth keeping for a text summary.
    if (m?.media_url_https) {
      out.push({
        url: upgradeTwimgUrl(m.media_url_https),
        kind: m.type === 'photo' ? 'image' : 'video thumbnail',
      })
    }
  }
  return out
}

async function fetchXcomThreadDescendants(tweetId, authorId) {
  const queryId = await getXcomOperationQueryId('TweetDetail')
  if (!queryId) return []
  const headers = await buildXcomHeaders()
  if (!headers) return []

  const variables = {
    focalTweetId: tweetId,
    with_rux_injections: false,
    rankingMode: 'Relevance',
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
  }
  const url =
    `https://x.com/i/api/graphql/${queryId}/TweetDetail` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(XCOM_FEATURES))}`

  let payload
  try {
    const resp = await fetch(url, { headers, credentials: 'include' })
    if (!resp.ok) return []
    payload = await resp.json()
  } catch (e) {
    return []
  }

  const instructions =
    payload?.data?.threaded_conversation_with_injections_v2?.instructions || []
  const entries = (instructions.find((i) => i.type === 'TimelineAddEntries') || {}).entries || []

  const unwrap = (t) => (t?.__typename === 'TweetWithVisibilityResults' ? t.tweet : t)
  const collected = []
  const absorb = (raw) => {
    const t = unwrap(raw)
    if (!t?.rest_id) return
    const legacy = t.legacy || {}
    collected.push({
      id: t.rest_id,
      userId: t.core?.user_results?.result?.rest_id || legacy.user_id_str || '',
      parent: legacy.in_reply_to_status_id_str || null,
      tweet: t,
    })
  }

  for (const entry of entries) {
    if (entry.entryId?.startsWith('tweet-')) {
      absorb(entry.content?.itemContent?.tweet_results?.result)
    } else if (entry.entryId?.startsWith('conversationthread-')) {
      for (const item of entry.content?.items || []) {
        absorb(item.item?.itemContent?.tweet_results?.result)
      }
    }
  }

  const childrenOf = {}
  for (const node of collected) {
    if (!node.parent) continue
    ;(childrenOf[node.parent] = childrenOf[node.parent] || []).push(node)
  }

  const descendants = []
  let cursor = tweetId
  for (let hop = 0; hop < 50; hop++) {
    const next = (childrenOf[cursor] || []).find((c) => c.userId && c.userId === authorId)
    if (!next) break
    descendants.push(next.tweet)
    cursor = next.id
  }
  return descendants
}

// Walks any nested object for the first article payload that carries body blocks.
function findArticleResult(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null
  if (node.content_state || (node.title && (node.content_state || node.media_entities))) return node
  for (const key of Object.keys(node)) {
    const found = findArticleResult(node[key], depth + 1)
    if (found) return found
  }
  return null
}

// Feature flags X's own web client sends with TweetResultByRestId.
const XCOM_ARTICLE_FEATURES = {
  creator_subscriptions_tweet_preview_api_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  rweb_sports_post_context_enabled: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  rweb_cashtags_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
}

function findArticleResult(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 16) return null
  if (node.article_results && node.article_results.result) return node.article_results.result
  for (const key of Object.keys(node)) {
    const found = findArticleResult(node[key], depth + 1)
    if (found) return found
  }
  return null
}

/**
 * Rebuilds an X Article body from its rich content state, keeping images in the
 * place they actually appear. Blocks of type "atomic" are image slots: the block
 * points at an entityMap key, which points at a media id, which resolves to a URL
 * in media_entities. Each one becomes an ARTICLE_IMAGE marker the formatter later
 * swaps for the right [imgN] token.
 */
function parseArticleContent(article) {
  const byMediaId = {}
  for (const entity of article.media_entities || []) {
    const url = entity?.media_info?.original_img_url
    if (entity?.media_id && url) byMediaId[entity.media_id] = url
  }

  const entityMap = article.content_state?.entityMap || {}
  const blocks = article.content_state?.blocks || []
  const media = []
  const lines = []

  for (const block of blocks) {
    if (block?.type === 'atomic') {
      const key = block.entityRanges?.[0]?.key
      const mediaId = entityMap[key]?.value?.data?.mediaItems?.[0]?.mediaId
      const url = mediaId && byMediaId[mediaId]
      if (url) {
        media.push({ url: upgradeTwimgUrl(url), kind: 'article image' })
        lines.push(`{{ARTICLE_IMAGE_${media.length}}}`)
      }
      continue
    }
    const text = (block?.text || '').trim()
    if (!text) continue
    lines.push(typeof block.type === 'string' && block.type.startsWith('header') ? `## ${text}` : text)
  }

  let body = lines.join('\n\n')
  // Fall back to the flat plain text if the rich state was not usable.
  if (!body && typeof article.plain_text === 'string') body = article.plain_text

  return { body, media, summary: article.summary_text || '' }
}

/**
 * Pulls the full body of an X Article.
 *
 * The syndication endpoint and TweetDetail both return only ~200 characters of
 * preview. The body lives behind TweetResultByRestId, and only when the request
 * carries fieldToggles.withArticleRichContentState, which is what X's own article
 * reader sends. Verified against a real article on 2026-09-10.
 */
async function fetchXcomArticleBody(tweetId) {
  const queryId = await getXcomOperationQueryId('TweetResultByRestId')
  if (!queryId) {
    return { reason: 'TweetResultByRestId query id unknown; visit x.com once to capture it' }
  }

  const headers = await buildXcomHeaders()
  if (!headers) return { reason: 'not logged in to x.com' }

  const variables = encodeURIComponent(
    JSON.stringify({
      tweetId: String(tweetId),
      includePromotedContent: false,
      withBirdwatchNotes: true,
      withVoice: true,
      withCommunity: true,
    })
  )
  const features = encodeURIComponent(JSON.stringify(XCOM_ARTICLE_FEATURES))
  const fieldToggles = encodeURIComponent(
    JSON.stringify({
      withArticleRichContentState: true,
      withArticlePlainText: true,
      withArticleSummaryText: true,
      withArticleVoiceOver: false,
    })
  )

  try {
    const resp = await fetch(
      `https://x.com/i/api/graphql/${queryId}/TweetResultByRestId?variables=${variables}&features=${features}&fieldToggles=${fieldToggles}`,
      { headers }
    )
    if (!resp.ok) return { reason: `TweetResultByRestId HTTP ${resp.status}` }

    const data = await resp.json()
    const article = findArticleResult(data)
    if (!article) return { reason: 'no article in TweetResultByRestId response' }

    const parsed = parseArticleContent(article)
    if (!parsed.body) return { reason: 'article body was empty' }

    return {
      title: article.title || '',
      body: parsed.body,
      media: parsed.media,
      summary: parsed.summary,
    }
  } catch (e) {
    return { reason: `TweetResultByRestId failed: ${e.message}` }
  }
}

async function enrichXcomTweet(id) {
  const root = await fetchSyndicationTweet(id)
  if (!root) return { id, unavailable: true }

  const selfId = root.user?.id_str
  const ancestors = []
  let replyTo = null
  let cursor = root

  // Walk up the reply chain. Same author means it is the author's own thread;
  // a different author means this post is a reply and that parent is context.
  for (let hop = 0; hop < 25; hop++) {
    const inlineParent = cursor.parent
    const parentId = inlineParent?.id_str || cursor.in_reply_to_status_id_str
    if (!parentId) break
    const parent =
      inlineParent && typeof inlineParent.text === 'string'
        ? inlineParent
        : await fetchSyndicationTweet(parentId)
    if (!parent) break
    if (selfId && parent.user?.id_str === selfId) {
      ancestors.unshift(parent)
      cursor = parent
    } else {
      replyTo = parent
      break
    }
  }

  const chain = [...ancestors, root]
  const thread = []
  for (const t of chain) {
    thread.push({
      id: t.id_str,
      text: await resolveTcoInText(syndicationText(t)),
      media: syndicationMedia(t),
    })
  }

  // Walk downward too. A feed usually surfaces the head of a thread, whose
  // continuations are descendants and so are invisible to the upward walk above.
  // Skipped when nothing has replied at all, to avoid a TweetDetail round trip
  // per post on a feed that is mostly standalone tweets.
  if (selfId && (root.conversation_count || 0) > 0) {
    const descendants = await fetchXcomThreadDescendants(id, selfId)
    for (const t of descendants) {
      thread.push({
        id: t.rest_id,
        text: await resolveTcoInText(graphqlTweetText(t)),
        media: graphqlTweetMedia(t),
      })
    }
  }

  const quotedRaw = root.quoted_tweet
  const quoted = quotedRaw
    ? {
        ...syndicationAuthor(quotedRaw),
        text: await resolveTcoInText(syndicationText(quotedRaw)),
        media: syndicationMedia(quotedRaw),
      }
    : null

  const reply_to = replyTo
    ? {
        ...syndicationAuthor(replyTo),
        url: replyTo.id_str ? `https://x.com/i/status/${replyTo.id_str}` : '',
        text: await resolveTcoInText(syndicationText(replyTo)),
        media: syndicationMedia(replyTo),
      }
    : null

  const article = syndicationArticle(root)
  if (article) {
    if (article.partial) {
      const full = await fetchXcomArticleBody(id)
      if (full.body) {
        article.body = full.body
        article.title = full.title || article.title
        article.partial = false
        article.media = [...(article.media || []), ...(full.media || [])]
      } else {
        // Say why the body is short instead of shipping a silent 200-char stub.
        article.truncated_reason = full.reason
      }
    }
    article.body = await resolveTcoInText(article.body)
  }

  return {
    id,
    text: await resolveTcoInText(syndicationText(root)),
    thread,
    reply_to,
    quoted,
    article,
    media: syndicationMedia(root),
  }
}

async function enrichXcomBatch(ids) {
  const results = {}
  // Small batches keep each message short so the MV3 worker is not killed mid-flight.
  await Promise.all(
    (ids || []).map(async (id) => {
      try {
        results[id] = await enrichXcomTweet(id)
      } catch (e) {
        results[id] = { id, unavailable: true, error: e.message }
      }
    })
  )
  return results
}

// Downloads a media file and hands it back as base64 so the new-tab page can
// bundle it into a zip. Runs here because the worker has the host permissions.
async function fetchMediaAsBase64(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Media fetch failed: ${r.status}`)
  const blob = await r.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return { base64: btoa(binary), contentType: blob.type || '', size: bytes.length }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ENRICH_XCOM') {
    enrichXcomBatch(message.ids)
      .then((data) => sendResponse({ data }))
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_MEDIA') {
    fetchMediaAsBase64(message.url)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_LINKEDIN_PROFILE') {
    fetchLinkedinProfile()
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_LINKEDIN_FULL_PROFILE') {
    // Release the port immediately — MV3 service workers get killed during long fetches.
    // Result is written to storage; HelloTab listens for the change.
    sendResponse({ ok: true })
    fetchLinkedinFullProfile()
      .then((result) => chrome.storage.local.set({ linkedin_profile_result: result }))
      .catch((e) => chrome.storage.local.set({ linkedin_profile_result: { error: e.message } }))
    return false
  }

  if (message.type === 'OPEN_CLAUDE_TAB') {
    sendResponse({ ok: true })
    callClaudeViaSession(message.prompt)
      .then((text) => {
        const match = text.match(/\{[^{}]*"role"\s*:\s*"[^"]*"[^{}]*\}/)
        if (!match) { chrome.storage.local.set({ claude_inferred_role: { error: 'No JSON in response' } }); return }
        try { chrome.storage.local.set({ claude_inferred_role: JSON.parse(match[0]) }) }
        catch { chrome.storage.local.set({ claude_inferred_role: { error: 'Failed to parse response' } }) }
      })
      .catch((e) => chrome.storage.local.set({ claude_inferred_role: { error: e.message } }))
    return false
  }

  if (message.type === 'FETCH_LINKEDIN_FEED') {
    fetchLinkedinFeed().then(sendResponse).catch((e) => {
      sendResponse({ error: e.message, source: 'linkedin' })
    })
    return true
  }

  if (message.type === 'FETCH_XCOM_FEED') {
    fetchXcomFeed().then(sendResponse).catch((e) => {
      sendResponse({ error: e.message, source: 'xcom' })
    })
    return true
  }

  if (message.type === 'XCOM_QUERY_IDS_SCRAPED') {
    chrome.storage.local.get('xcom_query_ids', (stored) => {
      const map = { ...(stored.xcom_query_ids || {}), ...(message.operations || {}) }
      const updates = { xcom_query_ids: map }
      if (message.bearerToken) updates.xcom_bearer_token = message.bearerToken
      if (map.HomeTimeline) updates.xcom_query_id = map.HomeTimeline
      chrome.storage.local.set(updates)
    })
  }

  if (message.type === 'XCOM_TOKENS_CAPTURED') {
    const updates = {}
    if (message.bearerToken) updates.xcom_bearer_token = message.bearerToken
    // HomeTimeline keeps its own key so the feed fetcher is unaffected.
    if (message.operation === 'HomeTimeline' && message.operationQueryId) {
      updates.xcom_query_id = message.operationQueryId
    }
    if (message.operation && message.operationQueryId) {
      chrome.storage.local.get('xcom_query_ids', (stored) => {
        const map = stored.xcom_query_ids || {}
        map[message.operation] = message.operationQueryId
        chrome.storage.local.set({ ...updates, xcom_query_ids: map })
      })
    } else if (Object.keys(updates).length) {
      chrome.storage.local.set(updates)
    }
  }

  if (message.type === 'FETCH_LOBSTERS') {
    fetch(message.url, { headers: { 'Accept': 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`Lobsters API error: ${r.status}`); return r.json() })
      .then((data) => sendResponse({ data }))
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_REDDIT') {
    fetch(message.url, { headers: { 'Accept': 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`Reddit API error: ${r.status}`); return r.json() })
      .then((data) => sendResponse({ data }))
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_RSS_FEED') {
    fetchRssFeed(message.url)
      .then((text) => sendResponse({ text }))
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'CLEAR_FEED_CACHE') {
    feedCache.linkedin = { data: null, timestamp: 0 }
    feedCache.xcom = { data: null, timestamp: 0 }
    sendResponse({ ok: true })
    return true
  }
})
