/**
 * Detect source FPS from MP4/MOV container metadata.
 * Parses the moov > trak (video) > mdia > mdhd + stts boxes
 * to compute the actual recording frame rate.
 *
 * This lets us auto-detect slow-mo (120fps, 240fps) videos
 * without requiring the user to know their camera settings.
 */

interface BoxInfo {
  type: string
  dataStart: number  // offset of box contents (after header)
  dataEnd: number    // offset of box end
  boxEnd: number     // same as dataEnd
}

/**
 * Find the next box of a given type within a byte range.
 * Returns null if not found within range.
 */
function findBox(
  view: DataView,
  start: number,
  end: number,
  targetType: string,
): BoxInfo | null {
  let offset = start
  while (offset + 8 <= end) {
    const size = view.getUint32(offset)
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    )

    // Handle size=0 (box extends to end) and size=1 (64-bit size)
    let boxEnd: number
    let headerSize = 8
    if (size === 0) {
      boxEnd = end
    } else if (size === 1 && offset + 16 <= end) {
      // 64-bit extended size
      const hi = view.getUint32(offset + 8)
      const lo = view.getUint32(offset + 12)
      boxEnd = offset + hi * 0x100000000 + lo
      headerSize = 16
    } else if (size < 8) {
      break // invalid
    } else {
      boxEnd = offset + size
    }

    if (boxEnd > end) boxEnd = end

    if (type === targetType) {
      return { type, dataStart: offset + headerSize, dataEnd: boxEnd, boxEnd }
    }

    offset = boxEnd
  }
  return null
}

/**
 * Check if an hdlr box describes a video track.
 * hdlr layout: version(1) + flags(3) + pre_defined(4) + handler_type(4)
 */
function isVideoHandler(view: DataView, hdlr: BoxInfo): boolean {
  const handlerOffset = hdlr.dataStart + 8 // skip version+flags + pre_defined
  if (handlerOffset + 4 > hdlr.dataEnd) return false
  const handlerType = String.fromCharCode(
    view.getUint8(handlerOffset),
    view.getUint8(handlerOffset + 1),
    view.getUint8(handlerOffset + 2),
    view.getUint8(handlerOffset + 3),
  )
  return handlerType === 'vide'
}

/**
 * Extract timescale from mdhd (media header) box.
 * Handles both version 0 (32-bit) and version 1 (64-bit).
 */
function getMdhdTimescale(view: DataView, mdhd: BoxInfo): number | null {
  if (mdhd.dataStart + 4 > mdhd.dataEnd) return null
  const version = view.getUint8(mdhd.dataStart)

  // version 0: creation(4) + modification(4) + timescale(4)
  // version 1: creation(8) + modification(8) + timescale(4)
  const timescaleOffset = mdhd.dataStart + 4 + (version === 0 ? 8 : 16)
  if (timescaleOffset + 4 > mdhd.dataEnd) return null

  return view.getUint32(timescaleOffset)
}

/**
 * Get the first sample_delta from an stts (sample-to-time) box.
 * stts layout: version(1) + flags(3) + entry_count(4) + [sample_count(4) + sample_delta(4)]...
 */
function getSttsFirstDelta(view: DataView, stts: BoxInfo): number | null {
  const entryCountOffset = stts.dataStart + 4 // skip version+flags
  if (entryCountOffset + 4 > stts.dataEnd) return null

  const entryCount = view.getUint32(entryCountOffset)
  if (entryCount === 0) return null

  // First entry: sample_count + sample_delta
  const firstEntryOffset = entryCountOffset + 4
  if (firstEntryOffset + 8 > stts.dataEnd) return null

  const sampleDelta = view.getUint32(firstEntryOffset + 4)
  return sampleDelta
}

/**
 * Detect the source FPS of a video file by parsing MP4/MOV metadata.
 * Returns the FPS (e.g., 30, 60, 120, 240) or null if it can't be determined.
 */
export async function detectVideoFps(file: File): Promise<number | null> {
  try {
    // Read up to 10MB — covers most short swing clips entirely.
    // For larger files, moov is usually near the start (MOV) or end (MP4).
    const chunkSize = Math.min(file.size, 10 * 1024 * 1024)
    let buffer = await file.slice(0, chunkSize).arrayBuffer()
    let view = new DataView(buffer)
    let moov = findBox(view, 0, buffer.byteLength, 'moov')

    // If moov not in first chunk and file is larger, check the end
    if (!moov && file.size > chunkSize) {
      const tailSize = Math.min(file.size, 4 * 1024 * 1024)
      const tailStart = file.size - tailSize
      buffer = await file.slice(tailStart).arrayBuffer()
      view = new DataView(buffer)
      moov = findBox(view, 0, buffer.byteLength, 'moov')
    }

    if (!moov) return null

    // Walk trak boxes to find the video track
    let offset = moov.dataStart
    while (offset < moov.dataEnd) {
      const trak = findBox(view, offset, moov.dataEnd, 'trak')
      if (!trak) break

      const mdia = findBox(view, trak.dataStart, trak.dataEnd, 'mdia')
      if (mdia) {
        // Check handler type
        const hdlr = findBox(view, mdia.dataStart, mdia.dataEnd, 'hdlr')
        if (hdlr && isVideoHandler(view, hdlr)) {
          // This is the video track — extract timescale
          const mdhd = findBox(view, mdia.dataStart, mdia.dataEnd, 'mdhd')
          const timescale = mdhd ? getMdhdTimescale(view, mdhd) : null

          // Extract sample duration
          const minf = findBox(view, mdia.dataStart, mdia.dataEnd, 'minf')
          if (minf && timescale && timescale > 0) {
            const stbl = findBox(view, minf.dataStart, minf.dataEnd, 'stbl')
            if (stbl) {
              const stts = findBox(view, stbl.dataStart, stbl.dataEnd, 'stts')
              if (stts) {
                const sampleDelta = getSttsFirstDelta(view, stts)
                if (sampleDelta && sampleDelta > 0) {
                  const fps = Math.round(timescale / sampleDelta)
                  // Sanity check: typical video FPS range
                  if (fps >= 10 && fps <= 1000) {
                    return fps
                  }
                }
              }
            }
          }
        }
      }

      offset = trak.boxEnd
    }

    return null
  } catch {
    return null
  }
}

/**
 * Compute the speed multiplier for a given source FPS.
 * Assumes standard playback is 30fps.
 * Returns 1 if the video is normal speed.
 */
export function fpsToSpeedMultiplier(fps: number): number {
  if (fps <= 60) return 1
  return Math.round(fps / 30)
}
