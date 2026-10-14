// Content script injected into claude.ai pages (runs in a background tab).
//
// Two jobs, both invisible to the user:
//  1. Daily digest: pull the feed zips the service worker built, attach them to
//     the composer, type the summary prompt, send, then close the tab.
//  2. Onboarding role inference: submit a pending prompt, wait for the JSON
//     reply, write it back to storage, close the tab.
//
// Both drive claude.ai's own UI, so the selectors below are deliberately
// over-specified: each one has fallbacks because the composer markup changes.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const sendToWorker = (message) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message })
        return
      }
      resolve(response || {})
    })
  })

/** Waits for the composer's contenteditable to exist. */
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

const findSendButton = () =>
  document.querySelector('button[aria-label="Send Message"]') ||
  document.querySelector('button[aria-label="Send message"]') ||
  document.querySelector('button[data-testid="send-button"]') ||
  document.querySelector('fieldset button:last-of-type') ||
  [...document.querySelectorAll('button')].find((b) => b.type === 'submit')

const typeIntoEditor = (editor, text) => {
  editor.focus()
  document.execCommand('insertText', false, text)
  if (!editor.textContent?.trim()) {
    editor.textContent = text
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

const base64ToBytes = (base64) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ---------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------

/** Reassembles one zip from the worker's base64 slices. */
const pullDigestFile = async (meta) => {
  let base64 = ''
  for (let c = 0; c < meta.chunks; c++) {
    const part = await sendToWorker({
      type: 'DIGEST_CHUNK',
      fileIndex: meta.index,
      chunkIndex: c,
    })
    if (part.error) throw new Error(`${meta.filename}: ${part.error}`)
    base64 += part.base64 || ''
  }
  const bytes = base64ToBytes(base64)
  if (bytes.length !== meta.size) {
    throw new Error(`${meta.filename}: expected ${meta.size} bytes, assembled ${bytes.length}`)
  }
  return new File([bytes], meta.filename, { type: 'application/zip' })
}

const makeTransfer = (files) => {
  const transfer = new DataTransfer()
  files.forEach((file) => transfer.items.add(file))
  return transfer
}

const setInputFiles = (input, files) => {
  input.files = makeTransfer(files).files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Reveals the hidden <input type="file">. claude.ai does not render one until
 * the "Add files" menu is opened, so a cold page has nothing to set .files on.
 * The menu is dismissed again afterwards: only the input needs to exist, and an
 * open menu swallows later clicks on the send button.
 */
const revealFileInput = async () => {
  const trigger = [...document.querySelectorAll('button')].find((b) => {
    const label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase()
    return label.includes('add files') || label.includes('attach') || label.includes('upload')
  })
  if (!trigger) return null

  trigger.click()
  for (let i = 0; i < 20; i++) {
    await sleep(150)
    const input = document.querySelector('input[type="file"]')
    if (input) {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
      await sleep(150)
      return input
    }
  }
  return null
}

/**
 * Full HTML5 drag sequence. A lone drop event is ignored by most React
 * dropzones: they only arm themselves after dragenter/dragover, and they read
 * dataTransfer.types to decide whether the payload is a file at all.
 */
const dropOnto = (target, files) => {
  const transfer = makeTransfer(files)
  const event = (type) =>
    new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer })
  target.dispatchEvent(event('dragenter'))
  target.dispatchEvent(event('dragover'))
  const dropped = target.dispatchEvent(event('drop'))
  return dropped
}

/**
 * Hands files to the composer, trying each mechanism the UI actually supports
 * and reporting which one took. Returns the method name so a failure says what
 * was attempted rather than just "it did not work".
 */
const attachFiles = async (editor, files) => {
  const existing = document.querySelector('input[type="file"]')
  if (existing) {
    setInputFiles(existing, files)
    return 'input'
  }

  const revealed = await revealFileInput()
  if (revealed) {
    setInputFiles(revealed, files)
    return 'input-after-menu'
  }

  const target = document.querySelector('div.ProseMirror') || editor || document.body
  if (dropOnto(target, files)) return 'drop'

  // Last resort: claude.ai accepts pasted files on the composer.
  ;(editor || target).dispatchEvent(
    new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: makeTransfer(files),
    })
  )
  return 'paste'
}

/**
 * Attachments upload asynchronously and the send button stays disabled until
 * they finish, so this waits for that rather than racing it.
 */
