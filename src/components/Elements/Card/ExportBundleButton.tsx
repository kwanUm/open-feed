import { useCallback, useState } from 'react'
import { BiDownload } from 'react-icons/bi'
import { buildBundle, downloadBlob, fetchMediaFiles, slugify } from 'src/utils/exportFeed'
import { useCardExport } from './useCardExport'

type ExportBundleButtonProps = {
  label: string
  sourceUrl?: string
  className?: string
  iconClassName?: string
}

/**
 * Downloads a zip holding export.md plus every referenced image, for uploading
 * to an AI in one go. Clipboard cannot carry text and images together, so the
 * bundle is the way images travel.
 */
export const ExportBundleButton = ({
  label,
  sourceUrl,
  className = 'blockHeaderExportButton',
  iconClassName,
}: ExportBundleButtonProps) => {
  const { build, busy, setBusy, notify, count } = useCardExport(label, sourceUrl)
  const [progress, setProgress] = useState('')

  const handleExport = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (busy) return
      setBusy(true)

      try {
        const result = await build(true)
        if (!result) {
          notify('Nothing to export from this card')
          return
        }

        let files: Awaited<ReturnType<typeof fetchMediaFiles>> = { files: [], failed: [] }
        if (result.media.length) {
          notify(`Downloading ${result.media.length} images...`)
          files = await fetchMediaFiles(result.media, (done, total) =>
            setProgress(`${done}/${total}`)
          )
        }

        const blob = buildBundle({
          label,
          text: result.text,
          media: result.media,
          files: files.files,
          failed: files.failed,
        })

        const stamp = new Date().toISOString().slice(0, 10)
        downloadBlob(blob, `${slugify(label)}-${stamp}.zip`)

        if (files.failed.length) {
          // Name the actual reason; a silent count is not debuggable.
          console.error('[OpenFeed] Image downloads failed', files.failed)
          notify(
            `Bundled ${count} posts, but ${files.failed.length} image(s) failed: ${files.failed[0].reason}`
          )
        } else {
          notify(`Bundled ${count} posts and ${files.files.length} images`)
        }
      } catch (error) {
        console.error('[OpenFeed] Export bundle failed', error)
        notify(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setProgress('')
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
      onClick={handleExport}
      disabled={isEmpty || busy}
      title={
        isEmpty
          ? 'No posts to export yet'
          : `Download ${count} posts and their images as a zip bundle`
      }
      aria-label={`Export all posts from ${label} as a zip bundle`}>
      {busy && progress ? (
        <span className="blockHeaderExportProgress">{progress}</span>
      ) : (
        <BiDownload className={iconClassName} />
      )}
    </button>
  )
}
