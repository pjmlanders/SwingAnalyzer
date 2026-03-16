/**
 * Fundamentals scoring engine.
 * Evaluates swing metrics against sport- and handedness-aware rules,
 * returning scored results with coaching feedback and source citations.
 */

import type {
  MetricBand,
  MetricScore,
  FundamentalsConfig,
  FundamentalsPhase,
  ScoredMetric,
  Sport,
  Handedness,
} from '../types/fundamentals'
import type { SwingMetrics } from './angles'
import type { SwingPhase } from '../types/pose'
import { baseballFundamentals } from '../fundamentals/baseball'
import { golfFundamentals } from '../fundamentals/golf'

/**
 * Map SwingPhase (velocity-based) to FundamentalsPhase (pose-geometry-based).
 * 'idle' and 'unknown' both map to 'setup' (standing at address/plate).
 */
export function toFundamentalsPhase(phase: SwingPhase): FundamentalsPhase {
  if (phase === 'load') return 'load'
  if (phase === 'contact') return 'contact'
  if (phase === 'follow') return 'follow'
  return 'setup'
}

/**
 * Score a single metric value against its band thresholds.
 */
export function scoreValue(value: number, bands: MetricBand): MetricScore {
  if (value < bands.tooLow) return 'too_low'
  if (value < bands.low) return 'acceptable_low'
  if (value <= bands.high) return 'ideal'
  if (value <= bands.tooHigh) return 'acceptable_high'
  return 'too_high'
}

/**
 * Evaluate all fundamentals rules for the current phase.
 * Returns only rules that apply to the mapped FundamentalsPhase.
 */
export function evaluateFundamentals(
  metrics: SwingMetrics,
  config: FundamentalsConfig,
  phase: SwingPhase,
): ScoredMetric[] {
  const fp = toFundamentalsPhase(phase)
  return config.rules
    .filter((rule) => rule.phases.includes(fp))
    .map((rule) => {
      const value = metrics[rule.metricKey]
      const score = scoreValue(value, rule.bands)
      return {
        rule,
        value,
        score,
        feedback: rule.feedback[score],
      }
    })
}

/**
 * Get the fundamentals config for a given sport and handedness.
 */
export function getFundamentalsConfig(sport: Sport, handedness: Handedness): FundamentalsConfig {
  if (sport === 'golf') return golfFundamentals(handedness)
  return baseballFundamentals(handedness)
}

/**
 * Prefix for feedback strings based on score quality.
 */
export function scoreBadge(score: MetricScore): string {
  if (score === 'ideal' || score === 'acceptable_low' || score === 'acceptable_high') return '✓'
  return '△'
}

/**
 * Convenience wrapper: compute scored metrics for a given phase from raw metrics.
 * Used by both MetricsPanel and AIFeedbackPanel to share the same evaluation.
 */
export function buildFeedback(
  metrics: SwingMetrics,
  phase: SwingPhase,
  sport: Sport,
  handedness: Handedness,
): ScoredMetric[] {
  const config = getFundamentalsConfig(sport, handedness)
  return evaluateFundamentals(metrics, config, phase)
}
