import clsx from 'clsx'
import { useEffect, useLayoutEffect } from 'react'
import { DNDLayout } from 'src/components/Layout'
import { trackPageView } from 'src/lib/analytics'
import { useUserPreferences } from 'src/stores/preferences'
import { AppContentLayout } from './components/Layout'
import { lazyImport } from './utils/lazyImport'
const { OnboardingModal } = lazyImport(() => import('src/features/onboarding'), 'OnboardingModal')

const intersectionCallback = (entries: IntersectionObserverEntry[]) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) {
      document.documentElement.classList.remove('dndState')
    } else {
      document.documentElement.classList.add('dndState')
    }
  })
}

export const App = () => {
  const {
    maxVisibleCards,
    onboardingCompleted,
    isDNDModeActive,
    DNDDuration,
    setDNDDuration,
    smoothScroll,
  } = useUserPreferences()

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--user-cards-count', maxVisibleCards.toString())
  }, [maxVisibleCards])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('smoothScroll', smoothScroll)
  }, [smoothScroll])

  useEffect(() => {
    document.body.classList.remove('preload')
  }, [])

  useEffect(() => {
    trackPageView('home', isDNDModeActive())
    if (!isDNDModeActive() && DNDDuration !== 'never') {
      setDNDDuration('never')
    }
  }, [DNDDuration, isDNDModeActive, setDNDDuration])

  useLayoutEffect(() => {
    let dndContent = document.querySelector('.DNDContent')
    let observer = new IntersectionObserver(intersectionCallback, {
      threshold: 0.1,
    })

    if (dndContent) {
      observer.observe(dndContent)
    } else {
      document.documentElement.classList.remove('dndState')
    }

    return () => {
      observer.disconnect()
    }
  }, [DNDDuration])

  return (
    <>
      {!onboardingCompleted && <OnboardingModal />}
      <div className="layoutLayers hideScrollBar cardsLayout">
        {isDNDModeActive() && <DNDLayout />}
        <AppContentLayout />
      </div>
    </>
  )
}
