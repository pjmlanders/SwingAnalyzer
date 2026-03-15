/**
 * Ring buffer for storing recent pose frames.
 * Enables frame-to-frame velocity and swing analysis calculations.
 */

import type { PoseFrame, PoseLandmarks } from '../types/pose'

const DEFAULT_CAPACITY = 60

export class FrameBuffer {
  private buffer: (PoseFrame | null)[]
  private head = 0
  private count = 0
  private readonly capacity: number

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity
    this.buffer = new Array<PoseFrame | null>(capacity).fill(null)
  }

  /** Push a new frame. Overwrites oldest if full. */
  push(landmarks: PoseLandmarks, timestamp: number): void {
    this.buffer[this.head] = { landmarks, timestamp }
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  /** Get frame by recency: 0 = most recent, 1 = one before that, etc. */
  get(recencyIndex: number): PoseFrame | null {
    if (recencyIndex < 0 || recencyIndex >= this.count) return null
    const idx =
      (this.head - 1 - recencyIndex + this.capacity) % this.capacity
    return this.buffer[idx]
  }

  /** Number of frames currently stored. */
  get length(): number {
    return this.count
  }

  /** Clear all frames. */
  clear(): void {
    this.buffer.fill(null)
    this.head = 0
    this.count = 0
  }
}
