/**
 * Pose estimation using MediaPipe PoseLandmarker.
 * Processes video frames and returns 33 keypoints for body pose.
 *
 * The FilesetResolver vision instance is exposed via getVisionInstance()
 * so that other detectors (e.g. HandLandmarker) can reuse it without a
 * second CDN fetch.
 */

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision'
import type { PoseLandmarks, PoseResult } from '../types/pose'

export interface DetectPoseResult {
  allPoses: PoseLandmarks[]
  landmarks: PoseLandmarks
  videoTimeSec: number
}

export type PoseResultsCallback = (results: PoseResult) => void

let poseLandmarker: PoseLandmarker | null = null
let lastVideoTime = -1
/** Shared vision instance — reused by HandLandmarker to avoid a second CDN fetch. */
let visionInstance: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null

/**
 * Returns the FilesetResolver vision instance once pose detection has been
 * initialised.  Returns null before the first createPoseDetector() call.
 */
export function getVisionInstance() {
  return visionInstance
}

/**
 * Initialize the MediaPipe PoseLandmarker.
 * Downloads model files on first call (~5MB).
 */
export async function createPoseDetector(): Promise<PoseLandmarker | null> {
  if (poseLandmarker) return poseLandmarker

  try {
    visionInstance = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )

    poseLandmarker = await PoseLandmarker.createFromOptions(visionInstance, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 5,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    return poseLandmarker
  } catch (err) {
    console.error('Failed to create pose detector:', err)
    return null
  }
}

/**
 * Process a video frame and return pose landmarks.
 * Call this in a requestAnimationFrame loop.
 */
export function detectPose(
  video: HTMLVideoElement,
  timestamp: number,
  force = false
): DetectPoseResult | null {
  if (!poseLandmarker || video.readyState < 2) return null

  // Skip if same frame (unless forced, e.g., for seek events)
  if (!force && video.currentTime === lastVideoTime) return null
  lastVideoTime = video.currentTime

  try {
    const result = poseLandmarker.detectForVideo(video, timestamp)

    if (result.landmarks && result.landmarks.length > 0) {
      const allPoses: PoseLandmarks[] = result.landmarks.map((pose) =>
        pose.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility,
        }))
      )
      return {
        allPoses,
        landmarks: allPoses[0],
        videoTimeSec: video.currentTime,
      }
    }
  } catch (err) {
    console.error('Pose detection error:', err)
  }

  return null
}

/**
 * Reset the frame tracking (call when video source changes).
 */
export function resetFrameTracking(): void {
  lastVideoTime = -1
}

/**
 * Clean up the pose detector.
 */
export function closePoseDetector(): void {
  if (poseLandmarker) {
    poseLandmarker.close()
    poseLandmarker = null
  }
  lastVideoTime = -1
}

/**
 * Get DrawingUtils for rendering pose skeleton.
 */
export function getDrawingUtils(ctx: CanvasRenderingContext2D): DrawingUtils {
  return new DrawingUtils(ctx)
}

/**
 * MediaPipe pose connections for drawing skeleton.
 */
export { PoseLandmarker }
