// Worker-safe half of the export pipeline.
//
// The new-tab page and the service worker both need to turn feed items into a
// zip. The page does it when you click Export; the worker does it unattended on
// the daily alarm, where no page exists. Everything in here therefore avoids the
// DOM: no document, no URL.createObjectURL, no Blob. The page keeps the few
// browser-only helpers (downloadBlob, createZipBlob) in exportFeed.ts.
//
// esbuild bundles this file into public/export-core.js as the `OpenFeedExport`
// global so background.js can importScripts it without becoming an ES module.
import { formatCardItems, FormattedExport, MediaRef } from './formatCardItems'
import { createZipBytes, ZipEntry } from './zipBundle'

export type { FormattedExport, MediaRef, ZipEntry }
export { formatCardItems, createZipBytes }

export const slugify = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'feed'

export type MediaFailure = MediaRef & { reason: string }

export type BuildBundleArgs = {
  label: string
  text: string
  media: MediaRef[]
  files: ZipEntry[]
  failed: MediaFailure[]
}

/**
 * Assembles the zip's file list: export.md, an index mapping every [imgN] token
 * to its file, and the images themselves. Returned as entries rather than a zip
 * so the page can wrap them in a Blob and the worker can emit raw bytes.
 */
export const buildBundleEntries = ({
  label,
  text,
  media,
  files,
  failed,
}: BuildBundleArgs): ZipEntry[] => {
  const encoder = new TextEncoder()
  const indexLines = [
    `# Image index for ${label}`,
    '',
    'Each token below appears inline in export.md at the point the image was shown.',
    '',
    ...media.map((ref) => {
      const failure = failed.find((f) => f.token === ref.token)
      const target = failure ? `DOWNLOAD FAILED - ${failure.reason}` : ref.file
      return `- ${ref.token} -> ${target} (${ref.kind})\n  ${ref.url}`
    }),
  ]

  if (failed.length) {
    indexLines.push(
      '',
      `${failed.length} image(s) could not be downloaded and are not in this bundle.`
    )
  }

  return [
    { name: 'export.md', data: encoder.encode(text) },
    { name: 'images/index.md', data: encoder.encode(indexLines.join('\n') + '\n') },
    ...files,
  ]
}

/** One-shot: items plus enrichment in, zip bytes out. Used by the daily alarm. */
export const buildBundleBytes = (args: BuildBundleArgs): Uint8Array =>
  createZipBytes(buildBundleEntries(args))