const waitForUploads = async (expected, attempts = 60) => {
  for (let i = 0; i < attempts; i++) {
    await sleep(1000)
    const chips = document.querySelectorAll(
      '[data-testid="file-thumbnail"], [data-testid*="attachment"], [class*="thumbnail"]'
    )
    const btn = findSendButton()
    const ready = btn && !btn.disabled
    if (chips.length >= expected && ready) return true
    // Fall back to the button alone if the chip markup has been renamed.
    if (i > 15 && ready) return true
  }
  return false
}

const runDigest = async (job) => {
  const editor = await getEditor()
  if (!editor) throw new Error('composer never appeared')

  const files = []
  for (const meta of job.files) files.push(await pullDigestFile(meta))

  const how = await attachFiles(editor, files)
  const uploaded = await waitForUploads(files.length)
  if (!uploaded) {
    // Say what the page actually looked like, so a failed run is diagnosable
    // from the stored note alone rather than needing a live repro.
    const btn = findSendButton()
    throw new Error(
      `attachments did not upload. method=${how} ` +
        `fileInputs=${document.querySelectorAll('input[type="file"]').length} ` +
        `chips=${document.querySelectorAll('[data-testid="file-thumbnail"],[data-testid*="attachment"],[class*="thumbnail"]').length} ` +
        `sendBtn=${btn ? (btn.disabled ? 'disabled' : 'enabled') : 'missing'}`
    )
  }

  typeIntoEditor(editor, job.prompt)
  await sleep(800)

  const btn = findSendButton()
  if (!btn) throw new Error(`send button not found (attached via ${how})`)
  if (btn.disabled) throw new Error(`send button disabled (attached via ${how})`)
  btn.click()

  // Confirm the answer actually started, then stop touching the page. The tab
  // is left open for the user to read, so there is no teardown to race and no
  // need to detect when Claude has finished.
  //
  // A fixed character threshold is useless here: claude.ai's sidebar lists every
  // past conversation, so the page is already tens of thousands of characters
  // before Claude writes anything. Growth past a baseline taken at send time is
  // the only reliable signal.
  const baseline = (document.body?.innerText || '').length
  let waited = 0

  for (let i = 0; i < 180; i++) {
    await sleep(1000)
    waited = i + 1
    if ((document.body?.innerText || '').length > baseline + 200) {
      return `attached ${files.length} file(s) via ${how}; response started after ${waited}s`
    }
  }

  throw new Error(`sent, but no response appeared within ${waited}s (attached via ${how})`)
}

// ---------------------------------------------------------------------------
// Onboarding role inference (pre-existing behaviour)
// ---------------------------------------------------------------------------

const runRolePrompt = async (prompt) => {
  const editor = await getEditor()
  if (!editor) {
    chrome.runtime.sendMessage({ type: 'CLOSE_CLAUDE_TAB' })
    return
  }

  typeIntoEditor(editor, prompt)
  await sleep(800)

  const sendBtn = findSendButton()
  if (sendBtn) sendBtn.click()

  // Scan the full page text for our JSON response, no fragile DOM selectors.
  const extractJson = () => {
    const text = document.body?.innerText || ''
    const match = text.match(/\{[^{}]*"role"\s*:\s*"[^"]*"[^{}]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed.role ? parsed : null
    } catch {
      return null
    }
  }

  // Poll until the response stabilises (text stops growing).
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

  chrome.runtime.sendMessage({ type: 'CLOSE_CLAUDE_TAB' })
}

// ---------------------------------------------------------------------------

;(async () => {
  // The digest is checked first: it owns this tab when the worker opened one.
  const job = await sendToWorker({ type: 'DIGEST_PENDING' })
  if (job?.pending) {
    try {
      const note = await runDigest(job)
      await sendToWorker({ type: 'DIGEST_DONE', ok: true, note })
    } catch (e) {
      console.error('[OpenFeed] digest send failed', e)
      await sendToWorker({ type: 'DIGEST_DONE', ok: false, note: e.message || String(e) })
    }
    return
  }

  const { claude_linkedin_prompt } = await chrome.storage.local.get('claude_linkedin_prompt')
  if (!claude_linkedin_prompt) return
  await chrome.storage.local.remove('claude_linkedin_prompt')
  await runRolePrompt(claude_linkedin_prompt)
})()
