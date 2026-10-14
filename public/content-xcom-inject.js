// Injected into the x.com page's main world (not the isolated extension context).
// Patches window.fetch to record every GraphQL operation the page issues, mapping
// operation name -> query id, and postMessages them to content-xcom.js which
// forwards them to the background service worker.
//
// Query ids are per-operation and baked into X's bundles, so the only way to call
// an operation on the user's behalf is to observe the page calling it first.
// HomeTimeline powers the feed; TweetDetail is what carries X Article bodies.
(function () {
  const originalFetch = window.fetch
  const seen = Object.create(null)

  const readHeader = (headers, name) => {
    if (!headers) return ''
    if (typeof headers.get === 'function') return headers.get(name) || ''
    return headers[name] || headers[name.toLowerCase()] || ''
  }

  window.fetch = function (...args) {
    try {
      const [url, options] = args
      const urlStr = typeof url === 'string' ? url : url?.url || ''
      const match = urlStr.match(/\/i\/api\/graphql\/([^/]+)\/([A-Za-z0-9_]+)/)
      if (match) {
        const queryId = match[1]
        const operation = match[2]
        const authHeader =
          readHeader(options?.headers, 'authorization') ||
          readHeader(url?.headers, 'authorization')
        if (seen[operation] !== queryId) {
          seen[operation] = queryId
          window.postMessage(
            {
              type: 'XCOM_TOKENS',
              bearerToken: String(authHeader).replace('Bearer ', ''),
              operation,
              operationQueryId: queryId,
            },
            '*'
          )
        }
      }
    } catch (e) {
      /* silently ignore */
    }
    return originalFetch.apply(this, args)
  }
})()
