import {
  buildBundleEntries,
  BuildBundleArgs as CoreBuildBundleArgs,
  MediaFailure,
} from './exportCore'
import { EnrichedTweet, MediaRef } from './formatCardItems'
import { createZipBlob, ZipEntry } from './zipBundle'

const sendMessage = <T,>(message: Record<string, unknown>): Promise<T> =>
  new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Extension APIs unavailable. Load OpenFeed as the installed extension.'))
      return
    }
    chrome.runtime.sendMessage(message, (response: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.error) {
        reject(new Error(response.error))
        return
      }
      resolve(response as T)
    })
  })

/** Small batches keep each round trip short so the MV3 worker is not killed mid-flight. */
const ENRICH_CHUNK = 5

export type ProgressFn = (done: number, total: number) => void

/**
 * Pulls thread, reply target, quoted text and article body for every X post in
 * the list. Non-X items are left alone.
 */
export const enrichXcomItems = async (
  items: unknown[],
  onProgress?: ProgressFn
): Promise<Record<string, EnrichedTweet>> => {
  const ids = (items as any[])
    .filter((item) => item?.source === 'xcom' && typeof item?.id === 'string')
    .map((item) => item.id as string)

  if (ids.length === 0) return {}

  const enrichment: Record<string, EnrichedTweet> = {}
  for (let i = 0; i < ids.length; i += ENRICH_CHUNK) {
    const chunk = ids.slice(i, i + ENRICH_CHUNK)
    const response = await sendMessage<{ data: Record<string, EnrichedTweet> }>({
      type: 'ENRICH_XCOM',
      ids: chunk,
    })
    Object.assign(enrichment, response.data || {})
    onProgress?.(Math.min(i + chunk.length, ids.length), ids.length)
  }
  return enrichment
}

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type { MediaFailure }

export type FetchedMedia = {
  files: ZipEntry[]
  failed: MediaFailure[]
}

const fetchDirect = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

const fetchViaWorker = async (url: string): Promise<Uint8Array> => {
  const response = await sendMessage<{ base64: string }>({ type: 'FETCH_MEDIA', url })
  if (!response?.base64) throw new Error('worker returned no data')
  return base64ToBytes(response.base64)
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Downloads each referenced image.
 *
 * The page fetches media itself first: both Twitter's and LinkedIn's CDNs send
 * `access-control-allow-origin: *`, so this path works with no host permission
 * at all. Chrome withholds newly added host permissions on an extension update
 * until they are granted, which silently breaks the service-worker path, so
 * that is only the fallback. Every failure records why, since a bundle that
 * just says "failed" gives nothing to debug.
 */
export const fetchMediaFiles = async (
  refs: MediaRef[],
  onProgress?: ProgressFn
): Promise<FetchedMedia> => {
  const files: ZipEntry[] = []
  const failed: MediaFailure[] = []

  for (let i = 0; i < refs.length; i += 1) {
    const ref = refs[i]
    const reasons: string[] = []
    let data: Uint8Array | null = null

    try {
      data = await fetchDirect(ref.url)
    } catch (directError) {
      reasons.push(`page fetch: ${describe(directError)}`)
      try {
        data = await fetchViaWorker(ref.url)
      } catch (workerError) {
        reasons.push(`service worker: ${describe(workerError)}`)
      }
    }

    if (data && data.length > 0) {
      files.push({ name: ref.file, data })
    } else {
      failed.push({ ...ref, reason: reasons.join('; ') || 'empty response' })
    }

    onProgress?.(i + 1, refs.length)
  }

  return { files, failed }
}

export { slugify } from './exportCore'

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export type BuildBundleArgs = CoreBuildBundleArgs

/** Assembles export.md, the images, and an index mapping tokens to files. */
export const buildBundle = (args: BuildBundleArgs): Blob =>
  createZipBlob(buildBundleEntries(args))
