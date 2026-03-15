# Baseball Swing Analyzer

## Project Overview

Progressive Web App (PWA) for **real-time baseball and golf swing analysis** using the phone camera or uploaded video. It runs entirely in the browser, uses **MediaPipe Pose** for 33-point body landmarks, and computes swing metrics (hip–shoulder separation, elbow/knee angles, stance width, hand height, etc.) with simple coaching-style feedback.

## Architecture

- **Root**
  - `package.json` for a minimal React Native shell (not actively used; future native app placeholder).
- **`web/`** – Primary app (Vite + React + TypeScript PWA)
  - `src/App.tsx`
    - Top-level layout: header, camera section, pose overlay, and metrics panel.
    - Holds `landmarks` and `videoDims` state and wires together:
      - `CameraView` → updates pose landmarks and video dimensions.
      - `PoseOverlay` → draws skeleton on top of the video.
      - `MetricsPanel` → displays computed swing metrics and text feedback.
  - `src/components/`
    - `CameraView.tsx`
      - Handles **two input modes**:
        - `camera`: Uses `navigator.mediaDevices.getUserMedia` with `facingMode: 'environment'`, 640×480, no audio.
        - `upload`: File input for MP4/MOV/WebM videos.
      - Manages camera states: `idle`, `requesting`, `live`, `denied`.
      - Sets up a `requestAnimationFrame` loop that calls `detectPose(video, timestamp)` whenever:
        - Camera is live, or
        - An uploaded video is playing (and on seek events).
      - Reports **display dimensions** (via `getBoundingClientRect`) back to `App` so the overlay canvas matches the visible video size.
      - Cleans up:
        - Stops media tracks on unmount / stop.
        - Revokes object URLs for uploaded videos.
        - Resets pose frame tracking (`resetFrameTracking`) when a new video is loaded.
    - `PoseOverlay.tsx`
      - Canvas overlay that draws:
        - MediaPipe-style **pose connections** (face, torso, arms, legs) as lines.
        - Landmarks as green circles with white borders.
      - Uses `visibility` from landmarks to only draw high-confidence points (≥ 0.5) and fades with `globalAlpha`.
      - Positioned absolutely over the video (`pointerEvents: 'none'`) and sized using the `width`/`height` passed from `App`.
    - `MetricsPanel.tsx`
      - Uses `calculateSwingMetrics(landmarks)` from `lib/angles.ts` when 33 keypoints are available.
      - Renders:
        - **Body Rotation**
          - Hip–shoulder separation (“X-factor”).
          - Bat angle from wrist positions.
        - **Arms**
          - Lead elbow angle.
          - Rear elbow angle.
          - Hand height (normalized ratio).
        - **Lower Body**
          - Lead knee angle.
          - Rear knee angle.
          - Stance width (ankle distance / hip width).
      - Generates simple **coaching feedback strings** based on metric thresholds, e.g.:
        - “Good hip-shoulder separation for power generation.”
        - “Consider keeping rear elbow closer to body.”
        - “Stance may be too narrow / too wide.”
      - Shows placeholder copy when no landmarks or no metrics are available yet.
  - `src/lib/`
    - `pose.ts`
      - Wraps **MediaPipe Tasks Vision** `PoseLandmarker`:
        - `createPoseDetector()` initializes a global singleton:
          - Loads WASM assets from `https://cdn.jsdelivr.net/.../tasks-vision@latest/wasm`.
          - Uses `PoseLandmarker.createFromOptions` with:
            - `runningMode: 'VIDEO'`
            - `numPoses: 1`
            - Confidence thresholds: detection/presence/tracking at 0.5.
            - GPU delegate where available.
        - `detectPose(video, timestamp, force = false)`:
          - Early returns if detector not ready or `video.readyState < 2`.
          - Skips duplicate frames using `lastVideoTime` unless `force` is `true` (e.g., on seek).
          - Calls `poseLandmarker.detectForVideo(video, timestamp)`.
          - Converts MediaPipe landmarks to the app’s `Landmark` type:
            - `[{ x, y, z, visibility }, ...]` for 33 points.
        - `resetFrameTracking()` resets `lastVideoTime` when switching sources (e.g., new upload).
        - `closePoseDetector()` cleans up the singleton if the app ever wants to fully teardown.
        - `getDrawingUtils(ctx)` exposes MediaPipe’s `DrawingUtils` (currently unused, but available for future rendering utilities).
      - This file is the only place that directly knows about MediaPipe APIs and CDN model paths.
    - `angles.ts`
      - MediaPipe index constants for the 33 pose landmarks.
      - Core math helpers:
        - `angleBetweenPoints(a, b, c)` – angle at \(b\) (in degrees) between vectors BA and BC.
        - `lineAngle(a, b)` – orientation of segment \(ab\) relative to horizontal (degrees).
      - Swing-specific metrics:
        - `hipShoulderSeparation(landmarks)`
          - Compares `lineAngle(leftHip, rightHip)` vs `lineAngle(leftShoulder, rightShoulder)`.
          - Positive when shoulders are rotated ahead of hips.
        - `elbowAngle(landmarks, 'left' | 'right')`
          - Angle at elbow between shoulder, elbow, and wrist.
        - `kneeAngle(landmarks, 'left' | 'right')`
          - Angle at knee between hip, knee, and ankle.
        - `hipAngle(landmarks, 'left' | 'right')`
          - Torso bend angle between shoulder, hip, and knee.
        - `estimatedBatAngle(landmarks)`
          - Assumes bat axis is approximated by the line between left and right wrists.
        - `handHeight(landmarks)`
          - A normalized value capturing hand position:
            - Uses average wrist Y, average shoulder Y, and hip Y.
            - \(0\) at shoulder level, negative above, positive below.
        - `stanceWidth(landmarks)`
          - \(|rightAnkle.x - leftAnkle.x| / |rightHip.x - leftHip.x|\).
      - `calculateSwingMetrics(landmarks)`:
        - Produces a `SwingMetrics` object with:
          - `hipShoulderSeparation`
          - `leadElbowAngle` / `rearElbowAngle`
          - `leadKneeAngle` / `rearKneeAngle`
          - `batAngle`
          - `handHeight`
          - `stanceWidth`
        - Currently assumes a **right-handed hitter** (left side = lead, right side = rear).
  - `src/types/`
    - `pose.ts`
      - `Landmark` { x, y, z?, visibility? }
      - `PoseLandmarks = Landmark[]`
      - `PoseResult` for potential richer outputs (landmarks + timestamp).
      - `SwingPhase` (`'idle' | 'load' | 'contact' | 'follow' | 'unknown'`) and `SwingPhaseFrame`:
        - Defined for future temporal/phase analysis (DTW, phase detection), not yet wired into the UI.
  - `src/assets/`, `App.css`, `index.css`, `main.tsx`
    - Standard Vite/React bootstrap, base styling, and app mounting.

