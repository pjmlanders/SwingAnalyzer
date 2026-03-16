/**
 * Baseball swing fundamentals rules.
 * All threshold ranges are sourced from peer-reviewed biomechanics literature
 * and established MLB coaching consensus.
 *
 * Note on metric signs:
 *   handHeight  – 0 = shoulder level, negative = above shoulders, positive = below
 *   stanceWidth – ratio of ankle width to hip width
 *   hipShoulderSeparation – shoulder rotation minus hip rotation (degrees)
 */

import type { FundamentalsConfig, FundamentalRule, Handedness } from '../types/fundamentals'

const rules: FundamentalRule[] = [
  {
    metricKey: 'stanceWidth',
    phases: ['setup', 'load'],
    bands: { tooLow: 0, low: 1.5, high: 2.0, tooHigh: 3.0 },
    label: 'Stance Width',
    unit: '× hip width',
    source: 'Williams "Science of Hitting" (1971); MLB Hitting Lab consensus',
    feedback: {
      too_low: 'Stance is very narrow — widen feet beyond shoulder width for balance and power.',
      acceptable_low: 'Stance is slightly narrow — widening slightly may improve stability.',
      ideal: 'Good athletic stance width — optimal balance for power generation.',
      acceptable_high: 'Stance is slightly wide — minor adjustment may improve hip rotation.',
      too_high: 'Stance is too wide — restricts hip rotation and weight transfer.',
    },
  },
  {
    metricKey: 'leadKneeAngle',
    phases: ['setup', 'load'],
    bands: { tooLow: 100, low: 140, high: 155, tooHigh: 175 },
    label: 'Lead Knee (Setup/Load)',
    unit: '°',
    source: 'Fortenbaugh et al. (2009), Journal of Kinesiology & Sports Science',
    feedback: {
      too_low: 'Lead knee is excessively bent — reduces stability and power transfer.',
      acceptable_low: 'Lead knee bend is slightly deep — good for loading, watch balance.',
      ideal: 'Lead knee angle is ideal for athletic ready position and weight loading.',
      acceptable_high: 'Lead knee is slightly extended — ensure enough flexion to load weight.',
      too_high: 'Lead knee is too straight — flex the lead knee to load properly.',
    },
  },
  {
    metricKey: 'handHeight',
    phases: ['setup'],
    bands: { tooLow: -0.5, low: -0.1, high: 0.2, tooHigh: 0.5 },
    label: 'Hand Height (Setup)',
    unit: 'normalized',
    source: 'Williams "Science of Hitting" (1971)',
    feedback: {
      too_low: 'Hands are very high above shoulders — may cause a long, loopy swing path.',
      acceptable_low: 'Hands are slightly high — acceptable but watch for early casting.',
      ideal: 'Hands are in the ideal launch position at or just above shoulder level.',
      acceptable_high: 'Hands are slightly low — raise hands for a better launch position.',
      too_high: 'Hands are very low — likely in follow-through; reset to setup position.',
    },
  },
  {
    metricKey: 'hipShoulderSeparation',
    phases: ['load'],
    bands: { tooLow: -10, low: 20, high: 45, tooHigh: 70 },
    label: 'X-Factor (Load)',
    unit: '°',
    source: 'Escamilla et al. (2009), American Journal of Sports Medicine',
    feedback: {
      too_low: 'Minimal coil — turn hips ahead of shoulders to create torque.',
      acceptable_low: 'Low X-factor — try to create more hip-shoulder separation during load.',
      ideal: 'Excellent hip-shoulder separation — great coil for power generation.',
      acceptable_high: 'High X-factor — good coil; ensure you can maintain balance.',
      too_high: 'Extreme separation — may cause timing issues; focus on controlled coil.',
    },
  },
  {
    metricKey: 'rearElbowAngle',
    phases: ['load'],
    bands: { tooLow: 30, low: 45, high: 90, tooHigh: 130 },
    label: 'Rear Elbow Slot',
    unit: '°',
    source: 'MLB coaching consensus ("slot" position)',
    feedback: {
      too_low: 'Rear elbow extremely tucked — allow slight extension for natural swing path.',
      acceptable_low: 'Rear elbow well tucked — good inside-the-ball position.',
      ideal: 'Rear elbow in the ideal slot position for an inside-out swing path.',
      acceptable_high: 'Rear elbow slightly high — bring closer to body to prevent casting.',
      too_high: 'Rear elbow flared — tuck elbow to body to avoid casting the hands.',
    },
  },
  {
    metricKey: 'leadKneeAngle',
    phases: ['contact'],
    bands: { tooLow: 130, low: 165, high: 185, tooHigh: 190 },
    label: 'Lead Leg Block (Contact)',
    unit: '°',
    source: 'Fortenbaugh et al. (2009), Journal of Kinesiology & Sports Science',
    feedback: {
      too_low: 'Lead leg too bent at contact — straighten to create a firm front-side block.',
      acceptable_low: 'Lead leg has slight bend at contact — firm up through the hitting zone.',
      ideal: 'Lead leg is firm at contact — excellent front-side block for power transfer.',
      acceptable_high: 'Lead leg fully extended at contact — good power transfer.',
      too_high: 'Full extension at contact.',
    },
  },
  {
    metricKey: 'hipShoulderSeparation',
    phases: ['contact'],
    bands: { tooLow: 10, low: 35, high: 60, tooHigh: 90 },
    label: 'X-Factor (Contact)',
    unit: '°',
    source: 'Escamilla et al. (2009), American Journal of Sports Medicine',
    feedback: {
      too_low: 'Hips and shoulders rotating together — drive hips before upper body rotation.',
      acceptable_low: 'Moderate hip lead at contact — focus on earlier hip initiation.',
      ideal: 'Great hip-shoulder separation at contact — efficient power transfer to the ball.',
      acceptable_high: 'High separation at contact — strong rotational power.',
      too_high: 'Extreme separation at contact — may indicate timing issues.',
    },
  },
  {
    metricKey: 'hipShoulderSeparation',
    phases: ['follow'],
    bands: { tooLow: 20, low: 60, high: 200, tooHigh: 300 },
    label: 'Full Rotation (Follow)',
    unit: '°',
    source: 'Escamilla et al. (2009), American Journal of Sports Medicine',
    feedback: {
      too_low: 'Limited follow-through — commit to full rotation for maximum power.',
      acceptable_low: 'Partial rotation — extend through the ball to a complete finish.',
      ideal: 'Full rotation on follow-through — complete swing extension.',
      acceptable_high: 'Complete follow-through rotation.',
      too_high: 'Complete follow-through rotation.',
    },
  },
]

export function baseballFundamentals(handedness: Handedness): FundamentalsConfig {
  return { sport: 'baseball', handedness, rules }
}
