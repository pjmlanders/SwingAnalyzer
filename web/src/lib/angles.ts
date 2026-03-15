/**
 * Joint angle and velocity calculations from pose keypoints.
 * Uses vector math for shoulder, elbow, hip, etc.
 */

import type { Landmark, PoseLandmarks } from '../types/pose'

// MediaPipe pose landmark indices
export const LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

/**
 * Calculate angle at point B formed by vectors BA and BC (in degrees).
 */
export function angleBetweenPoints(
  a: Landmark,
  b: Landmark,
  c: Landmark
): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }

  const dotProduct = ba.x * bc.x + ba.y * bc.y
  const magnitudeBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y)
  const magnitudeBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y)

  if (magnitudeBA === 0 || magnitudeBC === 0) return 0

  const cosAngle = dotProduct / (magnitudeBA * magnitudeBC)
  // Clamp to avoid floating point errors with acos
  const clampedCos = Math.max(-1, Math.min(1, cosAngle))
  const angleRad = Math.acos(clampedCos)

  return (angleRad * 180) / Math.PI
}

/**
 * Calculate the angle of a line relative to horizontal (in degrees).
 */
export function lineAngle(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/**
 * Hip-shoulder separation angle (X-factor).
 * Positive value means shoulders are rotated ahead of hips.
 */
export function hipShoulderSeparation(landmarks: PoseLandmarks): number {
  const leftHip = landmarks[LANDMARKS.LEFT_HIP]
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP]
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER]
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER]

  if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) return 0

  const hipAngle = lineAngle(leftHip, rightHip)
  const shoulderAngle = lineAngle(leftShoulder, rightShoulder)

  return shoulderAngle - hipAngle
}

/**
 * Calculate elbow angle (extension/flexion).
 */
export function elbowAngle(landmarks: PoseLandmarks, side: 'left' | 'right'): number {
  const shoulderIdx = side === 'left' ? LANDMARKS.LEFT_SHOULDER : LANDMARKS.RIGHT_SHOULDER
  const elbowIdx = side === 'left' ? LANDMARKS.LEFT_ELBOW : LANDMARKS.RIGHT_ELBOW
  const wristIdx = side === 'left' ? LANDMARKS.LEFT_WRIST : LANDMARKS.RIGHT_WRIST

  const shoulder = landmarks[shoulderIdx]
  const elbow = landmarks[elbowIdx]
  const wrist = landmarks[wristIdx]

  if (!shoulder || !elbow || !wrist) return 0

  return angleBetweenPoints(shoulder, elbow, wrist)
}

/**
 * Calculate knee angle (extension/flexion).
 */
export function kneeAngle(landmarks: PoseLandmarks, side: 'left' | 'right'): number {
  const hipIdx = side === 'left' ? LANDMARKS.LEFT_HIP : LANDMARKS.RIGHT_HIP
  const kneeIdx = side === 'left' ? LANDMARKS.LEFT_KNEE : LANDMARKS.RIGHT_KNEE
  const ankleIdx = side === 'left' ? LANDMARKS.LEFT_ANKLE : LANDMARKS.RIGHT_ANKLE

  const hip = landmarks[hipIdx]
  const knee = landmarks[kneeIdx]
  const ankle = landmarks[ankleIdx]

  if (!hip || !knee || !ankle) return 0

  return angleBetweenPoints(hip, knee, ankle)
}

/**
 * Calculate hip angle (torso bend).
 */
export function hipAngle(landmarks: PoseLandmarks, side: 'left' | 'right'): number {
  const shoulderIdx = side === 'left' ? LANDMARKS.LEFT_SHOULDER : LANDMARKS.RIGHT_SHOULDER
  const hipIdx = side === 'left' ? LANDMARKS.LEFT_HIP : LANDMARKS.RIGHT_HIP
  const kneeIdx = side === 'left' ? LANDMARKS.LEFT_KNEE : LANDMARKS.RIGHT_KNEE

  const shoulder = landmarks[shoulderIdx]
  const hip = landmarks[hipIdx]
  const knee = landmarks[kneeIdx]

  if (!shoulder || !hip || !knee) return 0

  return angleBetweenPoints(shoulder, hip, knee)
}

/**
 * Estimate bat angle from wrist positions.
 * Assumes bat extends from hands - angle of line between wrists.
 */
export function estimatedBatAngle(landmarks: PoseLandmarks): number {
  const leftWrist = landmarks[LANDMARKS.LEFT_WRIST]
  const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST]

  if (!leftWrist || !rightWrist) return 0

  return lineAngle(leftWrist, rightWrist)
}

/**
 * Hand position height relative to shoulders (for swing phase detection).
 * Returns value from -1 (hands at hips) to 1 (hands above head).
 */
export function handHeight(landmarks: PoseLandmarks): number {
  const leftWrist = landmarks[LANDMARKS.LEFT_WRIST]
  const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST]
  const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER]
  const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER]
  const leftHip = landmarks[LANDMARKS.LEFT_HIP]

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip) return 0

  const avgWristY = (leftWrist.y + rightWrist.y) / 2
  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2
  const hipY = leftHip.y

  // Normalize: 0 at shoulders, negative above, positive below
  const range = hipY - avgShoulderY
  if (range === 0) return 0

  return (avgWristY - avgShoulderY) / range
}

/**
 * Stance width (distance between ankles relative to hip width).
 */
export function stanceWidth(landmarks: PoseLandmarks): number {
  const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE]
  const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE]
  const leftHip = landmarks[LANDMARKS.LEFT_HIP]
  const rightHip = landmarks[LANDMARKS.RIGHT_HIP]

  if (!leftAnkle || !rightAnkle || !leftHip || !rightHip) return 0

  const ankleWidth = Math.abs(rightAnkle.x - leftAnkle.x)
  const hipWidth = Math.abs(rightHip.x - leftHip.x)

  if (hipWidth === 0) return 0

  return ankleWidth / hipWidth
}

export interface SwingMetrics {
  hipShoulderSeparation: number
  leadElbowAngle: number
  rearElbowAngle: number
  leadKneeAngle: number
  rearKneeAngle: number
  batAngle: number
  handHeight: number
  stanceWidth: number
}

/**
 * Calculate all swing metrics from landmarks.
 * Assumes right-handed batter (left side = lead, right side = rear).
 */
export function calculateSwingMetrics(landmarks: PoseLandmarks): SwingMetrics {
  return {
    hipShoulderSeparation: hipShoulderSeparation(landmarks),
    leadElbowAngle: elbowAngle(landmarks, 'left'),
    rearElbowAngle: elbowAngle(landmarks, 'right'),
    leadKneeAngle: kneeAngle(landmarks, 'left'),
    rearKneeAngle: kneeAngle(landmarks, 'right'),
    batAngle: estimatedBatAngle(landmarks),
    handHeight: handHeight(landmarks),
    stanceWidth: stanceWidth(landmarks),
  }
}
