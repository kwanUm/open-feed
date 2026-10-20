// Toolbar popup: run the digest on demand, and show whether the scheduled run
// actually happened. The schedule was previously invisible, so a morning that
// silently did nothing looked identical to one that worked.

const $ = (id) => document.getElementById(id)

const ago = (iso) => {
  const then = new Date(iso).getTime()
  if (!then) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const when = (ts) => {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })} at ${time}`
}

const SETTINGS_KEY = 'openfeed_digest_settings'
const DEFAULT_SETTINGS = { enabled: true, time: '07:42' }

const loadSettings = async () => {
  const { [SETTINGS_KEY]: saved } = await chrome.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...saved }
}

const renderSettings = async () => {
  const { enabled, time } = await loadSettings()
  $('enabled').checked = enabled
  $('time').value = time
  $('time').disabled = !enabled
}

// The worker reschedules the alarm when it sees this key change.
const saveSettings = async () => {
  if (!$('time').value) return
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { enabled: $('enabled').checked, time: $('time').value },
  })
  $('time').disabled = !$('enabled').checked
}

const renderSchedule = async () => {
  const { enabled } = await loadSettings()
  const alarm = await chrome.alarms.get('openfeed-daily-digest')
  if (!enabled) {
    $('next').textContent = 'Off. Only runs when you press the button.'
    return
  }
  $('next').textContent = alarm
    ? `${when(alarm.scheduledTime)}\n(${Math.round((alarm.scheduledTime - Date.now()) / 60000)} min from now)`
    : 'No alarm registered. Reload the extension to schedule it.'
}

const renderLast = async () => {
  const { openfeed_digest_status: status, openfeed_digest_last: last } =
    await chrome.storage.local.get(['openfeed_digest_status', 'openfeed_digest_last'])

  if (!status) {
    $('last').textContent = 'Never run on this install.'
    return
  }

  const lines = [`Built ${ago(status.ran_at)}`]
  for (const b of status.built || []) {
    const mb = (b.size / 1024 / 1024).toFixed(1)
    lines.push(`  ${b.label}: ${mb}MB, ${b.images} images${b.imagesFailed ? `, ${b.imagesFailed} failed` : ''}`)
  }
  for (const e of status.errors || []) lines.push(`  error: ${e}`)

  // Whether it reached Claude is tracked separately from whether it built.
  if (last) {
    lines.push('')
    lines.push(`${last.ok ? 'Sent OK' : 'Send FAILED'} ${ago(last.at)}`)
    if (last.note) lines.push(`  ${last.note}`)
  } else {
    lines.push('')
    lines.push('No send recorded (the claude.ai step never reported back).')
  }

  $('last').textContent = lines.join('\n')
  const first = $('last')
  first.classList.toggle('bad', !!(status.errors || []).length || (last && !last.ok))
}

$('run').addEventListener('click', async () => {
  $('run').disabled = true
  $('run').textContent = 'Running…'
  $('live').textContent = 'Fetching feeds, enriching, downloading images. This takes a minute.'
  try {
    const status = await chrome.runtime.sendMessage({ type: 'RUN_DIGEST_NOW' })
    if (status?.error) throw new Error(status.error)
    $('live').textContent = 'Built. A claude.ai tab is open and sending.'
    await renderLast()
  } catch (e) {
    $('live').innerHTML = `<span class="bad">Failed: ${e.message || e}</span>`
  } finally {
    $('run').disabled = false
    $('run').textContent = 'Run digest now'
  }
})

$('open').addEventListener('click', () => {
  chrome.tabs.create({ url: 'index.html' })
})

$('enabled').addEventListener('change', saveSettings)
$('time').addEventListener('change', saveSettings)

chrome.alarms.onAlarm.addListener(renderSchedule)
chrome.storage.onChanged.addListener((changes, area) => {
  // The alarm is recreated just after the settings land, so re-read it a beat later.
  if (area === 'local' && changes[SETTINGS_KEY]) setTimeout(renderSchedule, 150)
})

renderSettings()
renderSchedule()
renderLast()
