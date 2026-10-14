// Daily digest.
//
// Once a day the worker builds the same zip the Export button produces (one per
// feed, images included), stashes it, and opens a background claude.ai tab.
// content-claude.js attaches both zips, types the prompt, sends, and closes the
// tab. This runs with no page open, so the zip is assembled here rather than in
// the new-tab React app.
//
// Loaded by background.js via importScripts, so it shares that worker's globals:
// fetchXcomFeed, fetchLinkedinFeed and enrichXcomBatch come from there, and
// OpenFeedExport from export-core.js. All of those are only touched once an
// alarm or a message fires, well after every script has finished loading.

// Bump on every change here. Printed on load so a stale unpacked build is
// obvious from the console instead of being inferred from symptoms.
const DIGEST_VERSION = 8
console.log('[OpenFeed] digest v' + DIGEST_VERSION + ' (toolbar popup)')

const DIGEST_ALARM = 'openfeed-daily-digest'

const DIGEST_PROMPT = [
  'Summarize the main posts here. Avoid bullshit and PR and selly stuff, focus on',
  'tech substance and anything notable. Keep links so I can go to the original',
  'message.',
  '',
  'Two zips are attached, one from my X feed and one from my LinkedIn feed. Each',
  'holds an export.md plus an images/ folder; [imgN] tokens in the text mark where',
  'each image appeared, and images/index.md maps them to files. Read the charts and',
  'screenshots too, since some posts carry their real content only in an image.',
  '',
  'If export.md opens with a NOTE saying enrichment failed, say so up front instead',
  'of quietly summarizing around the gap.',
].join('\n')

// Images dominate the payload: a 50-post LinkedIn feed ran 9MB. The budget keeps
// one feed's zip transferable in a few messages, and anything past the cap is
// recorded in images/index.md rather than vanishing.
const DIGEST_MEDIA_BUDGET_BYTES = 8 * 1024 * 1024
const DIGEST_CHUNK_BYTES = 4 * 1024 * 1024
const DIGEST_MEDIA_CONCURRENCY = 6
// An unclaimed job is discarded rather than waiting to ambush a later tab.
const DIGEST_JOB_TTL_MS = 15 * 60 * 1000

/** Pending jobs, held in memory between the alarm and the claude.ai tab. */
let digestJobs = null
let digestTabId = null

function digestBytesToBase64(bytes) {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Claude's vision pipeline downsamples anything longer than ~1568px on its long
// edge, so pixels past that are bytes spent on detail the model never sees.
// Re-encoding to that cap is close to free in readable quality and buys a lot of
// budget: more of the feed's charts survive instead of being dropped at the cap.
// Quality 0.85 is deliberately conservative, since these are mostly screenshots
// and charts where small text has to stay legible.
const DIGEST_IMAGE_MAX_EDGE = 1568
const DIGEST_IMAGE_QUALITY = 0.85
// Below this, re-encoding tends to cost more than it saves.
const DIGEST_IMAGE_MIN_BYTES = 120 * 1024

/**
 * Shrinks an oversized image, returning the original bytes unchanged when that
 * is not worth doing. Runs on OffscreenCanvas, which the service worker has.
 *
 * Returns null for the converted name when nothing changed, so the caller only
 * rewrites the index entry if the format actually moved to JPEG.
 */
async function digestShrinkImage(bytes, ref) {
  if (bytes.length < DIGEST_IMAGE_MIN_BYTES) return { bytes }

  try {
    const bitmap = await createImageBitmap(new Blob([bytes]))
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > DIGEST_IMAGE_MAX_EDGE ? DIGEST_IMAGE_MAX_EDGE / longEdge : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    // White ground: flattening transparency to black ruins light-themed charts.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: DIGEST_IMAGE_QUALITY,
    })
    const out = new Uint8Array(await blob.arrayBuffer())

    // Re-encoding does not always win, especially on flat graphics that PNG
    // stores well. Keep whichever is smaller.
    if (out.length >= bytes.length) return { bytes }
    return { bytes: out, name: ref.file.replace(/\.[^.]+$/, '.jpg') }
  } catch (e) {
    // A format the decoder will not take is not worth failing the whole bundle.
    return { bytes }
  }
}

