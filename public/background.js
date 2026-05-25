const BG_VERSION = 7 // bump to force SW update
console.log('background.js v' + BG_VERSION + ' loaded')

// Clear any uninstall URL left over from the upstream hackertab.dev codebase
chrome.runtime.setUninstallURL('')

chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: 'index.html', selected: true })
})

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
    .filter((el) => el.actor?.description?.text !== 'Promoted')
    .map((el) => {
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

      if (el.content) {
        // Try to extract images from various LinkedIn content structures
        const imgRoot = el.content?.['com.linkedin.voyager.feed.render.ImageComponent']?.images
          || el.content?.images || []
        for (const img of imgRoot) {
          const attrs = img?.attributes?.[0]
          const vecImg = attrs?.vectorImage || attrs?.['com.linkedin.common.VectorImage']
          if (vecImg) {
            const url = extractImageUrl(vecImg)
            if (url) mediaUrls.push(url)
          }
        }

        // Extract article link preview (thumbnail + title + domain)
        // LinkedIn nests this in content.navigationContext + content.title + content.description
        const contentNav = el.content?.navigationContext
        const contentTitle = el.content?.title?.text || el.content?.title?.accessibilityText
        const contentSubtitle = el.content?.description?.text || el.content?.landingPage?.title
        // Also check for article component patterns
        const articleTitle = el.content?.articleComponent?.title?.text
        const articleSubtitle = el.content?.articleComponent?.subtitle?.text
        const articleNav = el.content?.articleComponent?.navigationContext
        const articleImg = el.content?.articleComponent?.largeImage?.attributes?.[0]?.vectorImage
          || el.content?.articleComponent?.smallImage?.attributes?.[0]?.vectorImage

        // Try standard content pattern first, then article component
        const previewTitle = contentTitle || articleTitle
        const previewSubtitle = contentSubtitle || articleSubtitle || ''
        const previewNav = contentNav || articleNav
        const previewImgVec = el.content?.largeImage?.attributes?.[0]?.vectorImage
          || el.content?.smallImage?.attributes?.[0]?.vectorImage
          || articleImg

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

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_LINKEDIN_PROFILE') {
    fetchLinkedinProfile()
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_LINKEDIN_FULL_PROFILE') {
    fetchLinkedinFullProfile()
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'OPEN_CLAUDE_TAB') {
    chrome.storage.local.set({ claude_linkedin_prompt: message.prompt }, () => {
      // Open off-screen so the user never sees it; content-claude.js runs inside it
      chrome.windows.create({
        url: 'https://claude.ai/new',
        type: 'popup',
        left: -3000,
        top: 0,
        width: 1280,
        height: 900,
        focused: false,
      })
    })
    sendResponse({ ok: true })
    return true
  }

  if (message.type === 'CLOSE_CLAUDE_TAB') {
    if (sender.tab?.id) chrome.tabs.remove(sender.tab.id)
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

  if (message.type === 'XCOM_TOKENS_CAPTURED') {
    chrome.storage.local.set({
      xcom_bearer_token: message.bearerToken,
      xcom_query_id: message.queryId,
    })
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
