# The Invention — Smart Glasses Cinematic Day Recap

---

## High-Level Summary

A smart glasses system that generates a cinematic third-person recap of your day — with you visibly in it.

You never hold a camera. The glasses capture passively. AI invents the shots.

The core novelty: **ego-to-exo synthesis from mirror-selfie appearance modeling**. You exist in your own memories, from angles that never physically existed.

---

## System Architecture — Glasses + Companion Device

The system is a two-node compute architecture. The glasses and a companion smartphone (running a dedicated companion app) divide responsibilities by their physical constraints.

---

### Compute Split

**Glasses handle (power-constrained, always-on):**
- Continuous frame capture + circular RAM buffer
- IMU + ambient audio processing
- Lightweight on-device salience detection
- Trigger firing + buffer commit decision
- LED indicator logic
- Local spill buffer for committed windows when phone is unreachable

**Companion app (phone) handles (GPU + memory + battery available):**
- Persistent storage of committed windows received from glasses
- Segmentation + activity mapping
- Novelty scoring + importance ranking
- Appearance modeling
- Scene geometry estimation
- Confidence-scored angle selection
- Image + clip generation
- Reel assembly + playback
- User settings, privacy controls, and feedback interface

The privacy guarantee is structural: **the continuous stream never leaves the glasses**. Only committed windows — a small fraction of total captured frames — are transferred to the phone. The phone never sees what the salience detector discarded.

---

### Adaptive Capture Rate

Capture frequency dynamically adjusts based on companion device connectivity and local buffer state:

| State | Capture Rate | Behaviour |
|---|---|---|
| Phone connected | 1fps (full fidelity) | Committed windows transferred immediately |
| Phone disconnected | 0.1–0.2fps (degraded) | Glasses-local spill buffer absorbs committed windows |
| Spill buffer near capacity | Salience threshold raised | Only highest-confidence triggers fire; routine moments dropped |
| Phone reconnects | Restore to 1fps | Spill buffer flushes to phone; normal operation resumes |

**Two independent levers operate under disconnection:**
1. **Capture rate drops** — fewer frames per second, reducing data volume
2. **Salience threshold rises** — only stronger signals trigger retention, protecting the limited local buffer

Both are independently patentable. Together they define a graceful degradation model: the system never loses critical moments due to connectivity, and never overflows local storage due to indiscriminate capture.

**Patentable claim:** *Capture frequency and salience threshold co-regulated as a function of companion device connectivity state and local buffer headroom.*

---

### Transfer Mechanism (Glasses → Phone)

BLE is insufficient bandwidth for committed window transfer (60–120 seconds of 1fps frames). The system uses WiFi Direct or a persistent local WiFi link for frame transfer. Transfer is initiated immediately on trigger fire when the phone is reachable; deferred to spill buffer otherwise.

---

### Companion App Responsibilities

The companion app is the primary user-facing surface. It hosts:

- **Reel playback + export** — daily highlight reels, clip-level review
- **Appearance model management** — user can confirm, correct, or update their likeness
- **Novelty baseline viewer** — shows the user's "typical day" profile and how today deviated
- **Trigger sensitivity controls** — adjust salience thresholds per signal type
- **Privacy controls** — delete a day's data, exclude a location, set capture-free zones
- **Co-present person consent** — gate on sharing any reel containing reconstructed likenesses of others
- **Feedback loop** — user corrections to generated clips (wrong person, wrong outfit) feed back into the appearance model and novelty baseline

The feedback loop is patentable as a personalisation mechanism: user-supplied corrections to synthesised output incrementally refine the underlying models, improving future generation quality without requiring explicit re-training.

---

## Full Pipeline — Step by Step

---

### Step 1 — Passive Capture

The glasses front-camera runs a continuous stream throughout the day — nominally at **1fps when the companion phone is reachable**, dropping to **0.1–0.2fps when disconnected**. IMU (motion sensor) and ambient audio run alongside, adding context to every frame. An LED indicator confirms capture state to the wearer and bystanders.