/**
 * Downloads referenced media within a byte budget. The worker holds the host
 * permissions so it fetches directly, and every skip or failure carries its
 * reason: a bundle that only says "failed" gives nothing to debug.
 */
async function digestFetchMedia(refs) {
  const results = new Array(refs.length)
  let cursor = 0
  let used = 0

  // One at a time cost ~630ms per image, so 50+ images meant a minute of pure
  // waiting. Six workers share the queue, which is about what the browser will
  // give us per host anyway; measured 6x faster on the same URLs. The budget is
  // still checked as each response lands, so the cap holds.
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= refs.length) return
      const ref = refs[index]

      if (used >= DIGEST_MEDIA_BUDGET_BYTES) {
        results[index] = { ref, reason: 'skipped: daily digest image budget reached' }
        continue
      }

      try {
        const r = await fetch(ref.url, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const raw = new Uint8Array(await r.arrayBuffer())
        if (!raw.length) throw new Error('empty response')

        const shrunk = await digestShrinkImage(raw, ref)
        // The index is generated from these same ref objects, so renaming here
        // keeps images/index.md pointing at the file actually written.
        if (shrunk.name) ref.file = shrunk.name

        used += shrunk.bytes.length
        results[index] = { ref, data: shrunk.bytes, savedBytes: raw.length - shrunk.bytes.length }
      } catch (e) {
        results[index] = { ref, reason: e.message || String(e) }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DIGEST_MEDIA_CONCURRENCY, refs.length) }, worker)
  )

  // Rebuilt in the original order so [imgN] numbering stays stable.
  const files = []
  const failed = []
  for (const entry of results) {
    if (!entry) continue
    if (entry.data) files.push({ name: entry.ref.file, data: entry.data })
    else failed.push({ ...entry.ref, reason: entry.reason })
  }

  return { files, failed }
}

/**
 * Builds one feed's zip. Enrichment failure is written into export.md, not just
 * logged: on an unattended run nobody sees a toast, and a bundle that looks
 * complete while missing every thread and article body is worse than one that
 * admits it.
 */
async function buildDigestBundle(kind) {
  const label = kind === 'xcom' ? 'X.com Feed' : 'LinkedIn Feed'
  const sourceUrl = kind === 'xcom' ? 'https://x.com/' : 'https://linkedin.com/'

  const items = kind === 'xcom' ? await fetchXcomFeed() : await fetchLinkedinFeed()
  if (!Array.isArray(items)) {
    throw new Error(items?.error || `${label}: feed fetch returned no items`)
  }

  let enrichment = {}
  let enrichmentNote = ''
  if (kind === 'xcom') {
    const ids = items.filter((i) => typeof i?.id === 'string').map((i) => i.id)
    try {
      enrichment = await enrichXcomBatch(ids)
    } catch (e) {
      enrichmentNote =
        `NOTE: X enrichment failed for this export (${e.message || e}). ` +
        'Threads, reply context, quoted text and article bodies are MISSING below. ' +
        'Do not treat these posts as complete.'
    }
  }

  const formatted = OpenFeedExport.formatCardItems({
    label,
    sourceUrl,
    items,
    enrichment,
    includeMedia: true,
  })

  const { files, failed } = await digestFetchMedia(formatted.media)
  const text = enrichmentNote ? `${enrichmentNote}\n\n${formatted.text}` : formatted.text

  const bytes = OpenFeedExport.buildBundleBytes({
    label,
    text,
    media: formatted.media,
    files,
    failed,
  })

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    label,
    filename: `${OpenFeedExport.slugify(label)}-${stamp}.zip`,
    base64: digestBytesToBase64(bytes),
    size: bytes.length,
    images: files.length,
    imagesFailed: failed.length,
  }
}

/**
 * Builds both bundles, then hands them to a background claude.ai tab.
 *
 * Nothing is written to disk. Saving the zips meant a data: URL through
 * chrome.downloads, and with Chrome's "ask where to save each file" setting on
 * that pops a dialog per file, which defeats the point of an unattended job.
 * The zips only ever need to reach claude.ai, so they stay in memory.
 */
