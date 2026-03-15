/**
 * Camera capture and video upload for swing analysis.
 * Supports live camera via getUserMedia and uploaded video files.
 * Auto-selects the most active person (highest movement) as the batter.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPoseDetector, detectPose, resetFrameTracking } from '../lib/pose'
import { detectVideoFps } from '../lib/videoFps'
import type { PoseLandmarks } from '../types/pose'
import type { Roi } from './RoiSelector'

const VIDEO_WIDTH = 640
const VIDEO_HEIGHT = 480

type InputMode = 'camera' | 'upload'

interface VideoDimensions {
  width: number
  height: number
}

interface CameraViewProps {
  /** Called with the selected person's landmarks + video timestamp */
  onPoseResults?: (landmarks: PoseLandmarks | null, videoTimeSec: number) => void
  /** Called when video dimensions change */
  onVideoDimensions?: (dims: VideoDimensions) => void
  /** Called with all detected poses and the selected index */
  onAllPoses?: (allPoses: PoseLandmarks[], selectedIndex: number) => void
  /** Called when video FPS is detected (null = source changed, detection pending) */
  onFpsDetected?: (fps: number | null) => void
  /** Called with the video element when it mounts (null on unmount) */
  onVideoElement?: (el: HTMLVideoElement | null) => void
  /** Region of interest for batter isolation (normalized 0-1 coords) */
  roi?: Roi | null
  /** Children rendered inside the camera-container (e.g., PoseOverlay) */
  children?: React.ReactNode
}

// --- Motion tracking helpers ---

interface TrackedPerson {
  center: { x: number; y: number }
  movement: number // cumulative movement score (decayed)
}

const MOVEMENT_DECAY = 0.90
const MATCH_THRESHOLD = 0.25 // max distance to match same person across frames

function poseTorsoCenter(pose: PoseLandmarks): { x: number; y: number } | null {
  const ls = pose[11]
  const rs = pose[12]
  const lh = pose[23]
  const rh = pose[24]
  if (!ls || !rs || !lh || !rh) return null
  return {
    x: (ls.x + rs.x + lh.x + rh.x) / 4,
    y: (ls.y + rs.y + lh.y + rh.y) / 4,
  }
}

/** Compute full-body movement between two poses using all major landmarks */
function poseMovement(prev: PoseLandmarks, curr: PoseLandmarks): number {
  // Use all major body landmarks (shoulders, elbows, wrists, hips, knees, ankles)
  const BODY_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
  let totalDist = 0
  let count = 0
  for (const idx of BODY_INDICES) {
    const p = prev[idx]
    const c = curr[idx]
    if (!p || !c) continue
    if ((p.visibility ?? 1) < 0.4 || (c.visibility ?? 1) < 0.4) continue
    const dx = c.x - p.x
    const dy = c.y - p.y
    totalDist += Math.sqrt(dx * dx + dy * dy)
    count++
  }
  return count > 0 ? totalDist / count : 0
}