Frames are **not written to storage**. They live in a circular RAM buffer — a fixed-size rolling window of approximately 60–120 seconds. Oldest frames are silently overwritten. Nothing is permanently saved unless a trigger fires.

**Why 1fps and not lower (when connected):**
A lower rate (e.g. one frame every 15–30 seconds) risks missing the lead-up to a moment entirely. 1fps gives enough temporal density to reconstruct motion, detect scene changes, and infer pose — while remaining below the power and storage cost of true video.

**When the companion phone is unreachable:**
Capture rate drops to conserve the glasses-local spill buffer. Salience threshold simultaneously rises — only the strongest triggers fire — further protecting local storage. On reconnection, the spill buffer flushes to the phone and capture rate restores to 1fps. See *Adaptive Capture Rate* in the System Architecture section.

---

### Step 2 — Trigger-Gated Retention

A lightweight salience detector runs in parallel on-device — cheap enough to operate continuously without significant battery drain. It watches for signals across multiple modalities:

- **Motion spikes** — sudden IMU changes indicating physical activity
- **Audio events** — laughter, raised voices, music starting, crowd noise
- **Face detection** — a new person entering the frame
- **Location change** — GPS, WiFi fingerprint shift, or IMU settling pattern
- **Biometric spike** — elevated heart rate if a paired wearable is present

**When a trigger fires**, the system commits the circular buffer to persistent storage: the **60 seconds before** the trigger (retroactively captured) **+ 60 seconds after**. This is the committed window — the raw material for everything downstream.

**When no trigger fires**, frames are silently discarded as the buffer overwrites itself. Routine periods — sitting at a desk, commuting in silence, idle time — generate no stored data and require no user action.

**Result:** only meaningful moments survive, at no storage cost for the rest of the day.

---

### Step 3 — Segmentation

At end of day, the system groups all committed windows into discrete activities and locations. Grouping is based on:

- Temporal proximity of windows
- Location signals (GPS, WiFi)
- Visual scene similarity across frames
- Audio context continuity

The output is a structured map of the day: *coffee shop 9–9:30am, office desk 10am–1pm, lunch with two people 1–2pm*, etc.

---

### Step 4 — Importance Selection

Segmented activities are ranked by importance to determine which moments become highlight clips. Ranking factors:

- **Activity type** — social interactions score higher than solo routine tasks
- **People present** — known/important people elevate a moment's score
- **User preferences** — configurable weighting (e.g. prioritise outdoor moments, deprioritise work)
- **Novelty from routine** — the primary signal. Deviation from the user's *typical* day scores highest. A lunch with a rarely-seen friend outranks a lunch at the usual spot. A new location outranks a familiar one.

Novelty is computed by comparing today's activity pattern against a stored baseline of the user's historical days. This baseline is updated incrementally over time.

---

### Step 5 — Appearance Modeling

Before any image can be synthesised, the system needs to know what people look like *today* — not just in general.

**For the user:**
- Mirror selfies captured passively during the day (detected by front-facing reflection patterns)
- Recent photos pulled from the user's device photo library
- Stored profile data (baseline facial features, body type)

These sources are combined to produce a same-day appearance model: today's outfit, hair, and face — not a generic likeness.

**For co-present people:**
- Face crops extracted from committed window frames
- Known photos matched from the user's contacts/photo library if the person is recognised
- Unrecognised individuals modelled from what was captured in-frame

All appearance models are stored temporarily for use in shot generation and discarded after the day's reel is produced.

---

### Step 6 — Third-Person Shot Generation

This is the core of the invention. For each selected moment, a synthetic image is generated from a virtual camera angle that never physically existed — with the user visibly in frame.

The angle is **not chosen for drama**. It is chosen for **reconstruction confidence**: the angle the system can generate most accurately without fabricating scene geometry it has no data for.

---

#### 6a — Scene Context Preservation

The circular buffer only retains 60 seconds before a trigger. If a user sits quietly at their desk for 20 minutes before something interesting happens, the frames from when they *walked in* — which would show the room from multiple natural angles — are long overwritten.

