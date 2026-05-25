import { Tag } from 'src/features/remoteConfig'
import localStateStore from 'src/utils/LocalStateStorage'
import { capitalize } from 'src/utils/String'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  CardSettingsType,
  DNDDuration,
  ListingMode,
  SelectedCard,
  SupportedCardType,
  Theme,
} from '../types'

export type UserPreferencesState = {
  userSelectedTags: Tag[]
  theme: Theme
  openLinksNewTab: boolean
  onboardingCompleted: boolean
  onboardingResult?: {
    title: string
    sources: string[]
    tags: string[]
  } | null
  occupation: string | null
  listingMode: ListingMode
  maxVisibleCards: number
  cards: SelectedCard[]
  cardsSettings: Record<string, CardSettingsType>
  firstSeenDate: number
  userCustomCards: SupportedCardType[]
  DNDDuration: DNDDuration
  showReadPosts: boolean
  smoothScroll: boolean
}

type UserPreferencesStoreActions = {
  setTheme: (theme: Theme) => void
  setOpenLinksNewTab: (openLinksNewTab: boolean) => void
  setListingMode: (listingMode: ListingMode) => void
  setCards: (selectedCards: SelectedCard[]) => void
  removeCard: (cardName: string) => void
  setTags: (selectedTags: Tag[]) => void
  followTag: (tag: Tag) => void
  unfollowTag: (tag: Tag) => void
  setMaxVisibleCards: (maxVisibleCards: number) => void
  setCardSettings: (card: string, settings: CardSettingsType) => void
  clearCardSettingsLanguages: () => void
  setOccupation: (occupation: string | null) => void
  markOnboardingAsCompleted: () => void
  setUserCustomCards: (cards: SupportedCardType[]) => void
  updateCardOrder: (prevIndex: number, newIndex: number) => void
  setDNDDuration: (value: DNDDuration) => void
  isDNDModeActive: () => boolean
  setShowReadPosts: (value: boolean) => void
  setSmoothScroll: (value: boolean) => void
}

export const useUserPreferences = create(
  persist<UserPreferencesState & UserPreferencesStoreActions>(
    (set, get) => ({
      userSelectedTags: [
        {
          value: 'javascript',
          label: 'Javascript',
        },
      ],
      occupation: null,
      cardsSettings: {},
      maxVisibleCards: 4,
      theme: 'dark',
      onboardingCompleted: false,
      listingMode: 'normal',
      openLinksNewTab: true,
      firstSeenDate: Date.now(),
      cards: [
        { id: 0, name: 'github', type: 'supported' },
        { id: 1, name: 'hackernews', type: 'supported' },
        { id: 2, name: 'devto', type: 'supported' },
        { id: 3, name: 'reddit', type: 'supported' },
      ],
      userCustomCards: [],
      DNDDuration: 'never',
      showReadPosts: true,
      smoothScroll: false,
      setListingMode: (listingMode: ListingMode) => set({ listingMode }),
      setTheme: (theme: Theme) => set({ theme }),
      setOpenLinksNewTab: (openLinksNewTab: boolean) => set({ openLinksNewTab }),
      setCards: (selectedCards: SelectedCard[]) => set({ cards: selectedCards }),
      setTags: (selectedTags: Tag[]) => set({ userSelectedTags: selectedTags }),
      setMaxVisibleCards: (maxVisibleCards: number) => set({ maxVisibleCards }),
      setCardSettings: (card: string, settings: CardSettingsType) =>
        set((state) => ({
          cardsSettings: {
            ...state.cardsSettings,
            [card]: { ...state.cardsSettings[card], ...settings },
          },
        })),
      clearCardSettingsLanguages: () =>
        set((state) => ({
          cardsSettings: Object.fromEntries(
            Object.entries(state.cardsSettings).map(([card, settings]) => [
              card,
              { ...settings, language: undefined },
            ])
          ),
        })),
      markOnboardingAsCompleted: () =>
        set(() => ({
          onboardingCompleted: true,
        })),
      setOccupation: (occupation: string | null) =>
        set(() => ({
          occupation: occupation,
        })),
      setUserCustomCards: (cards: SupportedCardType[]) => set({ userCustomCards: cards }),
      updateCardOrder: (prevIndex: number, newIndex: number) =>
        set((state) => {
          const updated = [...state.cards]
          const [movedItem] = updated.splice(prevIndex, 1)
          updated.splice(newIndex, 0, movedItem)

          const newState = updated.map((card, index) => {
            return {
              ...card,
              id: index,
            }
          })

          return { cards: newState }
        }),
      setDNDDuration: (value: DNDDuration) => set({ DNDDuration: value }),
      isDNDModeActive: () => {
        const duration = get().DNDDuration
        if (duration === 'always') {
          return true
        } else if (typeof duration === 'object') {
          const dndValue = duration as {
            value: number
            countdown: number
          }
          return Boolean(dndValue.value && dndValue.countdown - new Date().getTime() > 0)
        } else {
          return false
        }
      },
      setShowReadPosts: (value) => set({ showReadPosts: value }),
      setSmoothScroll: (value) => set({ smoothScroll: value }),
      removeCard: (cardName: string) =>
        set((state) => {
          return {
            cards: state.cards.filter((card) => card.name !== cardName),
          }
        }),
      followTag: (tag: Tag) =>
        set((state) => {
          const exists = state.userSelectedTags.find((t) => t.value === tag.value)
          if (exists) {
            return state
          }
          return {
            userSelectedTags: [...state.userSelectedTags, tag],
          }
        }),
      unfollowTag: (tag: Tag) =>
        set((state) => {
          return {
            userSelectedTags: state.userSelectedTags.filter((t) => t.value !== tag.value),
          }
        }),
    }),
    {
      name: 'preferences_storage',
      version: 1,
      storage: createJSONStorage(() => localStateStore),
      migrate: (persistedState, version) => {
        const state = persistedState as unknown as UserPreferencesState &
          UserPreferencesStoreActions

        if (version === 0) {
          const previousTags = state.userSelectedTags as unknown as string[]

          const MAP_OLD_TAGS: Record<string, string> = {
            'artificial-intelligence': 'artificial intelligence',
            'machine-learning': 'machine learning',
            cpp: 'c++',
            csharp: 'c#',
            'data-science': 'data science',
            'objective-c': 'objectivec',
          }

          const newTags = previousTags
            .map((tag) => {
              if (MAP_OLD_TAGS[tag]) {
                return MAP_OLD_TAGS[tag]
              }
              return tag
            })
            .map((tag) => {
              return {
                label: capitalize(tag),
                value: tag,
              }
            })

          return {
            ...state,
            onboardingCompleted: true,
            userSelectedTags: newTags,
            occupation: state.onboardingResult?.title || '',
          }
        }
        return state
      },
    }
  )
)
