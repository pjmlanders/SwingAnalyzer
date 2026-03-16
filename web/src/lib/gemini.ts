/**
 * Gemini AI integration for baseball/golf swing coaching feedback.
 * Sends a video frame snapshot + computed pose metrics to Gemini
 * and returns structured coaching feedback.
 *
 * Requires VITE_GEMINI_API_KEY in your .env file.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SwingMetrics } from './angles'
import type { SwingAnalysis } from '../types/pose'
import type { ScoredMetric, Sport, Handedness } from '../types/fundamentals'

const GEMINI_MODEL = 'gemini-2.5-flash'

export interface AISwingFeedback {
  score: number
  summary: string
  strengths: string[]
  improvements: string[]
  drills: { title: string; steps: string[] }[]
}

export type CoachingMode = 'player' | 'coach'

export function isGeminiAvailable(): boolean {
  return !!import.meta.env.VITE_GEMINI_API_KEY
}

/**
 * Capture the current video frame as a JPEG data URL.
 * Returns null if the video has no valid frame yet.
 */
export function captureVideoFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  }
}

function buildPrompt(
  metrics: SwingMetrics,
  swing: SwingAnalysis | null,
  mode: CoachingMode,
  sport: Sport,
  handedness: Handedness,
  scoredMetrics: ScoredMetric[],
): string {
  const sportLabel = sport === 'golf' ? 'golf' : 'baseball'
  const handednessLabel = handedness === 'right' ? 'right-handed' : 'left-handed'

  const persona =
    mode === 'player'
      ? `You are an encouraging ${sportLabel} coach giving feedback directly to a ${handednessLabel} player. Use plain language. Be concise and actionable — the player is on the field right now.`
      : `You are an expert ${sportLabel} hitting coach analyzing swing biomechanics for a ${handednessLabel} player. Use proper ${sportLabel} and biomechanics terminology. Be precise and data-driven.`

  const metricsBlock = [
    `Hip-Shoulder Separation (X-factor): ${metrics.hipShoulderSeparation.toFixed(1)}°`,
    `Lead Elbow Angle: ${metrics.leadElbowAngle.toFixed(1)}°`,
    `Rear Elbow Angle: ${metrics.rearElbowAngle.toFixed(1)}°`,
    `Lead Knee Angle: ${metrics.leadKneeAngle.toFixed(1)}°`,
    `Rear Knee Angle: ${metrics.rearKneeAngle.toFixed(1)}°`,
    `Estimated Bat/Club Angle (forearm): ${metrics.batAngle.toFixed(1)}°`,
    `Hand Height (normalized, 0=shoulder level): ${metrics.handHeight.toFixed(2)}`,
    `Stance Width (relative to hip width): ${metrics.stanceWidth.toFixed(2)}x`,
  ].join('\n')

  const dynamicsBlock = swing
    ? [
        `Peak Swing Speed: ${swing.peakSwingSpeed > 0 ? swing.peakSwingSpeed.toFixed(0) + ' mph' : 'not detected'}`,
        `Current Phase: ${swing.phase}`,
        `Contact Detected: ${swing.contactDetected ? 'yes' : 'no'}`,
        swing.launchAngle != null ? `Launch Angle: ${swing.launchAngle.toFixed(1)}°` : null,
        swing.exitVelocity != null ? `Estimated Exit Velocity: ${swing.exitVelocity.toFixed(0)} mph` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'Swing dynamics not yet captured.'

  const fundamentalsBlock = scoredMetrics.length > 0
    ? scoredMetrics
        .map((sm) => {
          const badge = (sm.score === 'ideal' || sm.score === 'acceptable_low' || sm.score === 'acceptable_high') ? '✓' : '△'
          return `${badge} ${sm.rule.label} (${sm.value.toFixed(1)} ${sm.rule.unit}): ${sm.feedback} [Source: ${sm.rule.source}]`
        })
        .join('\n')
    : null

  return `${persona}

Analyze this ${sportLabel} swing for a ${handednessLabel} player. Metrics were captured from a phone camera using MediaPipe pose estimation.

PLAYER CONTEXT:
Sport: ${sportLabel}
Handedness: ${handednessLabel}

POSE METRICS:
${metricsBlock}

SWING DYNAMICS:
${dynamicsBlock}

${swing?.contactDetected ? 'A contact point was detected in this swing.' : ''}

${fundamentalsBlock ? `BIOMECHANICS ANALYSIS (already shown to the player — sourced from peer-reviewed research):
${fundamentalsBlock}

Your analysis must be consistent with these observations. Do not contradict them. You may expand, add nuance, or cover areas not yet addressed.` : ''}

If a frame image is provided, use it to supplement your analysis of posture and mechanics.

Return ONLY valid JSON in this exact structure — no markdown, no explanation:
{
  "score": <integer 1-10>,
  "summary": "<one sentence overall assessment tailored to the audience>",
  "strengths": ["<strength>", ...],
  "improvements": ["<area to improve>", ...],
  "drills": [
    { "title": "<drill name>", "steps": ["<step>", ...] }
  ]
}

Guidelines:
- score: 8-10 = strong mechanics, 6-7 = solid with minor fixes, 4-5 = needs work, 1-3 = significant issues
- 2-3 strengths, 2-3 improvements
- 2-4 drills, each with 2-4 steps
- All feedback must be immediately actionable`
}

/**
 * Send swing metrics + optional frame image to Gemini for coaching feedback.
 * Throws if the API key is missing or the API call fails.
 */
export async function analyzeSwingWithAI(
  metrics: SwingMetrics,
  swingAnalysis: SwingAnalysis | null,
  imageDataUrl: string | null,
  mode: CoachingMode = 'player',
  sport: Sport = 'baseball',
  handedness: Handedness = 'right',
  scoredMetrics: ScoredMetric[] = [],
): Promise<AISwingFeedback> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API key not set. Add VITE_GEMINI_API_KEY to your .env file.')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const prompt = buildPrompt(metrics, swingAnalysis, mode, sport, handedness, scoredMetrics)

  let result
  if (imageDataUrl) {
    const base64 = imageDataUrl.split(',')[1]
    result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: 'image/jpeg' } },
    ])
  } else {
    result = await model.generateContent(prompt)
  }

  const text = result.response.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Unexpected response format from Gemini.')

  return JSON.parse(jsonMatch[0]) as AISwingFeedback
}
