# Implementation Plan: Grok Recommendations for Baseball/Golf Swing Analyzer

This document translates the Grok analysis (Modern AI Tools for Baseball & Golf Swing Analysis) into concrete implementation plans for the Baseball Swing Analyzer project.

---

## Current State vs. Grok’s Recommendation

| Aspect | Current Repo | Grok Recommendation |
|--------|--------------|----------------------|
| **Platform** | React Native 0.79.2 (native mobile) | **PWA** (browser, installable) |
| **Video input** | Not implemented | Real-time phone camera via `getUserMedia()` + file upload |
| **Pose / motion** | Not implemented | MediaPipe Pose or TF.js (BlazePose/MoveNet/YOLO) in browser |
| **Analysis** | Not implemented | Joint angles, velocities, DTW vs. pro “fundamentals” |
| **Deployment** | N/A | Offline-first, service worker, no heavy server |

**Recommendation:** Build the analyzer as a **PWA** (React or Vue) so it runs in the browser with camera access, on-device ML, and installability on phones. The existing React Native repo can remain for a future native app; the PWA can live in a subfolder (e.g. `pwa/` or `web/`) or a separate repo.

---

## Summary of Grok’s Recommendations

### 1. Browser-compatible pose & motion

- **MediaPipe Pose** – 33 keypoints, 3D, real-time; good for swings/pitches.
- **TensorFlow.js + BlazePose/MoveNet** – 3D depth, WebGPU support; custom models possible.
- **YOLO11/YOLO26 Pose (TF.js export)** – Strong on fast motion and multi-person; good for pitching/range.
- **js-ai-body-tracker** – Wraps MoveNet/PoseNet/BlazePose; quick prototyping.

### 2. Core pipeline

1. **Input:** `<video>` + `getUserMedia()` or file upload.
2. **Processing:** MediaPipe or TF.js → keypoints per frame.
3. **Analysis:** JS for angles (e.g. shoulder–elbow–wrist), velocities (frame diffs), trajectories; **DTW** for temporal alignment to “fundamentals.”
4. **Output:** Skeleton overlay, heatmaps, deviation scores (e.g. “Hip rotation lags pro by 15°”), suggestions.

### 3. Real-time phone camera (PWA)

- `navigator.mediaDevices.getUserMedia` with `facingMode: 'environment'` (rear camera).
- Mobile-friendly resolution (e.g. 640×480).
- `video.playsInline = true` for iOS.
- Service worker to cache app shell and ML assets for offline use.

### 4. Comparisons to “fundamentals”

- Store pro swing data as **JSON keypoint arrays** (or angle/time series).
- Use **DTW (Dynamic Time Warping)** in JS for sequence alignment.
- Metrics: Euclidean distance, angular error, cosine similarity vs. templates.
- Example: “Hip–shoulder separation within 10° of fundamental.”

### 5. 2026-oriented enhancements

- **WebGPU** for 2–3× speed (e.g. `tf.setBackend('webgpu')` where supported).
- Lighter models (e.g. YOLO26n-pose, MoveNet Lightning) for battery/heat.
- Offline-first: cache models in service worker; IndexedDB for saved swings and templates.
- Optional: multi-view if users upload multiple angles.

### 6. Market / product (from Grok)

- Freemium: basic analysis free; premium metrics / pro comparisons $5–20/month.
- Target: amateur/youth baseball (hitting + pitching) and golfers.
- Differentiate: PWA (no app store), real-time camera, no sensors, multi-sport (baseball + golf).

---

## Implementation Plans

### Plan A: New PWA in this repo (recommended)

Add a web app under `web/` (or `pwa/`) that implements Grok’s stack. Keeps one repo; React Native can stay for a future native client.

**High-level steps:**

1. **Scaffold PWA (Phase 0)**  
   - Create `web/` with Vite + React + TypeScript.  
   - Add `manifest.json` (name, icons, display: standalone).  
   - Register service worker (e.g. Vite PWA plugin) and cache app shell + ML CDN URLs.

2. **Camera and video (Phase 1)**  
   - Page with `<video>` + `getUserMedia({ video: { facingMode: 'environment' }, width: 640, height: 480 })`.  
   - Optional: file upload for pre-recorded clips.  
   - Handle permission errors and iOS inline playback.

3. **Pose estimation (Phase 2)**  
   - Integrate **MediaPipe Pose** (or TF.js BlazePose) via CDN/npm.  
   - Run on each video frame (e.g. `requestAnimationFrame` or `Camera` helper).  
   - Draw skeleton on canvas overlay (use MediaPipe drawing utils or custom).

4. **Metrics layer (Phase 3)**  
   - Compute joint angles (e.g. hip–shoulder, elbow flexion) from keypoints.  
   - Compute simple velocities (e.g. frame-to-frame diff).  
   - Define “swing phases” (load, contact, follow-through) from time-series keypoints (thresholds or simple state machine).

5. **Fundamentals and comparison (Phase 4)**  
   - Design JSON schema for “pro” or “ideal” swing (keypoints or angles per frame).  
   - Implement or adopt a JS DTW library; align user sequence to template.  
   - Compute deviation scores (e.g. mean angular error, max deviation) and surface “within X° of pro.”

6. **UX and polish (Phase 5)**  
   - Real-time overlay + optional post-session summary.  
   - Optional: Web Speech API for voice feedback; save sessions to IndexedDB.  
   - Mobile testing (Chrome/Android, Safari/iOS); consider WebGPU backend where available.

---

### Plan B: Keep React Native and add web (hybrid)

If you want to keep the current React Native app as the primary product:

