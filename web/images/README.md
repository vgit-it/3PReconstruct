# Image manifest — 3P invention explainer

Drop the generated images into this folder using the **exact filenames** below. The page picks them up automatically; until a file lands, the layout shows a styled placeholder card so the page stays composed.

All images should be **16:9** unless otherwise noted, dark-toned, cinematic, deep blacks, warm highlights — the page is a dark UI with film-grain texture so the imagery needs to live in that world.

A consistent style across all images is critical. A single style note to prepend to every prompt:

> **Style:** *Cinematic 35mm film aesthetic. Deep blacks, lifted shadows, warm golden highlights, slight halation around lights. Photographic, not illustrative. Shallow depth of field where appropriate. No text or logos in image.*

---

## 1. `missing-photographer.jpg` — Section 2 (The gap)

> A cinematic wide shot of four close friends laughing around a small wooden table outdoors at golden hour, warm string lights overhead, shallow depth of field, shot on 35mm film aesthetic, deep blacks, warm highlights. One seat at the table is empty — a faint translucent silhouette of a person occupying that seat, barely visible like a ghost, suggesting an absent photographer. Mood: warm, intimate, slightly melancholic. Aspect 16:9.

## 2. `pov-frame.jpg` — Section 3 (The promise, first layer)

> First-person POV photograph from someone seated at the same outdoor dinner table from Image #1. The viewer sees the friends across the table, a glass of wine in the lower foreground slightly blurred, hands resting on the table edge faintly visible at the bottom of the frame. Warm string lights, golden hour, 35mm film look, cinematic dark shadows. Aspect 16:9.

## 3. `third-person-reconstruction.jpg` — Section 3 (The promise, reveal layer)

> Same scene and same people as Image #2 but shot from a different angle — a medium-wide third-person view from across the patio, showing all four friends including the wearer (a person in elegant minimalist smart glasses) at the table, laughing. Same warm string lights, golden hour, 35mm film aesthetic, deep blacks, cinematic. The wearer is clearly visible in frame. Aspect 16:9.

## 4. `reconstruction-scene.jpg` — Section 8 (Confidence base)

> A cinematic wide reconstruction of a person walking through a misty forest trail at dawn, soft volumetric light through trees, photorealistic, dramatic mood. Aspect 16:9.

## 5. `confidence-heatmap.png` — Section 8 (Confidence overlay, **PNG with transparency**)

> A depth/confidence map of the forest trail scene from Image #4: smooth gradient from green (foreground, known geometry) through yellow (mid-ground) to red (distant, uncertain). Stylized, semi-transparent overlay. Same composition and framing as Image #4. Aspect 16:9. **Export as PNG with transparency where confidence is highest** so it blends into the base image when revealed by the cursor torch.

## 6. `angle-variant-a.jpg` — Section 9, the **winning** angle

> A person in elegant smart glasses reading at a sunlit window in a minimalist apartment. Low front angle — camera close to the floor, looking slightly up. 35mm film aesthetic, warm interior light, cinematic, deep shadows. Aspect 16:9.

## 7. `angle-variant-b.jpg` — Section 9, candidate

> Same person, same room, same moment as #6. High-corner angle — camera up near the ceiling in a far corner of the room, looking down at the person reading by the window. 35mm film aesthetic, warm interior light, cinematic. Aspect 16:9.

## 8. `angle-variant-c.jpg` — Section 9, candidate

> Same person, same room, same moment as #6. Medium shot from across the room at eye level. 35mm film aesthetic, warm interior light, cinematic. Aspect 16:9.

---

## Icons

All small icons (triggers, FAB, nav arrows) are inline SVG already in the HTML — no icon files needed.

If you want a custom glasses illustration for the "How it works" stepper (step 1), let me know and I'll swap the inline SVG for a generated image.
