/**
 * AI-powered coaching feedback panel.
 * Captures the current video frame + pose metrics on button press,
 * sends them to Gemini, and displays structured coaching feedback.
 */

import { useState, useCallback } from 'react'
import {
  analyzeSwingWithAI,
  captureVideoFrame,
  isGeminiAvailable,
  type AISwingFeedback,
  type CoachingMode,
} from '../lib/gemini'
import { calculateSwingMetrics } from '../lib/angles'
import { buildFeedback } from '../lib/fundamentalsEngine'
import type { PoseLandmarks } from '../types/pose'
import type { SwingAnalysis } from '../types/pose'
import type { Sport, Handedness } from '../types/fundamentals'

interface AIFeedbackPanelProps {
  landmarks: PoseLandmarks | null
  swingAnalysis: SwingAnalysis | null
  videoElement: HTMLVideoElement | null
  sport: Sport
  handedness: Handedness
}

export function AIFeedbackPanel({
  landmarks,
  swingAnalysis,
  videoElement,
  sport,
  handedness,
}: AIFeedbackPanelProps) {
  const [mode, setMode] = useState<CoachingMode>('player')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<AISwingFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAnalyze = !!landmarks && landmarks.length >= 33 && !loading

  const handleAnalyze = useCallback(async () => {
    if (!landmarks || landmarks.length < 33) return

    const metrics = calculateSwingMetrics(landmarks, handedness)
    const scoredMetrics = buildFeedback(metrics, swingAnalysis?.phase ?? 'idle', sport, handedness)
    const imageDataUrl = videoElement ? captureVideoFrame(videoElement) : null

    setLoading(true)
    setError(null)

    try {
      const result = await analyzeSwingWithAI(
        metrics,
        swingAnalysis,
        imageDataUrl,
        mode,
        sport,
        handedness,
        scoredMetrics,
      )
      setFeedback(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [landmarks, swingAnalysis, videoElement, mode, sport, handedness])

  if (!isGeminiAvailable()) {
    return (
      <aside className="ai-feedback-panel ai-feedback-panel--unavailable">
        <h3>AI Coaching</h3>
        <p className="ai-feedback-notice">
          Add <code>VITE_GEMINI_API_KEY</code> to your <code>.env</code> file to enable AI feedback.
        </p>
      </aside>
    )
  }

  return (
    <aside className="ai-feedback-panel">
      <div className="ai-feedback-header">
        <h3>AI Coaching</h3>
        <div className="ai-mode-toggle">
          <button
            type="button"
            className={mode === 'player' ? 'active' : ''}
            onClick={() => setMode('player')}
          >
            Player
          </button>
          <button
            type="button"
            className={mode === 'coach' ? 'active' : ''}
            onClick={() => setMode('coach')}
          >
            Coach
          </button>
        </div>
      </div>

      <button
        type="button"
        className="analyze-button"
        onClick={handleAnalyze}
        disabled={!canAnalyze}
      >
        {loading ? 'Analyzing...' : 'Analyze Swing'}
      </button>

      {!landmarks && (
        <p className="ai-feedback-notice">Start camera or upload a video to enable analysis.</p>
      )}

      {error && <p className="ai-feedback-error">{error}</p>}

      {feedback && !loading && (
        <div className="ai-feedback-results">
          <div className="ai-score">
            <span className="ai-score-label">Swing Score</span>
            <span className={`ai-score-value score-${Math.floor(feedback.score / 3)}`}>
              {feedback.score}/10
            </span>
          </div>

          <p className="ai-summary">{feedback.summary}</p>

          <div className="ai-section">
            <h4>Strengths</h4>
            <ul>
              {feedback.strengths.map((s, i) => (
                <li key={i} className="ai-strength">{s}</li>
              ))}
            </ul>
          </div>

          <div className="ai-section">
            <h4>Improvements</h4>
            <ul>
              {feedback.improvements.map((imp, i) => (
                <li key={i} className="ai-improvement">{imp}</li>
              ))}
            </ul>
          </div>

          <div className="ai-section">
            <h4>Drills</h4>
            {feedback.drills.map((drill, i) => (
              <div key={i} className="ai-drill">
                <strong>{drill.title}</strong>
                <ol>
                  {drill.steps.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
