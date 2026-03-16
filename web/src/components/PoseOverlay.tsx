/**
 * Canvas overlay for pose skeleton.
 * Draws keypoints and connections on top of video.
 * Supports multiple poses with selection highlighting.
 */

import { useRef, useEffect } from 'react'
import type { PoseLandmarks } from '../types/pose'
import type { Handedness, Sport } from '../types/fundamentals'
import { estimateBatTip } from '../lib/swingAnalyzer'

interface PoseOverlayProps {
  landmarks: PoseLandmarks | null
  allPoses?: PoseLandmarks[]
  selectedIndex?: number
  width: number
  height: number
  handedness?: Handedness
  sport?: Sport
}

// MediaPipe pose connections (pairs of landmark indices)
const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: PoseLandmarks,
  width: number,
  height: number,
  isSelected: boolean,
) {
  const connColor = isSelected ? '#00ff88' : '#555566'
  const pointColor = isSelected ? '#00ff88' : '#555566'
  const borderColor = isSelected ? '#ffffff' : '#333344'
  const alphaMul = isSelected ? 1.0 : 0.5

  // Draw connections
  ctx.strokeStyle = connColor
  ctx.lineWidth = isSelected ? 2 : 1.5
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = pose[i]
    const b = pose[j]
    if (!a || !b) continue

    const visA = a.visibility ?? 1
    const visB = b.visibility ?? 1
    if (visA < 0.5 || visB < 0.5) continue

    ctx.globalAlpha = Math.min(visA, visB) * alphaMul
    ctx.beginPath()
    ctx.moveTo(a.x * width, a.y * height)
    ctx.lineTo(b.x * width, b.y * height)
    ctx.stroke()
  }

  // Draw points
  for (const lm of pose) {
    const visibility = lm.visibility ?? 1
    if (visibility < 0.5) continue

    const x = lm.x * width
    const y = lm.y * height

    ctx.fillStyle = pointColor
    ctx.globalAlpha = visibility * alphaMul
    ctx.beginPath()
    ctx.arc(x, y, isSelected ? 4 : 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawBat(
  ctx: CanvasRenderingContext2D,
  pose: PoseLandmarks,
  width: number,
  height: number,
  handedness: Handedness,
  sport: Sport,
) {
  // Use the rear wrist as the grip anchor (more accurate than midpoint for forearm axis)
  const rearWristIdx = handedness === 'right' ? 16 : 15 // RIGHT_WRIST : LEFT_WRIST
  const leadWristIdx = handedness === 'right' ? 15 : 16 // LEFT_WRIST : RIGHT_WRIST

  const rearWrist = pose[rearWristIdx]
  const leadWrist = pose[leadWristIdx]
  if (!rearWrist || !leadWrist) return

  const rearVis = rearWrist.visibility ?? 1
  const leadVis = leadWrist.visibility ?? 1
  if (rearVis < 0.5 || leadVis < 0.5) return

  const batTip = estimateBatTip(pose, handedness, sport)
  if (!batTip) return

  // Draw from midpoint of wrists to tip
  const gripX = ((rearWrist.x + leadWrist.x) / 2) * width
  const gripY = ((rearWrist.y + leadWrist.y) / 2) * height
  const tipX = batTip.x * width
  const tipY = batTip.y * height

  ctx.save()
  ctx.strokeStyle = '#ffaa44'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.globalAlpha = Math.min(rearVis, leadVis)

  ctx.beginPath()
  ctx.moveTo(gripX, gripY)
  ctx.lineTo(tipX, tipY)
  ctx.stroke()

  // Bat tip marker
  ctx.fillStyle = '#ffaa44'
  ctx.beginPath()
  ctx.arc(tipX, tipY, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

export function PoseOverlay({
  landmarks,
  allPoses,
  selectedIndex,
  width,
  height,
  handedness = 'right',
  sport = 'baseball',
}: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    const poses = allPoses && allPoses.length > 0 ? allPoses : (landmarks ? [landmarks] : [])
    if (poses.length === 0) return

    const selIdx = selectedIndex != null && selectedIndex >= 0 ? selectedIndex : 0

    // Draw non-selected poses first (behind)
    for (let i = 0; i < poses.length; i++) {
      if (i === selIdx || !poses[i]?.length) continue
      drawPose(ctx, poses[i], width, height, false)
    }

    // Draw selected pose on top
    if (poses[selIdx]?.length) {
      drawPose(ctx, poses[selIdx], width, height, true)
      drawBat(ctx, poses[selIdx], width, height, handedness, sport)
    }

    ctx.globalAlpha = 1
  }, [landmarks, allPoses, selectedIndex, width, height, handedness, sport])

  const hasPoses = (allPoses && allPoses.length > 0) || (landmarks && landmarks.length > 0)
  if (!hasPoses) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pose-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
      }}
    />
  )
}
