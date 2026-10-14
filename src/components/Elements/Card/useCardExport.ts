import { useCallback, useState } from 'react'
import toast from 'react-simple-toasts'
import { enrichXcomItems } from 'src/utils/exportFeed'
import { formatCardItems, FormattedExport } from 'src/utils/formatCardItems'
import { useCardItems } from './CardItemsContext'

const notify = (message: string) => toast(message, { theme: 'defaultToast' })

/**
 * Shared plumbing for the card's export controls: pull the rendered items, add
 * deep X context where it applies, and render them as markdown.
 */
export const useCardExport = (label: string, sourceUrl?: string) => {
  const cardItems = useCardItems()
  const [busy, setBusy] = useState(false)

  const build = useCallback(
    async (includeMedia: boolean): Promise<FormattedExport | null> => {
      const items = cardItems?.getItems() ?? []
      if (items.length === 0) return null

      const xcomCount = (items as any[]).filter((item) => item?.source === 'xcom').length
      let enrichment = {}

      if (xcomCount > 0) {
        notify(`Fetching thread and quote context for ${xcomCount} X posts...`)
        try {
          enrichment = await enrichXcomItems(items)
        } catch (error) {
          // Say so rather than quietly shipping a thinner export.
          console.error('[OpenFeed] X enrichment failed', error)
          notify(
            `X context unavailable (${
              error instanceof Error ? error.message : String(error)
            }). Exporting without threads.`
          )
        }
      }

      return formatCardItems({ label, sourceUrl, items, enrichment, includeMedia })
    },
    [cardItems, label, sourceUrl]
  )

  return { build, busy, setBusy, notify, count: cardItems?.count ?? 0 }
}
