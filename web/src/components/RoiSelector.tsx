/**
 * Region of Interest selector.
 * User draws a rectangle on the video to isolate the batter.
 * Coordinates are normalized to [0,1] matching MediaPipe landmarks.
 */

import { useRef, useState, useCallback } from 'react'

export interface Roi {
  x: number
  y: number
  w: number
  h: number
}

interface RoiSelectorProps {
  roi: Roi | null
  onRoiChange: (roi: Roi | null) => void
  width: number
  height: number
  enabled: boolean
}

export function RoiSelector({ roi, onRoiChange, width, height, enabled }: RoiSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)

  const toNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const el = containerRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      }
    },
    [],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      const pt = toNormalized(e.clientX, e.clientY)
      if (!pt) return
      setDrawing(true)
      setStart(pt)
      setCurrent(pt)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [enabled, toNormalized],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing) return
      const pt = toNormalized(e.clientX, e.clientY)
      if (pt) setCurrent(pt)
    },
    [drawing, toNormalized],
  )

  const handlePointerUp = useCallback(() => {
    if (!drawing || !start || !current) {
      setDrawing(false)
      return
    }

    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)

    // Ignore tiny accidental taps
    if (w < 0.03 || h < 0.03) {
      setDrawing(false)
      setStart(null)
      setCurrent(null)
      return
    }

    onRoiChange({ x, y, w, h })
    setDrawing(false)
    setStart(null)
    setCurrent(null)
  }, [drawing, start, current, onRoiChange])

  // Compute rect to display (either being drawn, or the committed ROI)
  let displayRect: { left: string; top: string; width: string; height: string } | null = null

  if (drawing && start && current) {
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)
    displayRect = {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: `${w * 100}%`,
      height: `${h * 100}%`,
    }
  } else if (roi) {
    displayRect = {
      left: `${roi.x * 100}%`,
      top: `${roi.y * 100}%`,
      width: `${roi.w * 100}%`,
      height: `${roi.h * 100}%`,
    }
  }

  return (
    <div
      ref={containerRef}
      className={`roi-selector ${enabled ? 'roi-active' : ''}`}
      style={{ width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {displayRect && (
        <div className="roi-rect" style={displayRect}>
          {roi && !drawing && (
            <button
              type="button"
              className="roi-clear"
              onClick={(e) => {
                e.stopPropagation()
                onRoiChange(null)
              }}
              title="Clear region"
            >
              &times;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
