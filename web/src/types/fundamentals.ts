/**
 * Types for sport-aware, handedness-aware fundamentals scoring.
 * SwingMetricKey avoids a circular dep with lib/angles.ts.
 */

export type Sport = 'baseball' | 'golf'
export type Handedness = 'right' | 'left'

/** Keys that mirror SwingMetrics in lib/angles.ts (kept in sync manually). */
export type SwingMetricKey =
  | 'hipShoulderSeparation'
  | 'leadElbowAngle'
  | 'rearElbowAngle'
  | 'leadKneeAngle'
  | 'rearKneeAngle'
  | 'batAngle'
  | 'handHeight'
  | 'stanceWidth'

export interface MetricBand {
  /** Values below this → 'too_low' */
  tooLow: number
  /** Values below this (but >= tooLow) → 'acceptable_low' */
  low: number
  /** Values at or below this (but >= low) → 'ideal' */
  high: number
  /** Values above this → 'too_high' */
  tooHigh: number
}

export type MetricScore =
  | 'too_low'
  | 'acceptable_low'
  | 'ideal'
  | 'acceptable_high'
  | 'too_high'

/** Swing phases used by the fundamentals engine (maps from SwingPhase). */
export type FundamentalsPhase = 'setup' | 'load' | 'contact' | 'follow'

export interface FundamentalRule {
  metricKey: SwingMetricKey
  /** Which swing phases this rule applies to. */
  phases: FundamentalsPhase[]
  bands: MetricBand
  label: string
  unit: string
  /** Published source for these thresholds. */
  source: string
  feedback: {
    too_low: string
    acceptable_low: string
    ideal: string
    acceptable_high: string
    too_high: string
  }
}

export interface FundamentalsConfig {
  sport: Sport
  handedness: Handedness
  rules: FundamentalRule[]
}

export interface ScoredMetric {
  rule: FundamentalRule
  value: number
  score: MetricScore
  feedback: string
}