async function runDailyDigest() {
  const jobs = []
  const errors = []

  for (const kind of ['xcom', 'linkedin']) {
    try {
      jobs.push(await buildDigestBundle(kind))
    } catch (e) {
      errors.push(`${kind}: ${e.message || e}`)
      console.error('[OpenFeed] digest build failed', kind, e)
    }
  }

  const status = {
    ran_at: new Date().toISOString(),
    built: jobs.map((j) => ({
      label: j.label,
      size: j.size,
      images: j.images,
      imagesFailed: j.imagesFailed,
    })),
    errors,
  }
  await chrome.storage.local.set({ openfeed_digest_status: status })

  if (!jobs.length) {
    console.error('[OpenFeed] daily digest produced nothing', errors)
    return status
  }

  // The tab is created first so its id is known before the job can be claimed.
  const tab = await chrome.tabs.create({ url: 'https://claude.ai/new', active: false })
  digestTabId = tab.id
  digestJobs = { prompt: DIGEST_PROMPT, files: jobs, createdAt: Date.now() }
  return status
}

function scheduleDailyDigest() {
  // 07:42 rather than 07:00: keeps the run off the hour, away from every other
  // daily job on the machine. Alarms fire on wake if the laptop was asleep.
  const next = new Date()
  next.setHours(7, 42, 0, 0)
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
  chrome.alarms.create(DIGEST_ALARM, {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  })
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DIGEST_ALARM) runDailyDigest()
})

chrome.runtime.onInstalled.addListener(scheduleDailyDigest)
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(DIGEST_ALARM, (existing) => {
    if (!existing) scheduleDailyDigest()
  })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The claude.ai content script asking what it should attach.
  if (message.type === 'DIGEST_PENDING') {
    // Only the tab this worker opened may claim the job. The content script
    // runs on every claude.ai page, so without this a digest pending in the
    // background latches onto whatever chat the user happens to open and dumps
    // two zips and a prompt into the message they were typing.
    if (!digestJobs || sender?.tab?.id !== digestTabId) {
      sendResponse({ pending: false })
      return
    }

    // A job nobody claimed is dropped rather than left to ambush a later tab.
    if (Date.now() - digestJobs.createdAt > DIGEST_JOB_TTL_MS) {
      digestJobs = null
      digestTabId = null
      sendResponse({ pending: false })
      return
    }
    sendResponse({
      pending: true,
      prompt: digestJobs.prompt,
      files: digestJobs.files.map((f, index) => ({
        index,
        filename: f.filename,
        size: f.size,
        chunks: Math.ceil(f.base64.length / DIGEST_CHUNK_BYTES),
      })),
    })
    return
  }

  // Zips run to several megabytes, so they move in slices, not one message.
  if (message.type === 'DIGEST_CHUNK') {
    const job = digestJobs?.files?.[message.fileIndex]
    if (!job) {
      sendResponse({ error: 'no such digest file' })
      return
    }
    const start = message.chunkIndex * DIGEST_CHUNK_BYTES
    sendResponse({ base64: job.base64.slice(start, start + DIGEST_CHUNK_BYTES) })
    return
  }

  if (message.type === 'DIGEST_DONE') {
    digestJobs = null
    digestTabId = null
    // The tab is deliberately left open. Closing it was worth a bug a day:
    // every attempt to detect "the answer has finished" raced the UI, and the
    // cost of guessing wrong is throwing away the summary the whole job exists
    // to produce. One background tab a day is the cheaper trade.
    chrome.storage.local.set({
      openfeed_digest_last: {
        at: new Date().toISOString(),
        ok: !!message.ok,
        note: message.note || '',
      },
    })
    return
  }

  // Manual trigger, so the whole path can be tested without waiting for 07:42.
  if (message.type === 'RUN_DIGEST_NOW') {
    runDailyDigest()
      .then((status) => sendResponse(status))
      .catch((e) => sendResponse({ error: e.message || String(e) }))
    return true
  }
})
