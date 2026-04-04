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
