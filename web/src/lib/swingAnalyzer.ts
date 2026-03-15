/**
 * Swing analysis engine: wrist velocity, contact detection,
 * launch angle, and exit velocity estimation.
 *
 * All estimates are derived from body mechanics (no ball tracking).
 * Speed values are approximate — best used for relative comparison.
 */

import type { PoseFrame, PoseLandmarks, SwingAnalysis, SwingPhase } from '../types/pose'
import { LANDMARKS, lineAngle } from './angles'
import type { FrameBuffer } from './frameBuffer'

// --- Constants ---

/** Average shoulder width in meters (scaling reference). */
const AVG_SHOULDER_WIDTH_M = 0.40
/** Conversion: m/s → mph. */
const MS_TO_MPH = 2.237
/** Empirical bat-ball collision coefficient. */
const EXIT_VELO_COEFFICIENT = 1.2
/** Degrees added to bat angle to approximate launch above bat plane. */
const LAUNCH_ANGLE_OFFSET = 5
/** Estimated bat extension beyond grip in meters. */
const BAT_EXTENSION_M = 0.60
/** Minimum bat-tip speed (norm units/s) to count as actively swinging. */
const SWING_SPEED_THRESHOLD = 1.4
/** Velocity drop ratio that signals contact (0.6 = 40% drop). */
const DECEL_RATIO = 0.6
/** Minimum ms between contact detections. */
const CONTACT_COOLDOWN_MS = 500

// --- Helpers ---

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Meters per normalised-coordinate unit, using shoulder width as a ruler. */
function metersPerNorm(landmarks: PoseLandmarks): number {
  const ls = landmarks[LANDMARKS.LEFT_SHOULDER]
  const rs = landmarks[LANDMARKS.RIGHT_SHOULDER]
  if (!ls || !rs) return 0
  const sw = dist(ls, rs)
  return sw > 0.01 ? AVG_SHOULDER_WIDTH_M / sw : 0
}

// --- Bat tip estimation ---

/**
 * Estimate bat tip position by extending the wrist-to-wrist line
 * beyond the lead wrist by BAT_EXTENSION_M.
 * Lead wrist = whichever wrist projects further from torso center.
 */
export function estimateBatTip(landmarks: PoseLandmarks): { x: number; y: number } | null {
  const lw = landmarks[LANDMARKS.LEFT_WRIST]
  const rw = landmarks[LANDMARKS.RIGHT_WRIST]
  const ls = landmarks[LANDMARKS.LEFT_SHOULDER]
  const rs = landmarks[LANDMARKS.RIGHT_SHOULDER]
  if (!lw || !rw || !ls || !rs) return null

  const dx = lw.x - rw.x
  const dy = lw.y - rw.y
  const wristDist = Math.sqrt(dx * dx + dy * dy)
  if (wristDist < 0.001) return null

  const unitX = dx / wristDist
  const unitY = dy / wristDist

  // Torso center for determining which wrist is "lead" (further out)
  const lh = landmarks[LANDMARKS.LEFT_HIP] ?? ls
  const rh = landmarks[LANDMARKS.RIGHT_HIP] ?? rs
  const torso = midpoint(midpoint(ls, rs), midpoint(lh, rh))

  const projL = (lw.x - torso.x) * unitX + (lw.y - torso.y) * unitY
  const projR = (rw.x - torso.x) * unitX + (rw.y - torso.y) * unitY

  const leadWrist = projL > projR ? lw : rw
  const dirX = projL > projR ? unitX : -unitX
  const dirY = projL > projR ? unitY : -unitY

  // Convert bat extension from meters to normalized coords
  const shoulderWidth = dist(ls, rs)
  if (shoulderWidth < 0.01) return null
  const extensionNorm = (BAT_EXTENSION_M / AVG_SHOULDER_WIDTH_M) * shoulderWidth

  return {
    x: leadWrist.x + dirX * extensionNorm,
    y: leadWrist.y + dirY * extensionNorm,
  }
}

// --- Bat tip velocity ---

export interface BatTipVelocity {
  normSpeed: number
  mph: number
}

/**
 * Smoothed bat-tip velocity (5-frame moving average).
 * Estimates bat barrel position by extending beyond the lead wrist.
 */
export function computeBatTipVelocity(
  buffer: FrameBuffer,
  windowSize = 5,
): BatTipVelocity | null {
  if (buffer.length < 2) return null

  const speeds: number[] = []
  let totalScale = 0
  let scaleCount = 0
  const limit = Math.min(windowSize, buffer.length - 1)

  for (let i = 0; i < limit; i++) {
    const cur = buffer.get(i)
    const prev = buffer.get(i + 1)
    if (!cur || !prev) continue

    const dt = (cur.timestamp - prev.timestamp) / 1000
    if (dt <= 0 || dt > 0.2) continue

    const tip0 = estimateBatTip(cur.landmarks)
    const tip1 = estimateBatTip(prev.landmarks)
    if (!tip0 || !tip1) continue

    const d = dist(tip0, tip1)
    speeds.push(d / dt)

    const scale = metersPerNorm(cur.landmarks)
    if (scale > 0) { totalScale += scale; scaleCount++ }
  }

  if (speeds.length === 0) return null

  const avgNorm = speeds.reduce((a, b) => a + b, 0) / speeds.length
  const avgScale = scaleCount > 0 ? totalScale / scaleCount : 0
  const mph = avgNorm * avgScale * MS_TO_MPH

  return { normSpeed: avgNorm, mph }
}

