/**
 * Types for pose estimation and swing analysis.
 * Aligns with MediaPipe 33-keypoint model; extend for BlazePose/TF.js as needed.
 */

export interface Landmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type PoseLandmarks = Landmark[]

export interface PoseResult {
  poseLandmarks: PoseLandmarks | null
  timestamp?: number
}

/** Swing phases for baseball/golf (Phase 2–3 will refine detection). */
export type SwingPhase = 'idle' | 'load' | 'contact' | 'follow' | 'unknown'

export interface SwingPhaseFrame {
  phase: SwingPhase
  frameIndex: number
  timestamp?: number
}

/** A single frame of pose data with its timestamp. */
export interface PoseFrame {
  landmarks: PoseLandmarks
  timestamp: number
}

/** Results of swing analysis computed from frame history. */
export interface SwingAnalysis {
  /** Current instantaneous swing speed in estimated mph */
  currentSwingSpeed: number
  /** Peak swing speed detected during current swing in estimated mph */
  peakSwingSpeed: number
  /** Whether a contact point has been detected */
  contactDetected: boolean
  /** Bat angle at detected contact point in degrees from horizontal */
  launchAngle: number | null
  /** Estimated exit velocity in mph */
  exitVelocity: number | null
  /** Current swing phase */
  phase: SwingPhase
  /** Timestamp of contact detection */
  contactTimestamp: number | null
}
