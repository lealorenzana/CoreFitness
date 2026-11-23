# Gym sign in: a lively top-down gym (image prompts)

Goal: replace the grey line floor plan behind **Sign in to your gym** (admin login, also used when arriving
from the website) with a real looking top-down gym where small people train, in the same family as the
website's characters (violet #7C3AED, amber #F5A524, cream, lavender, near black #0E0D12).

How it will be built, so the pictures fit together:
- **One floor picture** (no people) is the background. The sign-in form sits over the middle, so the
  middle third of the picture is an open, quiet aisle.
- **Each person is a small animation strip**: 6 (or 8) poses side by side on a transparent background.
  The page plays them in a loop with CSS, like the lifting kettlebell on the website. People are placed
  on top of the matching machine in the floor picture.
- The page draws the area names (CARDIO, RACKS...) and the "You are here" dot itself, so **no words in
  any picture**.

Generate in ChatGPT (image) or any tool that can export a **transparent PNG**. Keep every person file at
the same size so they share one scale. Save them with the file names below and send them to me.

---

## 0. Style line (paste at the end of every prompt)

> Style: charming polished cartoon illustration with soft 3D shading, the same character family as a
> premium animated fitness brand: stylized faces, clean silhouettes, diverse Filipino adults, outfits in
> violet #7C3AED, amber #F5A524, cream and charcoal. Seen from directly above at a high angle (about 70
> degrees, top-down) so heads, shoulders and the equipment read clearly and faces are still a little
> visible. Soft light from the upper left, small soft shadow directly under each figure. No text, no
> letters, no logos, no watermark, no border, no checkerboard pattern baked into the pixels.

**More realistic people instead of cartoon:** replace the first sentence of the style line with
> Style: realistic stylized 3D render, like a high end architectural visualization with real proportions
> and real gym clothing, softly lit, not photographic noise, not uncanny.

Use one style for every file; do not mix.

---

## 1. The floor (background)

File: `gym-floor.png`, **2400 x 1350**, not transparent.

> A top-down view of a modern dark boutique gym floor plan, seen straight from above like an
> architectural render, wide 16:9. Floor of matte near black rubber tiles (#0E0D12 to #17141D) with
> subtle tile seams. Thin violet glowing wall lines outline the rooms. Layout from left to right:
> TOP LEFT a row of six treadmills seen from above, belts pointing down; MIDDLE LEFT a long dumbbell
> rack with violet and amber dumbbells and three flat benches in front of it; BOTTOM LEFT four stretching
> mats and two foam rollers, and a small front desk counter with a monitor near the bottom middle left.
> The MIDDLE THIRD of the image is an open empty aisle of plain dark floor, nothing in it, leading down to
> a double glass entrance door at the bottom center. TOP RIGHT three squat racks with barbells and amber
> plates; MIDDLE RIGHT a glass walled studio room with six exercise mats in two rows and one instructor
> mat at the front; BOTTOM RIGHT a locker room with a row of eight violet lockers and a bench, and a
> slim check-in kiosk tablet stand beside the entrance. Everything empty, no people. Quiet, low
> contrast, so white form text can sit over the middle. + style line (ignore the transparency part).

---

## 2. People (animation strips)

Every strip: **transparent PNG, 6 equal square cells in ONE horizontal row, 3072 x 512** (8 cells =
4096 x 512 where said). Same person, same size, same position in every cell, only the movement changes.
Each prompt starts with:

> Animation sprite strip, exactly SIX equal square cells in one horizontal row, aspect ratio 6:1, truly
> transparent background. The SAME character in every cell, same scale, same center point, same camera,
> fully inside each cell with clear margins. No floor, no machine unless stated, no cell lines.

Then add the line below, then the style line.

| File | Who and what |
|---|---|
| `p-runner-1.png` | A young man in a violet tee and black shorts running, seen from above, a smooth run cycle: arms and legs swinging, 6 poses that loop. |
| `p-runner-2.png` | A woman with a ponytail in an amber top and violet leggings jogging, seen from above, run cycle that loops. |
| `p-bench-press.png` | A man lying on a flat bench (include the bench) pressing two violet dumbbells: arms bent, rising, straight up, holding, lowering, bent. |
| `p-curl.png` | A woman standing, doing dumbbell curls with amber dumbbells, alternating arms, seen from above. |
| `p-squat.png` | A strong man under a barbell with amber plates (include only the barbell) doing a squat: standing, going down, deepest, rising, standing, small rest. |
| `p-coach-spot.png` | A coach in a cream polo with a violet lanyard standing beside a rack, clapping and giving a thumbs up, loop. |
| `p-stretch.png` | A woman on a mat (include the mat) doing a side stretch, reaching left then right, slow loop. |
| `p-studio-instructor.png` | A cheerful class instructor in violet, doing jumping jacks facing down the image. |
| `p-studio-member.png` | A class member in amber and charcoal doing jumping jacks, half a beat behind the instructor. (Used six times in the studio.) |
| `p-desk.png` | A front desk staff member behind nothing, holding a small scanner, scanning then waving hello, loop. |
| `p-walker.png` | **8 cells (4096 x 512).** A member in a violet hoodie with a gym bag walking DOWN the image (toward the bottom), a full walk cycle. The page turns this one to walk any direction. |
| `p-kettlebell.png` | The website's lavender kettlebell mascot (handle on its head, black oval eyes, happy mouth, tiny arms, violet and white shoes, cream towel with amber stripes) seen from above, bouncing and waving near the entrance. |

---

## 3. Optional: one looping video instead

Only if you would rather have a single video than separate people (it cannot line up with the area names
as precisely, so the page would then hide the names).

> An 8 second seamless looping top-down animation of the same dark boutique gym (layout as in prompt 1),
> camera completely still, directly above. Small cartoon people train in each area: two runners on
> treadmills, one bench press, one squat with a coach clapping, a stretching woman, a studio class of six
> doing jumping jacks with an instructor, a desk staff member waving, one member walking in from the
> entrance to the desk. The middle third stays empty and dark. The last frame matches the first.
> 1920 x 1080, 24 fps, no text. + style line.

---

## What I do with them

1. Put `gym-floor.png` behind the form (WebP, dimmed slightly so the form reads), keeping the room names
   and the "You are here" dot drawn by the page.
2. Place each strip on its machine and loop it with CSS `steps()`; the walker follows a path from the
   door to the desk and on to the lockers.
3. Reduced motion shows everyone standing still. Phone width shows only the area around the door.
