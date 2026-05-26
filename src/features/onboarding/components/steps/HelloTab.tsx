import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { AiFillMobile, AiFillSecurityScan } from 'react-icons/ai'
import { BsArrowRight, BsFillGearFill } from 'react-icons/bs'
import { FaDatabase, FaPaintBrush, FaRobot, FaServer } from 'react-icons/fa'
import { FaLinkedin } from 'react-icons/fa6'
import { RiDeviceFill } from 'react-icons/ri'
import { TbDots } from 'react-icons/tb'
import { Tag, useRemoteConfigStore } from 'src/features/remoteConfig'
import { useUserPreferences } from 'src/stores/preferences'
import { Occupation } from '../../types'

const OCCUPATIONS: Occupation[] = [
  {
    title: 'Front-End Engineer',
    value: 'frontend',
    icon: FaPaintBrush,
    sources: ['devto', 'github', 'medium', 'hackernoon'],
    tags: ['frontend', 'javascript', 'typescript', 'css', 'react', 'vue.js', 'angularjs'],
  },
  {
    title: 'Back-End Engineer',
    value: 'backend',
    icon: BsFillGearFill,
    sources: ['devto', 'github', 'medium', 'hackernoon'],
    tags: ['backend', 'go', 'php', 'ruby', 'rust', 'r'],
  },
  {
    title: 'Full Stack Engineer',
    icon: RiDeviceFill,
    value: 'fullstack',
    sources: ['devto', 'github', 'medium', 'hackernoon'],
    tags: ['webdev', 'javascript', 'typescript', 'php', 'devops'],
  },
  {
    title: 'Mobile',
    value: 'mobile',
    icon: AiFillMobile,
    sources: ['reddit', 'github', 'medium', 'hackernoon'],
    tags: ['mobile', 'android', 'kotlin', 'java', 'ios', 'swift', 'objectivec', 'react native', 'flutter'],
  },
  {
    title: 'Devops Engineer',
    value: 'devops',
    icon: FaServer,
    sources: ['hackernoon', 'github', 'reddit', 'hackernews'],
    tags: ['devops', 'kubernetes', 'docker', 'bash'],
  },
  {
    title: 'Data Engineer',
    value: 'data',
    icon: FaDatabase,
    sources: ['hackernoon', 'github', 'reddit', 'devto'],
    tags: ['data science', 'python', 'artificial intelligence', 'machine learning'],
  },
  {
    title: 'Security Engineer',
    value: 'security',
    icon: AiFillSecurityScan,
    sources: ['hackernoon', 'github', 'reddit', 'devto'],
    tags: ['security', 'cpp', 'bash', 'python'],
  },
  {
    title: 'ML Engineer',
    value: 'ai',
    icon: FaRobot,
    sources: ['github', 'hackernoon', 'hackernews', 'devto'],
    tags: ['artificial intelligence', 'machine learning', 'python'],
  },
  {
    title: 'Other',
    value: 'other',
    icon: TbDots,
    sources: ['hackernews', 'github', 'reddit', 'devto'],
    tags: ['webdev', 'mobile'],
  },
]

const VALID_SOURCES = ['github', 'hackernews', 'devto', 'reddit', 'medium', 'hackernoon', 'freecodecamp', 'lobsters', 'linkedin', 'xcom']
const VALID_ROLES = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data', 'security', 'ai', 'other']

function buildClaudePrompt(profile: { name: string; headline: string; summary: string; positions: string; skills: string }) {
  return `You are helping set up a developer news feed reader called OpenFeed. Based on the LinkedIn profile below, determine the most relevant configuration.

Profile:
Name: ${profile.name}
Headline: ${profile.headline}
About: ${profile.summary || '(not provided)'}
Experience:
${profile.positions || '(not provided)'}
Skills: ${profile.skills || '(not provided)'}

Respond ONLY with a JSON object in this exact format — no explanation, no markdown, just the raw JSON:
{"role":"<one of: frontend|backend|fullstack|mobile|devops|data|security|ai|other>","sources":["<3-5 from: github, hackernews, devto, reddit, medium, hackernoon, freecodecamp, lobsters>"],"tags":["<3-8 relevant tech topics from: javascript, typescript, python, go, rust, java, react, css, frontend, backend, webdev, devops, kubernetes, docker, mobile, android, ios, data science, machine learning, artificial intelligence, security>"]}`.trim()
}

