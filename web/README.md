# Swing Analyzer (PWA)

Progressive Web App for real-time baseball and golf swing analysis using the phone camera. Built per **Plan A** from [IMPLEMENTATION_PLAN_GROK_RECOMMENDATIONS.md](../docs/IMPLEMENTATION_PLAN_GROK_RECOMMENDATIONS.md).

## Run locally

```bash
cd web
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Use **HTTPS** or **localhost** for camera access.

## Build & preview

```bash
npm run build
npm run preview
```

## PWA install

After building, serve the `dist/` folder over HTTPS (or use `npm run preview` with a tunnel). Then use the browser’s “Install app” / “Add to Home Screen” to install the PWA for offline use and better camera behavior on mobile.

## Phase status

| Phase | Description                    | Status        |
|-------|--------------------------------|---------------|
| 0     | PWA shell (manifest, SW)      | Done          |
| 1     | Camera (getUserMedia)          | Done          |
| 2     | Pose estimation + overlay      | Placeholder   |
| 3     | Angles, velocities, phases    | Stub only     |
| 4     | Fundamentals + DTW comparison | Not started   |
| 5     | Real-time feedback, IndexedDB  | Not started   |

## Project layout

- `src/components/` – CameraView, PoseOverlay, MetricsPanel
- `src/lib/` – pose.ts (Phase 2), angles.ts (Phase 3)
- `src/types/` – pose types (landmarks, phases)

Next: add MediaPipe Pose or TensorFlow.js BlazePose in `lib/pose.ts` and wire results into `App.tsx` and `PoseOverlay`.