- **`docs/`**
  - `IMPLEMENTATION_PLAN_GROK_RECOMMENDATIONS.md`
    - High-level design doc based on Grok’s recommendations:
      - Justifies PWA approach vs native.
      - Outlines phases:
        - Phase 0: PWA shell.
        - Phase 1: Camera + basic pipeline.
        - Phase 2: Pose overlay.
        - Phase 3+: Metrics, DTW, fundamentals comparison, real-time feedback, IndexedDB.

## Tech Stack

- **Framework**: React 19, TypeScript ~5.9
- **Tooling**: Vite 7, vite-plugin-pwa
- **Pose Estimation**: `@mediapipe/tasks-vision` PoseLandmarker (browser, WASM + WebGL/GPU)
- **Styling**: Plain CSS (`App.css`, `index.css`), responsive layout around 640×480 video.
- **Linting**: ESLint 9 (flat config) with React, hooks, and TypeScript support.

## Commands

All commands are run from the `web/` directory:

- `npm install` – Install dependencies.
- `npm run dev` – Start Vite dev server (HMR).
- `npm run build` – Type-check (`tsc -b`) + production build.
- `npm run lint` – Run ESLint.
- `npm run preview` – Preview the production build.

For camera access, run on `localhost` or HTTPS.

## Swing Analysis Pipeline (How It Works)