export function CameraView({ onPoseResults, onVideoDimensions, onAllPoses, onFpsDetected, onVideoElement, roi, children }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('camera')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'requesting' | 'live' | 'denied'>('idle')
  const [detectorReady, setDetectorReady] = useState(false)
  const [detectorLoading, setDetectorLoading] = useState(false)

  // Motion tracking: previous frame poses + movement scores
  const trackedRef = useRef<TrackedPerson[]>([])
  const prevPosesRef = useRef<PoseLandmarks[]>([])

  // Pose tracking
  const allPosesRef = useRef<PoseLandmarks[]>([])

  // Input mode tracking for parent
  const inputModeRef = useRef(inputMode)

  // Expose the video element to the parent
  useEffect(() => {
    onVideoElement?.(videoRef.current)
    return () => onVideoElement?.(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clean up camera stream on unmount or when stream changes
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  // Clean up video URL on unmount or when URL changes
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  // Track video dimensions via ResizeObserver for accurate overlay alignment
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateDimensions = () => {
      const rect = video.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        onVideoDimensions?.({ width: rect.width, height: rect.height })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(video)

    video.addEventListener('loadedmetadata', updateDimensions)
    video.addEventListener('play', updateDimensions)

    return () => {
      resizeObserver.disconnect()
      video.removeEventListener('loadedmetadata', updateDimensions)
      video.removeEventListener('play', updateDimensions)
    }
  }, [onVideoDimensions, videoUrl, stream])

  // Initialize pose detector (only once, don't close on re-renders)
  useEffect(() => {
    let mounted = true

    const initDetector = async () => {
      setDetectorLoading(true)
      const detector = await createPoseDetector()
      if (mounted) {
        setDetectorReady(!!detector)
        setDetectorLoading(false)
      }
    }

    initDetector()

    return () => {
      mounted = false
    }
  }, [])

  // Use refs for callbacks to avoid effect re-runs
  const onPoseResultsRef = useRef(onPoseResults)
  useEffect(() => {
    onPoseResultsRef.current = onPoseResults
  }, [onPoseResults])

  const onAllPosesRef = useRef(onAllPoses)
  useEffect(() => {
    onAllPosesRef.current = onAllPoses
  }, [onAllPoses])

  const onFpsDetectedRef = useRef(onFpsDetected)
  useEffect(() => {
    onFpsDetectedRef.current = onFpsDetected
  }, [onFpsDetected])

  useEffect(() => {
    const prevMode = inputModeRef.current
    inputModeRef.current = inputMode
    if (prevMode !== inputMode) {
      // Notify parent of mode change so it can reset speed multiplier
      onFpsDetectedRef.current?.(inputMode === 'camera' ? 0 : null)
    }
  }, [inputMode])

  const roiRef = useRef(roi)
  useEffect(() => {
    roiRef.current = roi
  }, [roi])

  // Process a detection result: auto-select most active person via motion tracking
  const handleDetectionResult = useCallback((
    allPoses: PoseLandmarks[],
    videoTimeSec: number,
  ) => {
    if (allPoses.length === 0) {
      allPosesRef.current = []
      trackedRef.current = []
      prevPosesRef.current = []
      onAllPosesRef.current?.([], -1)
      onPoseResultsRef.current?.(null, videoTimeSec)
      return
    }

    allPosesRef.current = allPoses

    // Filter by ROI if set
    const activeRoi = roiRef.current
    let candidatePoses = allPoses
    if (activeRoi) {
      candidatePoses = allPoses.filter((pose) => {
        const center = poseTorsoCenter(pose)
        if (!center) return false
        return (
          center.x >= activeRoi.x &&
          center.x <= activeRoi.x + activeRoi.w &&
          center.y >= activeRoi.y &&
          center.y <= activeRoi.y + activeRoi.h
        )
      })
      if (candidatePoses.length === 0) {
        // No one in the ROI — report all poses but no selected batter
        onAllPosesRef.current?.(allPoses, -1)
        onPoseResultsRef.current?.(null, videoTimeSec)
        return
      }
    }

    // Single candidate — just use them
    if (candidatePoses.length === 1) {
      const selected = candidatePoses[0]
      const selectedIdx = allPoses.indexOf(selected)
      const center = poseTorsoCenter(selected)
      if (center && prevPosesRef.current.length > 0) {
        const mv = poseMovement(prevPosesRef.current[0] ?? selected, selected)
        trackedRef.current = [{ center, movement: (trackedRef.current[0]?.movement ?? 0) * MOVEMENT_DECAY + mv }]
      } else if (center) {
        trackedRef.current = [{ center, movement: 0 }]
      }
      prevPosesRef.current = candidatePoses
      onAllPosesRef.current?.(allPoses, selectedIdx)
      onPoseResultsRef.current?.(selected, videoTimeSec)
      return
    }

    // Multiple candidates — match current poses to previously tracked people
    const prevTracked = trackedRef.current
    const prevPoses = prevPosesRef.current
    const currCenters = candidatePoses.map((p) => poseTorsoCenter(p))

    // Build new tracked list for current frame
    const newTracked: TrackedPerson[] = new Array(candidatePoses.length)
    const usedPrev = new Set<number>()

    for (let i = 0; i < candidatePoses.length; i++) {
      const cc = currCenters[i]
      if (!cc) {
        newTracked[i] = { center: { x: 0, y: 0 }, movement: 0 }
        continue
      }

      // Find best matching previous tracked person by torso center distance
      let bestDist = Infinity
      let bestJ = -1
      for (let j = 0; j < prevTracked.length; j++) {
        if (usedPrev.has(j)) continue
        const pc = prevTracked[j].center
        const dx = cc.x - pc.x
        const dy = cc.y - pc.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < bestDist) {
          bestDist = dist
          bestJ = j
        }
      }

      if (bestJ >= 0 && bestDist < MATCH_THRESHOLD && prevPoses[bestJ]) {
        usedPrev.add(bestJ)
        const mv = poseMovement(prevPoses[bestJ], candidatePoses[i])
        newTracked[i] = {
          center: cc,
          movement: prevTracked[bestJ].movement * MOVEMENT_DECAY + mv,
        }
      } else {
        // New person, no match
        newTracked[i] = { center: cc, movement: 0 }
      }
    }

    trackedRef.current = newTracked
    prevPosesRef.current = candidatePoses

    // Select person with highest movement score among candidates
    let bestCandidateIdx = 0
    let maxMovement = -1
    for (let i = 0; i < newTracked.length; i++) {
      if (newTracked[i].movement > maxMovement) {
        maxMovement = newTracked[i].movement
        bestCandidateIdx = i
      }
    }

    const selected = candidatePoses[bestCandidateIdx]
    const selectedIdx = allPoses.indexOf(selected)
    onAllPosesRef.current?.(allPoses, selectedIdx)
    onPoseResultsRef.current?.(selected, videoTimeSec)
  }, [])


  // Start/stop frame processing based on video state
  useEffect(() => {
    const video = videoRef.current
    const shouldProcess =
      (inputMode === 'camera' && status === 'live') ||
      (inputMode === 'upload' && videoUrl)

    if (!shouldProcess || !detectorReady || !video) {
      return
    }

    let running = true

    const processFrame = () => {
      if (!running) return

      if (video.readyState >= 2) {
        const result = detectPose(video, performance.now())
        if (result) {
          handleDetectionResult(result.allPoses, result.videoTimeSec)
        }
      }

      if (!video.paused && !video.ended) {
        animationFrameRef.current = requestAnimationFrame(processFrame)
      } else {
        animationFrameRef.current = null
      }
    }

    const handleSeek = () => {
      if (running && video.readyState >= 2) {
        const result = detectPose(video, performance.now(), true)
        if (result) {
          handleDetectionResult(result.allPoses, result.videoTimeSec)
        }
      }
    }

    const handlePlay = () => {
      if (running) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        animationFrameRef.current = requestAnimationFrame(processFrame)
      }
    }

    video.addEventListener('seeked', handleSeek)
    video.addEventListener('play', handlePlay)

    animationFrameRef.current = requestAnimationFrame(processFrame)

    return () => {
      running = false
      video.removeEventListener('seeked', handleSeek)
      video.removeEventListener('play', handlePlay)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [inputMode, status, videoUrl, detectorReady, handleDetectionResult])

  // Run pose detection on the first frame of uploaded videos (paused)
  useEffect(() => {
    if (inputMode !== 'upload' || !videoUrl || !detectorReady) return
    const video = videoRef.current
    if (!video) return

    const handleLoaded = () => {
      if (video.paused && video.readyState >= 2) {
        const result = detectPose(video, performance.now(), true)
        if (result) {
          handleDetectionResult(result.allPoses, result.videoTimeSec)
        }
      }
    }

    video.addEventListener('loadeddata', handleLoaded)
    // Also try immediately in case already loaded
    if (video.readyState >= 2 && video.paused) {
      handleLoaded()
    }

    return () => {
      video.removeEventListener('loadeddata', handleLoaded)
    }
  }, [inputMode, videoUrl, detectorReady, handleDetectionResult])

  const resetMotionTracking = () => {
    trackedRef.current = []
    prevPosesRef.current = []
    allPosesRef.current = []
  }

  const startCamera = async () => {
    setError(null)
    setStatus('requesting')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: VIDEO_WIDTH },
          height: { ideal: VIDEO_HEIGHT },
        },
        audio: false,
      })
      setStream(mediaStream)
      setStatus('live')
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      setStatus('denied')
      setError(err instanceof Error ? err.message : 'Camera access failed')
    }
  }

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setStatus('idle')
    resetMotionTracking()

    onPoseResults?.(null, 0)
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const backToCamera = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
      setVideoUrl(null)
      if (videoRef.current) {
        videoRef.current.src = ''
        videoRef.current.srcObject = null
      }
    }
    resetMotionTracking()

    onPoseResults?.(null, 0)
    setError(null)
    setInputMode('camera')
    // Will auto-start via the effect above if detector is ready
    if (detectorReady) {
      startCamera()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Stop camera if running
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
      setStatus('idle')
      if (videoRef.current) videoRef.current.srcObject = null
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }

    resetFrameTracking()
    resetMotionTracking()

    setInputMode('upload')
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setError(null)

    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.src = url
    }

    // Auto-detect source FPS from file metadata
    const fps = await detectVideoFps(file)
    // Negative value = auto-detected FPS from upload, null = unknown, 0 = live camera
    onFpsDetectedRef.current?.(fps ? -fps : null)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const showVideo = inputMode === 'camera' ? status === 'live' : !!videoUrl
  const isLoading = detectorLoading || (inputMode === 'camera' && status === 'requesting')

  return (
    <section className="camera-view">
      <div
        className={`camera-container ${inputMode === 'camera' ? status : 'upload'}`}
      >
        <video
          ref={videoRef}
          autoPlay={inputMode === 'camera'}
          playsInline
          muted={inputMode === 'camera'}
          controls={inputMode === 'upload' && !!videoUrl}
          preload="auto"
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          style={{ maxWidth: '100%', background: '#111' }}
          className={showVideo ? 'visible' : 'hidden'}
        />

        {/* Pose overlay and other children rendered over the video */}
        {showVideo && children}

        {/* Overlay buttons on video */}
        {showVideo && (
          <div className="video-overlay-controls">
            <button
              type="button"
              className="overlay-btn upload-icon-btn"
              onClick={triggerFileInput}
              title="Upload video"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            {inputMode === 'camera' && (
              <button
                type="button"
                className="overlay-btn stop-icon-btn"
                onClick={stopCamera}
                title="Stop camera"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
            {inputMode === 'upload' && (
              <button
                type="button"
                className="overlay-btn camera-icon-btn"
                onClick={backToCamera}
                title="Back to camera"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Idle state — show both options */}
        {!showVideo && !isLoading && status !== 'denied' && (
          <div className="camera-placeholder">
            <div className="start-actions">
              <button type="button" onClick={startCamera} disabled={detectorLoading}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Start Camera
              </button>
              <button type="button" onClick={triggerFileInput} disabled={detectorLoading}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Video
              </button>
            </div>
            {detectorLoading && <p className="small">Loading pose detector...</p>}
          </div>
        )}

        {/* Loading states */}
        {isLoading && (
          <div className="camera-placeholder">
            {detectorLoading ? 'Loading pose detector...' : 'Requesting camera...'}
          </div>
        )}

        {/* Camera denied — show options again */}
        {inputMode === 'camera' && status === 'denied' && (
          <div className="camera-placeholder camera-error">
            <p>Camera access denied</p>
            <p className="small">{error}</p>
            <div className="start-actions">
              <button type="button" onClick={startCamera}>
                Try Again
              </button>
              <button type="button" onClick={triggerFileInput}>
                Upload Video
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </section>
  )
}