Two mechanisms address this:

**Option A — Environment Snapshot on Location Change**
When a location-change trigger fires, the system automatically commits a short scene establishment window (~30 seconds) to a dedicated spatial reference store. This footage is never shown to the user — it exists purely to provide geometry data for that environment for the rest of the day.

**Option B — Keyframe Scene Memory**
The system maintains a lightweight store of one representative frame per distinct environment encountered during the day (estimated 20–50 frames total). Updated silently on each new environment detection. Used only as a fallback geometry reference during angle scoring, never surfaced to the user.

Both run in parallel. Option A provides richer multi-frame spatial context. Option B is the minimal always-available fallback.

---

#### 6b — Scene Geometry Estimation

To score candidate angles, the system needs a rough spatial model of the environment. This is built from two lightweight techniques — no expensive 3D reconstruction required:

**Monocular depth estimation**
A single representative frame from the committed window is passed through a depth estimation model (e.g. Depth Anything v2). Output: a depth map indicating what is near, what is far, and the relative positions of objects and surfaces. Runs on a single frame, offline.

**Cross-frame consistency check**
Frames from the committed window (and scene establishment frames if available) are compared. Regions that remain visually stable across frames are flagged as reliably reconstructable. Regions that are unobserved or inconsistent across frames are marked unsafe.

Together, these produce a **spatial confidence map** of the scene: a per-region breakdown of what the system knows well enough to reconstruct vs. what it would have to invent.

---

#### 6c — Confidence-Scored Angle Selection

8–12 candidate virtual camera positions are generated around the scene. Each is scored by:

- **Coverage confidence** — how much of the projected view from this angle falls within reliably known regions of the spatial confidence map
- **Wearer visibility** — the user must be clearly in frame
- **Pose reconstructability** — angles where the user's body faces roughly toward the virtual camera are preferred (more cinematic and easier to reconstruct accurately)

The highest-scoring angle is selected. The system never picks an angle it cannot support with data — unknown regions are minimised by design, not patched after the fact.

---

#### 6d — Image Generation

Once the angle is selected, all collected data is assembled into a structured conditioning package and passed to a ControlNet-class image generation model.

**Data available at generation time:**
- ~120 egocentric frames from the committed window
- Depth map of a representative frame
- Cross-frame consistency mask
- Scene establishment frames and/or keyframe memory for this environment
- User appearance reference: today's mirror selfies, outfit, face
- User pose: inferred from IMU and egocentric frame cues (sitting/standing, head direction, shoulder orientation)
- Co-present people: face crops from committed frames + known photos if matched
- Relative positions of all people: estimated from egocentric frame geometry

**Generation steps:**

1. **Scene layout construction**
Depth map + consistency mask combined into a 2D spatial confidence layout: object positions, surface depths, people placement, and a per-region known/unknown flag.

2. **Conditioning package assembly**
The model receives a structured multi-modal input, not a text prompt:
   - Depth/layout map → spatial skeleton from the chosen angle
   - Per-person appearance crops → face and outfit locked per individual via IP-Adapter
   - Per-person pose skeleton → body position and orientation from egocentric inference
   - Inpainting mask → known regions constrained; unknown regions open for model infill
   - Style conditioning → cinematic mood and lighting direction inferred from original frames

3. **Conditioned image generation**
ControlNet accepts all structural constraints and generates a photorealistic image respecting them:
   - Depth map → ControlNet depth conditioning (spatial structure)
   - Person appearance → IP-Adapter (identity-preserving injection)
   - Pose → ControlNet pose conditioning (body position)
   - Inpainting mask → model fills unknown regions with scene-plausible content
   - Text prompt is minimal — conditioning carries the output

4. **Plausibility check**
Generated image compared against the consistency mask. Any known region that appears inconsistent with reference frames triggers a regeneration or fallback to a shallower, more conservative angle.

