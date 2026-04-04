(function () {
  const originalFetch = window.fetch
  window.fetch = function (...args) {
    try {
      const [url, options] = args
      const urlStr = typeof url === 'string' ? url : url?.url || ''
      if (urlStr.includes('/i/api/graphql/') && urlStr.includes('HomeTimeline')) {
        const headers = options?.headers || {}
        const authHeader = headers['authorization'] || headers['Authorization'] || ''
        const match = urlStr.match(/\/i\/api\/graphql\/([^/]+)\/HomeTimeline/)
        if (authHeader && match) {
          window.postMessage({
            type: 'XCOM_TOKENS',
            bearerToken: authHeader.replace('Bearer ', ''),
            queryId: match[1],
          }, '*')
        }
      }
    } catch (e) { /* silently ignore */ }
    return originalFetch.apply(this, args)
  }
})()
