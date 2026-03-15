import { useState, useRef, useCallback } from 'react'
import { CameraView } from './components/CameraView'
import { PoseOverlay } from './components/PoseOverlay'
import { RoiSelector, type Roi } from './components/RoiSelector'
import { MetricsPanel } from './components/MetricsPanel'
import { AIFeedbackPanel } from './components/AIFeedbackPanel'
import { FrameBuffer } from './lib/frameBuffer'
import { analyzeSwing, createContactDetectorState } from './lib/swingAnalyzer'
import type { PoseLandmarks, SwingAnalysis } from './types/pose'
import './App.css'

function App() {
  const [landmarks, setLandmarks] = useState<PoseLandmarks | null>(null)
  const [videoDims, setVideoDims] = useState({ width: 640, height: 480 })
  const [swingAnalysis, setSwingAnalysis] = useState<SwingAnalysis | null>(null)
  const [allPoses, setAllPoses] = useState<PoseLandmarks[]>([])
  const [selectedPoseIndex, setSelectedPoseIndex] = useState(-1)
  const [roi, setRoi] = useState<Roi | null>(null)
  const [roiDrawing, setRoiDrawing] = useState(false)

  // Speed multiplier: 1 for live camera, auto-detected or user-selectable for uploads
  const [isLiveCamera, setIsLiveCamera] = useState(true)
  const [detectedFps, setDetectedFps] = useState<number | null>(null)
  const [isSlowMo, setIsSlowMo] = useState(false)
  const [slowMoFactor, setSlowMoFactor] = useState(4)

  // Auto-set slow-mo from detected FPS, or use manual toggle
  const autoMultiplier = detectedFps && detectedFps > 60 ? Math.round(detectedFps / 30) : 1
  const speedMultiplier = isLiveCamera ? 1 : isSlowMo ? slowMoFactor : autoMultiplier

  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  const frameBufferRef = useRef(new FrameBuffer())
  const contactStateRef = useRef(createContactDetectorState())
  const speedMultiplierRef = useRef(speedMultiplier)
  speedMultiplierRef.current = speedMultiplier

  const handleFpsDetected = useCallback((fps: number | null) => {
    if (fps === 0) {
      // Live camera
      setIsLiveCamera(true)
      setDetectedFps(null)
      setIsSlowMo(false)
    } else if (fps !== null && fps < 0) {
      // Auto-detected from uploaded file (negative = detected FPS)
      setIsLiveCamera(false)
      const sourceFps = -fps
      setDetectedFps(sourceFps)
      // Auto-enable slow-mo if high FPS detected
      if (sourceFps > 60) {
        setIsSlowMo(false) // use auto multiplier, not manual
        setSlowMoFactor(Math.round(sourceFps / 30))
      } else {
        setIsSlowMo(false)
      }
    } else {
      // null = uploaded file, FPS unknown
      setIsLiveCamera(false)
      setDetectedFps(null)
    }
  }, [])

  const handlePoseResults = useCallback((newLandmarks: PoseLandmarks | null, videoTimeSec: number) => {
    setLandmarks(newLandmarks)

    if (!newLandmarks || newLandmarks.length < 33) {
      frameBufferRef.current.clear()
      contactStateRef.current = createContactDetectorState()
      setSwingAnalysis(null)
      return
    }

    frameBufferRef.current.push(newLandmarks, videoTimeSec * 1000)

    if (frameBufferRef.current.length >= 3) {
      const result = analyzeSwing(
        frameBufferRef.current,
        contactStateRef.current,
        speedMultiplierRef.current,
      )
      contactStateRef.current = result.contactState
      setSwingAnalysis(result.analysis)
    }
  }, [])

  const handleAllPoses = useCallback((poses: PoseLandmarks[], selectedIdx: number) => {
    setAllPoses(poses)
    setSelectedPoseIndex(selectedIdx)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Swing Analyzer</h1>
        <p>Real-time baseball &amp; golf swing analysis</p>
      </header>

      <main className="app-main">
        <div className="camera-section">
          <div className="camera-wrapper">
            <CameraView
              onPoseResults={handlePoseResults}
              onVideoDimensions={setVideoDims}
              onAllPoses={handleAllPoses}
              onFpsDetected={handleFpsDetected}
              onVideoElement={(el) => { videoElementRef.current = el }}
              roi={roi}
            >
              <PoseOverlay
                landmarks={landmarks}
                allPoses={allPoses}
                selectedIndex={selectedPoseIndex}
                width={videoDims.width}
                height={videoDims.height}
              />
              <RoiSelector
                roi={roi}
                onRoiChange={(r) => { setRoi(r); if (r) setRoiDrawing(false) }}
                width={videoDims.width}
                height={videoDims.height}
                enabled={roiDrawing}
              />
            </CameraView>
          </div>
          {landmarks && allPoses.length > 1 && (
            <div className="roi-controls">
              <button
                type="button"
                className={`roi-toggle ${roiDrawing ? 'active' : ''}`}
                onClick={() => setRoiDrawing(!roiDrawing)}
              >
                {roiDrawing ? 'Drawing... drag on video' : roi ? 'Redraw batter region' : 'Select batter region'}
              </button>
              {roi && (
                <button type="button" className="roi-clear-btn" onClick={() => setRoi(null)}>
                  Clear
                </button>
              )}
            </div>
          )}
          {landmarks && !isLiveCamera && (
            <div className="speed-selector">
              {detectedFps && detectedFps > 60 ? (
                <span className="speed-status">
                  Slow-mo detected: {detectedFps}fps ({autoMultiplier}x correction applied)
                </span>
              ) : (
                <label className="slowmo-toggle">
                  <input
                    type="checkbox"
                    checked={isSlowMo}
                    onChange={(e) => setIsSlowMo(e.target.checked)}
                  />
                  <span>Slow-mo recording?{detectedFps ? ` (${detectedFps}fps detected)` : ''}</span>
                  {isSlowMo && (
                    <select
                      value={slowMoFactor}
                      onChange={(e) => setSlowMoFactor(Number(e.target.value))}
                    >
                      <option value={2}>2x (60fps source)</option>
                      <option value={4}>4x (120fps source)</option>
                      <option value={8}>8x (240fps source)</option>
                    </select>
                  )}
                </label>
              )}
            </div>
          )}
        </div>
        <MetricsPanel landmarks={landmarks} swingAnalysis={swingAnalysis} />
        <AIFeedbackPanel
          landmarks={landmarks}
          swingAnalysis={swingAnalysis}
          videoElement={videoElementRef.current}
        />
      </main>

      <footer className="app-footer">
        <div className="app-instructions">
          <strong>How to use:</strong> The camera starts automatically. Use the upload icon to analyze a recorded video.
          If multiple people are in frame, draw a region around the batter to isolate them.
        </div>
      </footer>
    </div>
  )
}

export default App
