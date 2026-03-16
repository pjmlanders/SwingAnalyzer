/**
 * MediaPipe HandLandmarker wrapper (Phase 4 — Precision Mode).
 *
 * Shares the FilesetResolver vision instance from pose.ts to avoid
 * a second CDN WASM fetch.  initHandLandmarker() must be called after
 * createPoseDetector() has resolved, or it will load its own instance.
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { getVisionInstance } from './pose'
import type { Landmark } from '../types/pose'

export type HandLandmarks = Landmark[]

let handLandmarker: HandLandmarker | null = null
let lastHandVideoTime = -1

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export async function initHandLandmarker(): Promise<HandLandmarker | null> {
  if (handLandmarker) return handLandmarker

  try {
    // Reuse the vision instance from pose.ts if available, otherwise load fresh
    const vision =
      getVisionInstance() ??
      (await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      ))

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    return handLandmarker
  } catch (err) {
    console.error('Failed to create hand landmarker:', err)
    return null
  }
}

export interface HandDetectResult {
  left: HandLandmarks | null
  right: HandLandmarks | null
}

/**
 * Detect hands in the current video frame.
 * Returns null if the landmarker is not ready or on duplicate frames.
 */
export function detectHands(
  video: HTMLVideoElement,
  timestamp: number,
): HandDetectResult | null {
  if (!handLandmarker || video.readyState < 2) return null
  if (video.currentTime === lastHandVideoTime) return null
  lastHandVideoTime = video.currentTime

  try {
    const result = handLandmarker.detectForVideo(video, timestamp)
    const out: HandDetectResult = { left: null, right: null }

    for (let i = 0; i < result.landmarks.length; i++) {
      const handednessLabel =
        result.handedness[i]?.[0]?.categoryName?.toLowerCase() ?? ''
      const lms: HandLandmarks = result.landmarks[i].map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: (lm as { score?: number }).score,
      }))
      if (handednessLabel === 'left') out.left = lms
      else if (handednessLabel === 'right') out.right = lms
    }

    return out
  } catch (err) {
    console.error('Hand detection error:', err)
    return null
  }
}

export function closeHandLandmarker(): void {
  if (handLandmarker) {
    handLandmarker.close()
    handLandmarker = null
  }
  lastHandVideoTime = -1
}