1. **Video Input**
   - User chooses between:
     - **Camera**: Starts `getUserMedia` with rear camera, no audio, 640×480.
     - **Upload**: Selects a local video file; app creates an object URL and plays it in a `<video>` element.
   - `CameraView` manages:
     - Lifecycle of the media stream and uploaded video URL.
     - Video element properties (`autoPlay`, `playsInline`, `muted`, `controls`).
     - Emitting display dimensions to `App` so overlays align correctly.

2. **Pose Detection**
   - On first use, `createPoseDetector()`:
     - Loads MediaPipe Tasks Vision WASM assets from CDN.
     - Creates a `PoseLandmarker` instance configured for:
       - `runningMode: 'VIDEO'`
       - Single person (`numPoses: 1`).
     - Reused as a singleton for all subsequent frames.
   - During playback or live camera:
     - `CameraView` runs a `requestAnimationFrame` loop:
       - Calls `detectPose(video, performance.now())`.
       - Skips duplicate frames using `lastVideoTime` to avoid redundant work.
       - On seek events, calls `detectPose(..., force = true)` to force a fresh detection at the new frame.
     - `detectPose` returns `PoseLandmarks | null` (33 keypoints or `null` if none).
     - `App` stores `landmarks` in state and passes them down to:
       - `PoseOverlay` for drawing.
       - `MetricsPanel` for metrics.

3. **Visualization**
   - `PoseOverlay`:
     - Draws a pose skeleton using predefined connection pairs (MediaPipe pose topology).
     - Uses normalized landmark coordinates (`x`, `y` in \([0, 1]\)) scaled by the current canvas width/height.
     - Respects `visibility` to hide low-confidence joints; uses `globalAlpha` to fade.
   - The overlay canvas is absolutely positioned on top of the `<video>` element with matching dimensions.

4. **Metric Computation**
   - When 33 landmarks are available:
     - `MetricsPanel` calls `calculateSwingMetrics(landmarks)`:
       - Computes joint angles and positional metrics (see `angles.ts` above).
     - These metrics are formatted for display:
       - Angles in degrees with 1 decimal place.
       - Ratios (stance width, hand height) as short decimals.

5. **Feedback Generation**
   - `MetricsPanel` derives a list of text feedback strings from the metrics:
     - Hip–shoulder separation thresholds (e.g., >30° considered “good”).
     - Rear elbow angle ranges to indicate tucked vs flared arm.
     - Knee angles and stance width bands (too narrow / good / too wide).
     - Hand height ranges for “high ready” vs “low / follow-through.”
   - If metrics are present but no rule strongly matches, it falls back to a generic message: “Analyzing swing mechanics...”.

6. **Future Extensions (Planned in Docs)**
   - Swing phase detection using:
     - Hand height, hip–shoulder separation, and bat angle over time.
     - Classification into `idle`, `load`, `contact`, `follow`.
   - DTW-based comparison against “fundamental” pro swing templates.
   - Velocity/acceleration metrics for hips, hands, and bat.
   - IndexedDB storage of swings and template comparisons.
   - Deeper real-time coaching feedback and multi-sport support (baseball/golf).

## Conventions

- **Components**: Functional React components with hooks.
- **Naming**:
  - Components: PascalCase (`CameraView.tsx`, `MetricsPanel.tsx`, `PoseOverlay.tsx`).
  - Lib/utility modules: camelCase (`angles.ts`, `pose.ts`).
- **Types**:
  - Shared pose types live in `src/types/pose.ts`.
  - Avoid duplicating landmark shapes; always use `Landmark` / `PoseLandmarks`.
- **Styling**:
  - Plain CSS, no CSS-in-JS.
  - Keep canvas/video sizing logic in layout components (`App`, `CameraView`).