function sendMessageToBackground(type: string, payload?: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      reject(new Error('Extension API not available'))
      return
    }
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      resolve(response)
    })
  })
}

type Step = 'method' | 'fetching' | 'waiting-claude' | 'detected' | 'manual'

export const HelloTab = () => {
  const {
    markOnboardingAsCompleted,
    setCardSettings,
    setCards,
    setTags,
    setOccupation,
    occupation,
  } = useUserPreferences()

  const { tags: allTags } = useRemoteConfigStore()
  const [step, setStep] = useState<Step>('method')
  const [detectedOcc, setDetectedOcc] = useState<Occupation | null>(null)
  const [detectedSources, setDetectedSources] = useState<string[] | null>(null)
  const [detectedTagValues, setDetectedTagValues] = useState<string[] | null>(null)
  const [analyzeError, setAnalyzeError] = useState('')
  const [manualSelection, setManualSelection] = useState<string | null>(null)

  // Listen for Claude's response written back to storage by content-claude.js
  useEffect(() => {
    if (step !== 'waiting-claude') return
    if (typeof chrome === 'undefined' || !chrome?.storage) return

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!changes.claude_inferred_role?.newValue) return
      const parsed = changes.claude_inferred_role.newValue
      chrome.storage.local.remove('claude_inferred_role')
      if (parsed.error) {
        setAnalyzeError(`Claude error: ${parsed.error}. Please choose manually.`)
        setStep('manual')
        return
      }
      if (!parsed.role) return
      const occ = OCCUPATIONS.find((o) => o.value === parsed.role) || OCCUPATIONS.find((o) => o.value === 'other')!
      const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((s: string) => VALID_SOURCES.includes(s)) : occ.sources
      const tagValues = Array.isArray(parsed.tags) ? parsed.tags : occ.tags
      setDetectedOcc(occ)
      setDetectedSources(sources.length ? sources : occ.sources)
      setDetectedTagValues(tagValues.length ? tagValues : occ.tags)
      setStep('detected')
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [step])

  const applyOccupation = (occ: Occupation, sources?: string[], tagValues?: string[]) => {
    const finalSources = sources || occ.sources
    const finalTagValues = tagValues || occ.tags
    setOccupation(occ.value)
    setCards(finalSources.map((source, index) => ({ id: index, name: source, type: 'supported' as const })))
    const userTags = finalTagValues
      .map((tag) => allTags.find((t) => t.value === tag))
      .filter(Boolean) as Tag[]
    setTags(userTags)
    for (const source of finalSources) {
      setCardSettings(source, { language: finalTagValues[0], sortBy: 'published_at' })
    }
    markOnboardingAsCompleted()
  }

  // Listen for LinkedIn profile result written to storage by background.js
  useEffect(() => {
    if (step !== 'fetching') return
    if (typeof chrome === 'undefined' || !chrome?.storage) return

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!changes.linkedin_profile_result?.newValue) return
      const profile = changes.linkedin_profile_result.newValue
      chrome.storage.local.remove('linkedin_profile_result')
      if (profile?.error) {
        setAnalyzeError(
          profile.error === 'NOT_LOGGED_IN'
            ? 'Not logged into LinkedIn — please choose your role manually.'
            : `LinkedIn error: ${profile.error}`
        )
        setStep('manual')
        return
      }
      const prompt = buildClaudePrompt(profile)
      sendMessageToBackground('OPEN_CLAUDE_TAB', { prompt })
        .then(() => setStep('waiting-claude'))
        .catch((e: any) => {
          setAnalyzeError(`Error: ${e.message}. Please choose manually.`)
          setStep('manual')
        })
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [step])

  const handleLinkedinClaude = async () => {
    setAnalyzeError('')
    try {
      await sendMessageToBackground('FETCH_LINKEDIN_FULL_PROFILE')
      setStep('fetching')
    } catch (e: any) {
      setAnalyzeError(`Error: ${e.message}. Please choose manually.`)
      setStep('manual')
    }
  }

  const handleManualStart = () => {
    setStep('manual')
    setAnalyzeError('')
  }

  const handleManualDone = () => {
    const selectedOcc = OCCUPATIONS.find((o) => o.title === (manualSelection || occupation))
    if (selectedOcc) applyOccupation(selectedOcc)
    else markOnboardingAsCompleted()
  }

  // ── Method selection ──────────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <div>
        <div className="tabHeader">
          <h1 className="tabTitle">👋 Welcome to OpenFeed</h1>
          <p className="tabBody">Let's personalise your feed. We can auto-detect your setup from LinkedIn using Claude AI, or you can choose manually.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <button
            className="positiveButton"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, padding: '12px 28px' }}
            onClick={handleLinkedinClaude}>
            <FaLinkedin />
            Analyse with LinkedIn + Claude
          </button>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--secondary-text-color)', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}
            onClick={handleManualStart}>
            Choose manually instead
          </button>
        </div>
        <div className="tabFooter" />
      </div>
    )
  }

  // ── Fetching LinkedIn ─────────────────────────────────────────────────────
  if (step === 'fetching') {
    return (
      <div>
        <div className="tabHeader">
          <h1 className="tabTitle">Reading your LinkedIn profile…</h1>
          <p className="tabBody" style={{ color: 'var(--secondary-text-color)' }}>Fetching your experience and skills.</p>
        </div>
        {spinner}
      </div>
    )
  }

  // ── Waiting for Claude ────────────────────────────────────────────────────
  if (step === 'waiting-claude') {
    return (
      <div>
        <div className="tabHeader">
          <h1 className="tabTitle">Claude is analysing your profile…</h1>
          <p className="tabBody" style={{ color: 'var(--secondary-text-color)' }}>
            This usually takes 10–20 seconds.
          </p>
        </div>
        {spinner}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--secondary-text-color)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            onClick={handleManualStart}>
            Skip and choose manually
          </button>
        </div>
      </div>
    )
  }

  // ── Detected by Claude ────────────────────────────────────────────────────
  if (step === 'detected' && detectedOcc) {
    return (
      <div>
        <div className="tabHeader">
          <h1 className="tabTitle">Claude detected your setup</h1>
          <p className="tabBody">Based on your LinkedIn profile:</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 16px' }}>
          <div style={{ border: '2px solid #6366f1', borderRadius: 12, padding: '20px 40px', textAlign: 'center', minWidth: 180 }}>
            <detectedOcc.icon style={{ fontSize: 32, color: '#818cf8', display: 'block', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{detectedOcc.title}</p>
            {detectedSources && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--secondary-text-color)' }}>
                Sources: {detectedSources.join(', ')}
              </p>
            )}
            {detectedTagValues && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--secondary-text-color)' }}>
                Topics: {detectedTagValues.slice(0, 5).join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="tabFooter">
          <button
            className="positiveButton"
            onClick={() => applyOccupation(detectedOcc, detectedSources ?? undefined, detectedTagValues ?? undefined)}>
            <BsArrowRight /> Apply this setup
          </button>
          <button
            onClick={handleManualStart}
            style={{ background: 'none', border: 'none', color: 'var(--secondary-text-color)', cursor: 'pointer', fontSize: 14 }}>
            Change it
          </button>
        </div>
      </div>
    )
  }

  // ── Manual selection ──────────────────────────────────────────────────────
  return (
    <div>
      <div className="tabHeader">
        <h1 className="tabTitle">Choose your role</h1>
        {analyzeError && (
          <p style={{ textAlign: 'center', color: '#f87171', fontSize: 13, margin: '0 16px' }}>{analyzeError}</p>
        )}
        {!analyzeError && <p className="tabBody">Select your developer role to personalise your feed.</p>}
      </div>
      <div className="occupations">
        {OCCUPATIONS.map((occ) => {
          const selected = manualSelection === occ.title || (!manualSelection && occupation === occ.title)
          return (
            <button
              key={occ.title}
              onClick={() => setManualSelection(occ.title)}
              className={clsx('occupation', selected && 'active')}>
              <span><occ.icon className="occupationIcon" /></span>
              <h3 className="occupationTitle">{occ.title}</h3>
            </button>
          )
        })}
      </div>
      <div className="tabFooter">
        {(manualSelection || occupation) && (
          <button className="positiveButton" onClick={handleManualDone}>
            <BsArrowRight /> Start now
          </button>
        )}
        <button
          style={{ background: 'none', border: 'none', color: 'var(--secondary-text-color)', cursor: 'pointer', fontSize: 14 }}
          onClick={markOnboardingAsCompleted}>
          Skip
        </button>
      </div>
    </div>
  )
}

const spinner = (
  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
    <div style={{ width: 40, height: 40, border: '3px solid var(--card-border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)