// --- Contact detection ---

export interface ContactDetectorState {
  peakSpeed: number
  peakTimestamp: number
  lastContactTimestamp: number
  contactDetected: boolean
  contactBatAngle: number | null
  peakMph: number
}

export function createContactDetectorState(): ContactDetectorState {
  return {
    peakSpeed: 0,
    peakTimestamp: 0,
    lastContactTimestamp: 0,
    contactDetected: false,
    contactBatAngle: null,
    peakMph: 0,
  }
}

export function updateContactDetection(
  buffer: FrameBuffer,
  prev: ContactDetectorState,
  velocity: BatTipVelocity | null,
): ContactDetectorState {
  if (!velocity || buffer.length < 5) return prev

  const now = buffer.get(0)?.timestamp ?? 0
  const state = { ...prev }

  // Cooldown
  if (state.lastContactTimestamp > 0 && now - state.lastContactTimestamp < CONTACT_COOLDOWN_MS) {
    return state
  }

  // Track peak
  if (velocity.normSpeed > state.peakSpeed && velocity.normSpeed > SWING_SPEED_THRESHOLD) {
    state.peakSpeed = velocity.normSpeed
    state.peakMph = velocity.mph
    state.peakTimestamp = now
    state.contactDetected = false
    state.contactBatAngle = null
  }

  // Check deceleration
  if (state.peakSpeed > SWING_SPEED_THRESHOLD && !state.contactDetected) {
    const timeSincePeak = now - state.peakTimestamp

    if (timeSincePeak > 30 && timeSincePeak < 150) {
      if (velocity.normSpeed < state.peakSpeed * DECEL_RATIO) {
        state.contactDetected = true
        state.lastContactTimestamp = now

        // Record bat angle at the frame closest to peak
        const peakFrame = findFrameNear(buffer, state.peakTimestamp)
        if (peakFrame) {
          const lw = peakFrame.landmarks[LANDMARKS.LEFT_WRIST]
          const rw = peakFrame.landmarks[LANDMARKS.RIGHT_WRIST]
          if (lw && rw) state.contactBatAngle = lineAngle(lw, rw)
        }
      }
    }

    // Reset if too long without decel
    if (timeSincePeak > 300) {
      state.peakSpeed = 0
      state.peakMph = 0
    }
  }

  return state
}

function findFrameNear(buffer: FrameBuffer, targetTs: number): PoseFrame | null {
  let best: PoseFrame | null = null
  let bestDelta = Infinity
  for (let i = 0; i < buffer.length; i++) {
    const f = buffer.get(i)
    if (!f) continue
    const d = Math.abs(f.timestamp - targetTs)
    if (d < bestDelta) { bestDelta = d; best = f }
  }
  return best
}

// --- Launch angle & exit velocity ---

function estimateLaunchAngle(batAngle: number | null): number | null {
  if (batAngle === null) return null
  // Negate: positive-Y is down in screen coords
  return -batAngle + LAUNCH_ANGLE_OFFSET
}

// --- Top-level analysis ---

/**
 * @param speedMultiplier - Slow-motion factor. 1 = normal, 4 = 4x slow-mo, etc.
 *   Scales velocity to compensate for slow-motion recording.
 */
export function analyzeSwing(
  buffer: FrameBuffer,
  contactState: ContactDetectorState,
  speedMultiplier = 1,
): { analysis: SwingAnalysis; contactState: ContactDetectorState } {
  const velocity = computeBatTipVelocity(buffer)
  const newContactState = updateContactDetection(buffer, contactState, velocity)

  const currentSwingSpeed = (velocity?.mph ?? 0) * speedMultiplier
  const peakSwingSpeed = newContactState.peakMph * speedMultiplier

  const launchAngle = newContactState.contactDetected
    ? estimateLaunchAngle(newContactState.contactBatAngle)
    : null

  const exitVelocity = newContactState.contactDetected && peakSwingSpeed > 0
    ? peakSwingSpeed * EXIT_VELO_COEFFICIENT
    : null

  let phase: SwingPhase = 'idle'
  if (velocity && velocity.normSpeed > SWING_SPEED_THRESHOLD) {
    phase = 'contact'
  } else if (velocity && velocity.normSpeed > SWING_SPEED_THRESHOLD * 0.3) {
    phase = newContactState.contactDetected ? 'follow' : 'load'
  }

  return {
    analysis: {
      currentSwingSpeed,
      peakSwingSpeed,
      contactDetected: newContactState.contactDetected,
      launchAngle,
      exitVelocity,
      phase,
      contactTimestamp: newContactState.contactDetected
        ? newContactState.lastContactTimestamp
        : null,
    },
    contactState: newContactState,
  }
}
