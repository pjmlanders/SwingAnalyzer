/**
 * Golf swing fundamentals rules.
 * Golf phases map to existing SwingPhase:
 *   address       → setup
 *   takeaway/top  → load
 *   impact        → contact
 *   finish        → follow
 *
 * Sources: PGA Teaching Manual, Leadbetter (1990), Trackman biomechanics,
 *          Hume et al. (2005), Kwon et al. (2012), McTeigue et al. (1994).
 */

import type { FundamentalsConfig, FundamentalRule, Handedness } from '../types/fundamentals'

const rules: FundamentalRule[] = [
  {
    metricKey: 'stanceWidth',
    phases: ['setup'],
    bands: { tooLow: 0, low: 1.0, high: 1.5, tooHigh: 2.5 },
    label: 'Stance Width',
    unit: '× hip width',
    source: 'PGA Teaching Manual; Leadbetter "The Golf Swing" (1990)',
    feedback: {
      too_low: 'Stance is too narrow — widen to at least shoulder width for driver.',
      acceptable_low: 'Stance is slightly narrow — fine for short irons, widen for longer clubs.',
      ideal: 'Stance width is ideal for a balanced golf setup.',
      acceptable_high: 'Stance is slightly wide — may restrict hip turn; narrow for shorter clubs.',
      too_high: 'Stance is too wide — severely restricts hip rotation and weight shift.',
    },
  },
  {
    metricKey: 'leadKneeAngle',
    phases: ['setup'],
    bands: { tooLow: 120, low: 150, high: 165, tooHigh: 178 },
    label: 'Lead Knee Flex (Address)',
    unit: '°',
    source: 'Trackman biomechanics consensus',
    feedback: {
      too_low: 'Excessive lead knee flex — sit up slightly for an athletic address position.',
      acceptable_low: 'Good knee flex — athletic and ready for the swing.',
      ideal: 'Lead knee flex is ideal for golf address position.',
      acceptable_high: 'Lead knee is slightly straight — add slight flex for athletic posture.',
      too_high: 'Lead knee is too straight — flex slightly to establish athletic posture.',
    },
  },
  {
    metricKey: 'handHeight',
    phases: ['setup'],
    bands: { tooLow: -0.1, low: 0.3, high: 0.6, tooHigh: 0.9 },
    label: 'Hand Height (Address)',
    unit: 'normalized',
    source: 'PGA Teaching Manual',
    feedback: {
      too_low: 'Hands are too high at address — lower hands near hip height for proper setup.',
      acceptable_low: 'Hands are slightly high for address — minor adjustment recommended.',
      ideal: 'Hands are in the correct position near hip height for golf address.',
      acceptable_high: 'Hands are slightly low at address — raise slightly for better clubhead control.',
      too_high: 'Hands are too low — may be in follow-through position; reset to address.',
    },
  },
  {
    metricKey: 'hipShoulderSeparation',
    phases: ['load'],
    bands: { tooLow: 10, low: 40, high: 55, tooHigh: 75 },
    label: 'X-Factor (Backswing)',
    unit: '°',
    source: 'Hume et al. (2005) JSCR; Kwon et al. (2012)',
    feedback: {
      too_low: 'Insufficient shoulder turn — rotate upper body more relative to stable hips.',
      acceptable_low: 'Moderate shoulder turn — aim for more separation for increased power.',
      ideal: 'Excellent X-factor at top of backswing — optimal power coil.',
      acceptable_high: 'High X-factor — maintain balance and control through the downswing.',
      too_high: 'Extreme separation — may cause timing or balance issues on the downswing.',
    },
  },
  {
    metricKey: 'hipShoulderSeparation',
    phases: ['contact'],
    bands: { tooLow: 10, low: 35, high: 50, tooHigh: 75 },
    label: 'X-Factor (Impact)',
    unit: '°',
    source: 'McTeigue et al. (1994) Golf Digest biomechanics',
    feedback: {
      too_low: 'Insufficient hip lead at impact — initiate the downswing with the hips.',
      acceptable_low: 'Moderate hip lead at impact — work on earlier hip drive in the downswing.',
      ideal: 'Good X-factor at impact — efficient energy transfer through the ball.',
      acceptable_high: 'High separation at impact — strong hip drive.',
      too_high: 'Extreme separation at impact — focus on synchronizing upper body rotation.',
    },
  },
  {
    metricKey: 'leadKneeAngle',
    phases: ['contact'],
    bands: { tooLow: 130, low: 160, high: 185, tooHigh: 190 },
    label: 'Lead Leg Extension (Impact)',
    unit: '°',
    source: 'Golf biomechanics — impact extension principle',
    feedback: {
      too_low: 'Lead knee still very bent at impact — extend toward the target for power.',
      acceptable_low: 'Lead knee partially extended — good; continue extending through impact.',
      ideal: 'Lead leg extension at impact is optimal for power transfer.',
      acceptable_high: 'Full lead leg extension at impact — complete power transfer.',
      too_high: 'Full extension at impact.',
    },
  },
]

export function golfFundamentals(handedness: Handedness): FundamentalsConfig {
  return { sport: 'golf', handedness, rules }
}
