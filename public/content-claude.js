// Content script injected into claude.ai pages (runs in background tab).
// Reads a pending LinkedIn prompt from storage, submits it to Claude,
// waits for the response, parses the JSON, writes it back to storage,
// then asks the background to close this tab — all invisible to the user.

(async () => {
  const { claude_linkedin_prompt } = await chrome.storage.local.get('claude_linkedin_prompt')
  if (!claude_linkedin_prompt) return
  await chrome.storage.local.remove('claude_linkedin_prompt')

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // Wait for Claude's editor to appear
  const getEditor = async (attempts = 40) => {
    for (let i = 0; i < attempts; i++) {
      const el =
        document.querySelector('[contenteditable="true"][data-placeholder]') ||
        document.querySelector('div.ProseMirror') ||
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('[role="textbox"]')
      if (el) return el
      await sleep(500)
    }
    return null
  }

  const editor = await getEditor()
  if (!editor) {
    chrome.runtime.sendMessage({ type: 'CLOSE_CLAUDE_TAB' })
    return
  }

  editor.focus()
  document.execCommand('insertText', false, claude_linkedin_prompt)
  if (!editor.textContent?.trim()) {
    editor.textContent = claude_linkedin_prompt
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }

  await sleep(800)

  // Click the send button
  const sendBtn =
    document.querySelector('button[aria-label="Send Message"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('fieldset button:last-of-type') ||
    [...document.querySelectorAll('button')].find((b) => b.type === 'submit')
  if (sendBtn) sendBtn.click()

  // Scan the full page text for our JSON response — no fragile DOM selectors needed
  const extractJson = () => {
    const text = document.body?.innerText || ''
    // Match the exact shape we asked for
    const match = text.match(/\{[^{}]*"role"\s*:\s*"[^"]*"[^{}]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed.role ? parsed : null
    } catch {
      return null
    }
  }

  // Poll until response stabilises (text stops growing)
  let prevLen = 0
  let stableCount = 0
  for (let i = 0; i < 90; i++) {
    await sleep(1000)
    const len = (document.body?.innerText || '').length
    if (len > prevLen) {
      prevLen = len
      stableCount = 0
    } else if (len === prevLen && len > 200) {
      stableCount++
      if (stableCount >= 3) {
        const result = extractJson()
        if (result) {
          await chrome.storage.local.set({ claude_inferred_role: result })
        }
        break
      }
    }
  }

  // Close this background tab
  chrome.runtime.sendMessage({ type: 'CLOSE_CLAUDE_TAB' })
})()
