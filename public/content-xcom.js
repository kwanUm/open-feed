// Content script injected into x.com pages (runs in the isolated extension context).
// Injects content-xcom-inject.js into the page's main world so it can intercept fetch,
// then relays the captured bearer token + GraphQL query ID to the background service
// worker via chrome.runtime.sendMessage. The background stores them for use when
// fetching the Home Timeline on behalf of the user.
const script = document.createElement('script')
script.src = chrome.runtime.getURL('content-xcom-inject.js')
document.documentElement.appendChild(script)

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'XCOM_TOKENS') return
  chrome.runtime.sendMessage({
    type: 'XCOM_TOKENS_CAPTURED',
    bearerToken: event.data.bearerToken,
    queryId: event.data.queryId,
  })
})
