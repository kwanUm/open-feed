import { useCallback, useEffect, useRef, useState } from 'react'
import { BiCheck, BiCopy } from 'react-icons/bi'
import { useCardExport } from './useCardExport'

type CopyItemsButtonProps = {
  label: string
  sourceUrl?: string
  className?: string
  iconClassName?: string
}

export const CopyItemsButton = ({
  label,
  sourceUrl,
  className = 'blockHeaderCopyButton',
  iconClassName,
}: CopyItemsButtonProps) => {
  const { build, busy, setBusy, notify, count } = useCardExport(label, sourceUrl)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const handleCopy = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (busy) return
      setBusy(true)

      try {
        const result = await build(false)
        if (!result) {
          notify('Nothing to copy from this card')
          return
        }

        await navigator.clipboard.writeText(result.text)
        setCopied(true)
        clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setCopied(false), 1500)
        notify(`Copied ${count} posts from ${label}`)
      } catch (error) {
        console.error('[OpenFeed] Copy all posts failed', error)
        notify(`Copy failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setBusy(false)
      }
    },
    [build, busy, setBusy, notify, count, label]
  )

  const isEmpty = count === 0

  return (
    <button
      type="button"
      className={className}
      onClick={handleCopy}
      disabled={isEmpty || busy}
      title={isEmpty ? 'No posts to copy yet' : `Copy all ${count} posts as text`}
      aria-label={`Copy all posts from ${label} to clipboard`}>
      {copied ? <BiCheck className={iconClassName} /> : <BiCopy className={iconClassName} />}
    </button>
  )
}
