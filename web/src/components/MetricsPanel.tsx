/**
 * Displays real-time swing metrics calculated from pose landmarks.
 */

import { useMemo } from 'react'
import { calculateSwingMetrics, type SwingMetrics } from '../lib/angles'
import type { PoseLandmarks, SwingAnalysis } from '../types/pose'

interface MetricsPanelProps {
  landmarks: PoseLandmarks | null
  swingAnalysis: SwingAnalysis | null
}

function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`
}

function formatRatio(value: number): string {
  return value.toFixed(2)
}

function formatSpeed(mph: number | null | undefined): string {
  if (mph == null || mph <= 0) return '--'
  return `${mph.toFixed(0)} mph`
}

interface MetricRowProps {
  label: string
  value: string
  hint?: string
}

function MetricRow({ label, value, hint }: MetricRowProps) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  )
}

export function getSwingFeedback(
  metrics: SwingMetrics,
  swing: SwingAnalysis | null,
): string[] {
  const feedback: string[] = []

  // Hip-shoulder separation (X-factor) feedback
  const xFactor = Math.abs(metrics.hipShoulderSeparation)
  if (xFactor > 30) {
    feedback.push('Good hip-shoulder separation for power generation')
  } else if (xFactor < 15) {
    feedback.push('Try to create more separation between hips and shoulders')
  }

  // Elbow angles
  if (metrics.rearElbowAngle < 90) {
    feedback.push('Rear elbow is well tucked')
  } else if (metrics.rearElbowAngle > 120) {
    feedback.push('Consider keeping rear elbow closer to body')
  }

  // Knee bend
  if (metrics.leadKneeAngle > 160) {
    feedback.push('Lead leg is firm - good for power transfer')
  } else if (metrics.leadKneeAngle < 140) {
    feedback.push('Lead knee has good bend for loading')
  }

  // Stance width
  if (metrics.stanceWidth > 1.5 && metrics.stanceWidth < 2.5) {
    feedback.push('Good athletic stance width')
  } else if (metrics.stanceWidth < 1.2) {
    feedback.push('Stance may be too narrow')
  } else if (metrics.stanceWidth > 3) {
    feedback.push('Stance may be too wide')
  }

  // Hand position
  if (metrics.handHeight < 0) {
    feedback.push('Hands are in a high ready position')
  } else if (metrics.handHeight > 0.5) {
    feedback.push('Hands are low - may indicate follow-through')
  }

  // Swing dynamics feedback
  if (swing?.contactDetected) {
    feedback.push('Contact point detected!')
    if (swing.launchAngle != null) {
      const la = swing.launchAngle
      if (la > 10 && la < 30) {
        feedback.push(`Launch angle ${la.toFixed(0)}° — line-drive sweet spot`)
      } else if (la > 35) {
        feedback.push(`Launch angle ${la.toFixed(0)}° — steep, may produce fly balls`)
      } else if (la < 5) {
        feedback.push(`Launch angle ${la.toFixed(0)}° — flat, may produce grounders`)
      }
    }
  }
  if (swing && swing.peakSwingSpeed > 0) {
    if (swing.peakSwingSpeed > 70) {
      feedback.push('Strong swing speed — competitive bat speed')
    } else if (swing.peakSwingSpeed > 50) {
      feedback.push('Solid swing speed')
    }
  }

  return feedback.length > 0 ? feedback : ['Analyzing swing mechanics...']
}

export function MetricsPanel({ landmarks, swingAnalysis }: MetricsPanelProps) {
  const metrics = useMemo(() => {
    if (!landmarks || landmarks.length < 33) return null
    return calculateSwingMetrics(landmarks)
  }, [landmarks])

  const feedback = useMemo(() => {
    if (!metrics) return []
    return getSwingFeedback(metrics, swingAnalysis)
  }, [metrics, swingAnalysis])

  if (!landmarks) {
    return (
      <aside className="metrics-panel">
        <h3>Swing Metrics</h3>
        <p className="placeholder">
          Upload a video or start camera to see real-time swing analysis.
        </p>
      </aside>
    )
  }

  if (!metrics) {
    return (
      <aside className="metrics-panel">
        <h3>Swing Metrics</h3>
        <p className="placeholder">Waiting for pose detection...</p>
      </aside>
    )
  }

  return (
    <aside className="metrics-panel">
      <h3>Swing Metrics</h3>

      <div className="metrics-grid">
        <div className="metrics-section">
          <h4>Body Rotation</h4>
          <MetricRow
            label="Hip-Shoulder Sep."
            value={formatAngle(metrics.hipShoulderSeparation)}
            hint="X-factor"
          />
          <MetricRow
            label="Bat Angle"
            value={formatAngle(metrics.batAngle)}
            hint="From wrists"
          />
        </div>

        <div className="metrics-section">
          <h4>Arms</h4>
          <MetricRow
            label="Lead Elbow"
            value={formatAngle(metrics.leadElbowAngle)}
          />
          <MetricRow
            label="Rear Elbow"
            value={formatAngle(metrics.rearElbowAngle)}
          />
          <MetricRow
            label="Hand Height"
            value={formatRatio(metrics.handHeight)}
          />
        </div>

        <div className="metrics-section">
          <h4>Lower Body</h4>
          <MetricRow
            label="Lead Knee"
            value={formatAngle(metrics.leadKneeAngle)}
          />
          <MetricRow
            label="Rear Knee"
            value={formatAngle(metrics.rearKneeAngle)}
          />
          <MetricRow
            label="Stance Width"
            value={formatRatio(metrics.stanceWidth)}
            hint="× hip width"
          />
        </div>

        <div className="metrics-section">
          <h4>Swing Dynamics</h4>
          <MetricRow
            label="Swing Speed"
            value={formatSpeed(swingAnalysis?.currentSwingSpeed)}
            hint="live"
          />
          <MetricRow
            label="Peak Speed"
            value={formatSpeed(swingAnalysis?.peakSwingSpeed)}
            hint="max"
          />
          <MetricRow
            label="Contact"
            value={swingAnalysis?.contactDetected ? 'DETECTED' : 'Watching...'}
            hint={swingAnalysis?.phase ?? ''}
          />
          {swingAnalysis?.contactDetected && (
            <>
              <MetricRow
                label="Launch Angle"
                value={swingAnalysis.launchAngle != null
                  ? formatAngle(swingAnalysis.launchAngle)
                  : '--'}
                hint="estimated"
              />
              <MetricRow
                label="Exit Velocity"
                value={formatSpeed(swingAnalysis.exitVelocity)}
                hint="estimated"
              />
            </>
          )}
        </div>
      </div>

      <div className="metrics-feedback">
        <h4>Analysis</h4>
        <ul>
          {feedback.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
