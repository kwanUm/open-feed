const BG_VERSION = 3 // bump to force SW update
console.log('background.js v' + BG_VERSION + ' loaded')

const uninstallUrl = `https://hackertab.dev/uninstall.html`
if (chrome.runtime.setUninstallURL) {
  chrome.runtime.setUninstallURL(uninstallUrl)
}

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

  const resp = await fetch(
    'https://www.linkedin.com/voyager/api/feed/updatesV2?count=40&q=feed',
    {
      headers: {
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
        'cookie': `JSESSIONID="${csrfToken}"; li_at=${liAt}`,
      },
    }
  )

  if (resp.status === 401 || resp.status === 403) {
    return { error: 'NOT_LOGGED_IN', source: 'linkedin' }
  }

  if (!resp.ok) {
    return { error: `LinkedIn API error: ${resp.status}`, source: 'linkedin' }
  }

  const data = await resp.json()
  const articles = (data.elements || [])
    .filter((el) => el.commentary?.text?.text)
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

      // Extract media images and link preview from LinkedIn content
      const mediaUrls = []
      let linkPreview = null

      if (el.content) {
        // Helper to extract image URL from a VectorImage object
        const extractImageUrl = (vecImg) => {
          if (!vecImg?.rootUrl || !vecImg?.artifacts?.length) return ''
          const largest = vecImg.artifacts.reduce((a, b) => (b.width > a.width ? b : a), vecImg.artifacts[0])
          return vecImg.rootUrl + largest.fileIdentifyingUrlPathSegment
        }

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

      return {
        id: el.updateMetadata?.urn || el.entityUrn || String(Date.now()),
        url: shareAction?.url || el.actor?.navigationContext?.actionTarget || '',
        title: el.actor?.name?.text || 'LinkedIn Post',
        source: 'linkedin',
        tags: [],
        comments_count: el.socialDetail?.totalSocialActivityCounts?.numComments || 0,
        points_count: el.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
        image_url: avatarUrl,
        published_at: Date.now(),
        description: el.commentary?.text?.text || '',
        author_title: el.actor?.description?.text || '',
        time_ago: el.actor?.subDescription?.accessibilityText || '',
        shares_count: el.socialDetail?.totalSocialActivityCounts?.numShares || 0,
        media_urls: mediaUrls,
        link_preview: linkPreview,
      }
    })

  feedCache.linkedin = { data: articles, timestamp: now }
  return articles
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

  const variables = encodeURIComponent(
    JSON.stringify({
      count: 40,
      includePromotedContent: false,
      requestContext: 'launch',
      withCommunity: true,
    })
  )
  const features = encodeURIComponent(JSON.stringify(XCOM_FEATURES))

  const resp = await fetch(
    `https://x.com/i/api/graphql/${queryId}/HomeTimeline?variables=${variables}&features=${features}`,
    {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'x-csrf-token': ct0,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'content-type': 'application/json',
        'cookie': `ct0=${ct0}; auth_token=${authToken}`,
      },
    }
  )

  if (resp.status === 401 || resp.status === 403) {
    return { error: 'NOT_LOGGED_IN', source: 'xcom' }
  }

  if (!resp.ok) {
    return { error: `X.com API error: ${resp.status}`, source: 'xcom' }
  }

  const data = await resp.json()
  const instructions = data?.data?.home?.home_timeline_urt?.instructions || []
  const addEntries = instructions.find((i) => i.type === 'TimelineAddEntries')
  const entries = addEntries?.entries || []

  const articles = entries
    .filter((entry) => entry.entryId?.startsWith('tweet-'))
    .map((entry) => {
      const tweetResult = entry.content?.itemContent?.tweet_results?.result
      if (!tweetResult) return null

      const tweet = tweetResult.__typename === 'TweetWithVisibilityResults'
        ? tweetResult.tweet
        : tweetResult

      if (!tweet?.legacy) return null

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
      }
    })
    .filter(Boolean)

  feedCache.xcom = { data: articles, timestamp: now }
  return articles
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.type === 'CLEAR_FEED_CACHE') {
    feedCache.linkedin = { data: null, timestamp: 0 }
    feedCache.xcom = { data: null, timestamp: 0 }
    sendResponse({ ok: true })
    return true
  }
})