**On pose accuracy:**
The hardest sub-problem is inferring how a person's body appears from a new angle when only egocentric footage exists. The practical approach: extract a rough pose skeleton from visible cues in egocentric frames (head angle, shoulder direction, sitting vs. standing) and pass this as a ControlNet pose constraint. Angle selection naturally mitigates this — the confidence scorer favours angles where the person faces toward the virtual camera, which are both more cinematic and easier to reconstruct faithfully.

---

### Step 7 — Clip Generation

Each synthesised still is animated into a short cinematic clip (3–5 seconds). The committed window provides before/after temporal context — the model knows what was happening in the moments surrounding the freeze frame and uses this to generate subtle motion: a natural camera drift, ambient movement, depth-of-field breathing.

---

### Step 8 — Final Highlight Reel

All clips are stitched into a daily recap video. Ordering follows the day's chronology. Transitions, pacing, and music adapt to the mood and activity types of the selected moments — as if assembled by a professional third-party cinematographer who was present all day.

---

## The Novel Core (Patent-Relevant)

Each of the following is independently defensible and not present in any cited prior art in this combination:

- **Wearer-visible exocentric reconstruction from non-paired data** — uses mirror selfies and casual device photos rather than a studio capture rig, unlike academic ego→exo systems (EgoRenderer, WorldWander).

- **Co-present person modeling** — other people in the scene are reconstructed from the same passive corpus. Not present in any cited prior art.

- **Novelty-from-routine as a cinematic selection signal** — deviation from the user's typical day as the primary importance scorer, applied as a downstream selection criterion for clip generation. Referenced in academic work but not used this way anywhere.

- **Circular-buffer capture with trigger-gated retroactive retention** — continuous 1fps stream in RAM; multi-modal salience signals gate what is committed to storage. Enables retroactive capture of chance moments without proportional storage cost.

- **Scene context preservation via establishment windows and keyframe scene memory** — two complementary mechanisms ensure spatial reference data survives beyond the circular buffer window, enabling accurate angle selection for moments that occur long after the user entered an environment.

- **Confidence-scored angle selection via monocular depth + cross-frame consistency** — virtual camera positions scored by how much of their projected view is supported by observed data. Never picks an angle that requires inventing unobserved geometry.

- **Multi-modal conditioned image generation from passive wearable data** — depth map, per-person appearance references, pose skeleton, and inpainting mask assembled into a single ControlNet conditioning package. Known regions constrained; unknown regions minimised by angle selection and filled by model infill.

- **End-to-end consumer pipeline** — no prior art chains: passive wearable capture → circular-buffer retention → segmentation → novelty-scored selection → confidence-scored angle selection → multi-modal conditioned synthesis → cinematic clip → daily highlight reel.

- **Glasses + companion device compute split with structural privacy guarantee** — continuous stream never leaves the glasses; only trigger-committed windows transfer to the phone. Privacy is architectural, not policy-based.

- **Adaptive capture rate + salience threshold co-regulation** — capture frequency and trigger sensitivity jointly governed by companion device connectivity state and local spill buffer headroom. Graceful degradation without moment loss.

- **Companion app feedback loop as personalisation mechanism** — user corrections to synthesised clips incrementally refine appearance models and novelty baseline without explicit retraining.

---

## Key Differentiators from Closest Prior Art

| Prior Art | What It Does | What It Misses |
|---|---|---|
| Samsung US 9,886,454 | Activity-conditioned highlight generation | No third-person synthesis, no wearer in shot |
| Apple Memory Maker (iOS 18) | Cinematic narrative from photo library | No novel viewpoint synthesis, no appearance modeling |
| EgoRenderer / WorldWander | Ego→exo view synthesis | Academic only; requires studio rig; no consumer pipeline |
| Meta Ray-Ban | Passive glasses capture + companion app | No AI synthesis, no third-person recreation, no adaptive capture degradation |
| GoPro / Dashcam circular buffer | Rolling buffer with event retention | No AI synthesis, no ego→exo reconstruction |

The invention is the **combination** of all these capabilities in one consumer-grade, wearable, fully passive pipeline.
