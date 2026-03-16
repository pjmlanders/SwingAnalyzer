/**
 * Bat/club axis computation from HandLandmarker keypoints (Phase 4).
 *
 * The grip axis is defined as the vector from the wrist (landmark 0)
 * to the middle finger MCP (landmark 9), which approximates the
 * palm-forward grip direction — more accurate than the wrist-to-wrist line.
 */

import type { Handedness, Sport } from '../types/fundamentals'
import type { HandDetectResult, HandLandmarks } from './handPose'
import { lineAngle } from './angles'

// MediaPipe hand landmark indices used here
const WRIST_LM = 0
const MIDDLE_MCP_LM = 9

/**
 * Compute the grip axis angle (degrees from horizontal) for a single hand.
 * Uses wrist → middle-finger MCP as the palm-forward direction.
 */
export function gripAxis(hand: HandLandmarks): number {
  const wrist = hand[WRIST_LM]
  const mcp = hand[MIDDLE_MCP_LM]
  if (!wrist || !mcp) return 0
  return lineAngle(wrist, mcp)
}

/**
 * Compute bat/club axis from both detected hands.
 *
 * Weighting:
 *   golf    → lead hand 80 %, rear hand 20 %
 *   baseball → 50 % / 50 %
 *
 * For right-handed players: lead hand = left, rear hand = right.
 * For left-handed players:  lead hand = right, rear hand = left.
 */
export function batAxisFromHands(
  hands: HandDetectResult,
  handedness: Handedness,
  sport: Sport,
): number | null {
  const leadHand = handedness === 'right' ? hands.left : hands.right
  const rearHand = handedness === 'right' ? hands.right : hands.left

  if (!leadHand && !rearHand) return null

  const leadAngle = leadHand ? gripAxis(leadHand) : null
  const rearAngle = rearHand ? gripAxis(rearHand) : null

  if (leadAngle === null) return rearAngle
  if (rearAngle === null) return leadAngle

  const leadWeight = sport === 'golf' ? 0.8 : 0.5
  const rearWeight = 1 - leadWeight

  return leadAngle * leadWeight + rearAngle * rearWeight
}
