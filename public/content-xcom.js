// Content script injected into x.com pages (runs in the isolated extension context).
//
// Two jobs:
//  1. Scrape X's JS bundles for the full GraphQL operation -> query id map. Query
//     ids are per-operation and baked into the bundles, so this is the only way to
//     call an operation on the user's behalf. Scraping beats waiting to intercept
//     one, because the operation we need for X Article bodies is never issued on
//     the timeline.
//  2. Inject content-xcom-inject.js into the page's main world to catch the bearer
//     token and any operation ids from live requests, as a second source.
const script = document.createElement('script')
script.src = chrome.runtime.getURL('content-xcom-inject.js')
document.documentElement.appendChild(script)

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'XCOM_TOKENS') return
  chrome.runtime.sendMessage({
    type: 'XCOM_TOKENS_CAPTURED',
    bearerToken: event.data.bearerToken,
    operation: event.data.operation,
    operationQueryId: event.data.operationQueryId,
  })
})

const scrapeQueryIds = async () => {
  try {
    const srcs = [...document.querySelectorAll('script[src]')]
      .map((s) => s.src)
      .filter((s) => s.includes('abs.twimg.com') && s.endsWith('.js'))
    if (!srcs.length) return

    const operations = {}
    let bearerToken = ''

    for (const src of srcs) {
      try {
        const text = await (await fetch(src)).text()
        const re = /queryId:"([^"]+)",operationName:"([A-Za-z0-9_]+)"/g
        let match
        while ((match = re.exec(text))) operations[match[2]] = match[1]
        if (!bearerToken) {
          const bt = text.match(/AAAAAAAAA[A-Za-z0-9%]{40,}/)
          if (bt) bearerToken = bt[0]
        }
      } catch (e) {
        /* one bundle failing is fine, others may still carry the map */
      }
    }

    if (Object.keys(operations).length) {
      chrome.runtime.sendMessage({ type: 'XCOM_QUERY_IDS_SCRAPED', operations, bearerToken })
    }
  } catch (e) {
    /* never break the page */
  }
}

// Bundles are only present once the app shell has rendered.
if (document.readyState === 'complete') setTimeout(scrapeQueryIds, 1500)
else window.addEventListener('load', () => setTimeout(scrapeQueryIds, 1500))