- Use **React Native Web** so the same UI runs in the browser and qualify as PWA (manifest + service worker).
- Pose/analysis must run in browser context: use a **WebView** that loads a small “analyzer” page (MediaPipe/TF.js), or expose a native module that calls a small local web server that runs the same JS pipeline.  
- Grok’s code snippets (getUserMedia, MediaPipe, TF.js) apply to the **web** part of this hybrid.

---

### Plan C: React Native only (no PWA)

- Use a **native camera** (expo-camera or react-native-camera) and send frames to a **native** pose model (e.g. MediaPipe Android/iOS, or TensorFlow Lite).  
- This diverges from Grok’s “browser-only, no Node” and “PWA” focus but keeps a single native codebase.  
- Comparison logic (angles, DTW, fundamentals) can be reimplemented in JS/React Native or in native code.

---

## Recommended path: Plan A – PWA in `web/`

| Phase | Deliverable | Tech / notes |
|-------|-------------|--------------|
| **0** | PWA shell | Vite + React + TS, `manifest.json`, service worker (Vite PWA), HTTPS for camera |
| **1** | Camera + optional upload | `getUserMedia`, `<video>`, 640×480, `playsInline`, error UI |
| **2** | Pose on video | MediaPipe Pose (or TF.js BlazePose), frame loop, canvas overlay |
| **3** | Angles & phases | math.js or custom vector/angle utils; phase detection from keypoints |
| **4** | Fundamentals + DTW | JSON templates, JS DTW lib, deviation metrics and simple “match %” |
| **5** | Real-time feedback + persistence | Overlay, optional voice, IndexedDB for history; WebGPU if desired |

---

## Suggested folder structure (Plan A)

```text
BaseballSwingAnalyzer/
├── package.json              # existing (React Native)
├── web/                      # NEW: PWA
│   ├── package.json          # Vite, React, TypeScript, PWA plugin
│   ├── vite.config.ts
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── CameraView.tsx
│       │   ├── PoseOverlay.tsx
│       │   └── MetricsPanel.tsx
│       ├── lib/
│       │   ├── pose.ts           # MediaPipe/TF.js init and frame processing
│       │   ├── angles.ts         # joint angle calculations
│       │   ├── dtw.ts            # DTW alignment (or wrapper)
│       │   └── fundamentals.ts   # load/store pro templates
│       ├── types/
│       │   └── pose.ts           # keypoint, landmark, swing phase types
│       └── sw.ts                 # service worker (or generated by plugin)
├── docs/
│   └── IMPLEMENTATION_PLAN_GROK_RECOMMENDATIONS.md  # this file
└── (existing React Native app files)
```

---

## Dependency suggestions (web PWA)

- **Build:** Vite, React, TypeScript.  
- **PWA:** `vite-plugin-pwa` (manifest + service worker + cache).  
- **Pose:** `@mediapipe/pose`, `@mediapipe/camera_utils` (or `@tensorflow-models/pose-detection` for BlazePose).  
- **Math:** `math.js` or `numeric` for vectors/angles; optional `ml-dtw` or custom DTW.  
- **Optional:** `three` for 3D viz; `react-webcam` if you prefer a React camera component.

---

## Risks and mitigations (from Grok)

- **Fast motion blur:** Prefer YOLO26/BlazePose over older models; tune confidence thresholds.  
- **Lighting/angle variance:** Use normalized coordinates; consider fine-tuned model later.  
- **Battery/heat on mobile:** Use lighter models (e.g. MoveNet Lightning, YOLO26n-pose); cap FPS if needed.  
- **iOS Safari background throttling:** Encourage “Add to Home Screen” so the PWA runs in standalone mode.

---

## Next steps

1. **Decide platform:** PWA-only (Plan A), hybrid (Plan B), or native-only (Plan C).  
2. **If Plan A:** Create `web/` with Vite + React + TS + PWA plugin and implement Phase 0 (manifest, service worker, basic shell).  
3. **Phase 1:** Implement camera (and optional file upload) in `CameraView.tsx`.  
4. **Phase 2:** Add MediaPipe (or TF.js) in `lib/pose.ts` and overlay in `PoseOverlay.tsx`.  
5. **Phase 3–4:** Add `lib/angles.ts`, phase detection, `lib/dtw.ts`, and `lib/fundamentals.ts` with a simple JSON template and deviation score.  
6. **Phase 5:** Real-time feedback, optional voice, IndexedDB, and WebGPU backend where supported.

If you share your choice (Plan A/B/C) and stack (e.g. MediaPipe vs TF.js), the next iteration can be concrete file-by-file steps or code snippets for Phases 0–2.

---

## Quick reference: Grok tech stack

| Layer | Option 1 | Option 2 | Use case |
|-------|----------|----------|----------|
| Pose | MediaPipe Pose | TF.js BlazePose | 33 keypoints, 3D, real-time |
| Fallback for fast motion | — | YOLO11/YOLO26 → TF.js | Pitching, occlusion |
| Math | math.js | numeric.js | Angles, vectors, similarity |
| DTW | ml-dtw / custom | dtw-cluster | Sequence vs. fundamentals |
| 3D viz (optional) | Three.js | — | Pro overlay, trajectory |
| Backend (optional) | — | tf.setBackend('webgpu') | 2–3× speed on supported browsers |

---

## Phase 0 checklist (start here for PWA)

- [ ] Create `web/` with `npm create vite@latest web -- --template react-ts`.
- [ ] Add `vite-plugin-pwa`, configure `manifest.json` (name: "Swing Analyzer", icons, display: standalone).
- [ ] Ensure service worker caches `/` and (later) MediaPipe/TF.js CDN URLs.
- [ ] Add `https` or use `localhost` for `getUserMedia` (required in production).
- [ ] Document in README that the PWA lives in `web/` and how to run it (`cd web && npm run dev`).
