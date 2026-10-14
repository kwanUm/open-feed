import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type CardItemsContextValue = {
  /** Called by the list renderer with exactly the items it painted. */
  registerItems: (items: unknown[]) => void
  /** Reads the latest registered items without subscribing to them. */
  getItems: () => unknown[]
  /** How many items are currently on screen, for enabling the copy button. */
  count: number
}

const CardItemsContext = createContext<CardItemsContextValue | null>(null)

export const CardItemsProvider = ({ children }: { children: React.ReactNode }) => {
  // Items live in a ref so re-registering on every list render never re-renders
  // the card. Only the count is state, and only when it actually changes.
  const itemsRef = useRef<unknown[]>([])
  const [count, setCount] = useState(0)

  const registerItems = useCallback((items: unknown[]) => {
    itemsRef.current = items
    setCount((previous) => (previous === items.length ? previous : items.length))
  }, [])

  const getItems = useCallback(() => itemsRef.current, [])

  const value = useMemo(
    () => ({ registerItems, getItems, count }),
    [registerItems, getItems, count]
  )

  return <CardItemsContext.Provider value={value}>{children}</CardItemsContext.Provider>
}

/** Returns null outside a Card, so list renderers used elsewhere stay safe. */
export const useCardItems = () => useContext(CardItemsContext)
