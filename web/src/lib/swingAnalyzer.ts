/**
 * Swing analysis engine: wrist velocity, contact detection,
 * launch angle, and exit velocity estimation.
 *
 * All estimates are derived from body mechanics (no ball tracking).
 * Speed values are approximate — best used for relative comparison.
 */

import type { PoseFrame, PoseLandmarks, SwingAnalysis, SwingPhase } from '../types/pose'
import type { Handedness, Sport } from '../types/fundamentals'
import {
  LANDMARKS,
  lineAngle,
  hipShoulderSeparation,
  handHeight,
  stanceWidth,
} from './angles'
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
/** Estimated bat extension beyond rear wrist in meters (average adult bat). */
export const BAT_EXTENSION_M = 0.60
/** Estimated club extension beyond rear wrist in meters (driver ~1.1 m). */
export const CLUB_EXTENSION_M = 1.10
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
 * Estimate bat/club tip position by extending along the rear forearm axis
 * (rearElbow → rearWrist) beyond the rear wrist.
 *
 * This is more biomechanically accurate than the old wrist-to-wrist line
 * because the bat barrel continues along the forearm direction.
 *
 * Extension constants:
 *   baseball → BAT_EXTENSION_M  (0.60 m — average adult bat from grip)
 *   golf     → CLUB_EXTENSION_M (1.10 m — driver from grip to clubhead)
 */
export function estimateBatTip(
  landmarks: PoseLandmarks,
  handedness: Handedness = 'right',
  sport: Sport = 'baseball',
): { x: number; y: number } | null {
  const rearSide = handedness === 'right' ? 'right' : 'left'
  const elbowIdx = rearSide === 'right' ? LANDMARKS.RIGHT_ELBOW : LANDMARKS.LEFT_ELBOW
  const wristIdx = rearSide === 'right' ? LANDMARKS.RIGHT_WRIST : LANDMARKS.LEFT_WRIST

  const elbow = landmarks[elbowIdx]
  const wrist = landmarks[wristIdx]
  const ls = landmarks[LANDMARKS.LEFT_SHOULDER]
  const rs = landmarks[LANDMARKS.RIGHT_SHOULDER]

  if (!elbow || !wrist || !ls || !rs) return null

  const dx = wrist.x - elbow.x
  const dy = wrist.y - elbow.y
  const forearmDist = Math.sqrt(dx * dx + dy * dy)
  if (forearmDist < 0.001) return null

  const unitX = dx / forearmDist
  const unitY = dy / forearmDist

  const extensionM = sport === 'golf' ? CLUB_EXTENSION_M : BAT_EXTENSION_M
  const shoulderWidth = dist(ls, rs)
  if (shoulderWidth < 0.01) return null

  // Convert meters to normalised coord units using shoulder-width calibration
  const extensionNorm = (extensionM / AVG_SHOULDER_WIDTH_M) * shoulderWidth

  return {
    x: wrist.x + unitX * extensionNorm,
    y: wrist.y + unitY * extensionNorm,
  }
}

// --- Bat tip velocity ---

export interface BatTipVelocity {
  normSpeed: number
  mph: number
}

/**
 * Smoothed bat-tip velocity (5-frame moving average).
 */
export function computeBatTipVelocity(
  buffer: FrameBuffer,
  windowSize = 5,
  handedness: Handedness = 'right',
  sport: Sport = 'baseball',
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

    const tip0 = estimateBatTip(cur.landmarks, handedness, sport)
    const tip1 = estimateBatTip(prev.landmarks, handedness, sport)
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

// --- Pose-geometry phase classification (Phase 3) ---

/**
 * Classify swing phase using pose geometry when velocity is too low to
 * distinguish idle from setup/load via thresholds alone.
 *
 * This is used as a hybrid classifier:
 *   - If velocity is clearly mid-swing → velocity-based logic takes over
 *   - If velocity < 30% of threshold → this function decides setup vs load
 */
function classifyPhaseFromPose(
  landmarks: PoseLandmarks,
  buffer: FrameBuffer,
): SwingPhase {
  const sw = stanceWidth(landmarks)
  const hh = handHeight(landmarks)

  // Setup/address: standing with a wide stance, hands near shoulder level
  if (sw > 1.0 && hh >= -0.3 && hh <= 0.4) {
    // Check whether hip-shoulder separation is increasing (= loading)
    if (buffer.length >= 5) {
      const seps: number[] = []
      for (let i = 0; i < Math.min(5, buffer.length); i++) {
        const frame = buffer.get(i)
        if (frame) seps.push(Math.abs(hipShoulderSeparation(frame.landmarks)))
      }
      // seps[0] = most recent; seps[last] = oldest
      if (seps.length >= 3 && seps[0] > seps[seps.length - 1] + 3) {
        return 'load'
      }
    }
    return 'idle'
  }

  return 'idle'
}

// --- Top-level analysis ---

/**
 * @param speedMultiplier - Slow-motion factor. 1 = normal, 4 = 4× slow-mo, etc.
 * @param handedness      - Player handedness (determines which forearm to track).
 * @param sport           - Sport determines bat/club extension constant.
 */
export function analyzeSwing(
  buffer: FrameBuffer,
  contactState: ContactDetectorState,
  speedMultiplier = 1,
  handedness: Handedness = 'right',
  sport: Sport = 'baseball',
): { analysis: SwingAnalysis; contactState: ContactDetectorState } {
  const velocity = computeBatTipVelocity(buffer, 5, handedness, sport)
  const newContactState = updateContactDetection(buffer, contactState, velocity)

  const currentSwingSpeed = (velocity?.mph ?? 0) * speedMultiplier
  const peakSwingSpeed = newContactState.peakMph * speedMultiplier

  const launchAngle = newContactState.contactDetected
    ? estimateLaunchAngle(newContactState.contactBatAngle)
    : null

  const exitVelocity = newContactState.contactDetected && peakSwingSpeed > 0
    ? peakSwingSpeed * EXIT_VELO_COEFFICIENT
    : null

  let phase: SwingPhase
  if (velocity && velocity.normSpeed > SWING_SPEED_THRESHOLD) {
    phase = 'contact'
  } else if (velocity && velocity.normSpeed > SWING_SPEED_THRESHOLD * 0.3) {
    phase = newContactState.contactDetected ? 'follow' : 'load'
  } else {
    // Low-velocity: use pose geometry to distinguish setup vs load
    const latestFrame = buffer.get(0)
    phase = latestFrame
      ? classifyPhaseFromPose(latestFrame.landmarks, buffer)
      : 'idle'
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
