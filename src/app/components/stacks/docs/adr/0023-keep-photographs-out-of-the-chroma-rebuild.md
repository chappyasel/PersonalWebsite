# 0023 — Keep photographs out of the chroma rebuild

Status: accepted
Date: 2026-09-06

## Context

The print grade in `Effects.tsx` is the last thing between ACES and the
screen, and its third step rebuilds chroma. ACES flattens the sky's chroma
about 3:1 in the upper mids, which is why every light-theme sky hex printed
grey until the grade put the colour back. The rebuild is band-limited by
luminance and is stronger in the light theme (0.4) than in the dark (0.16),
and it is a large part of why the room reads as vivid: on the OG framing in
light mode it lifts the whole card's mean HSV saturation from 0.41 to 0.52.

Photographs go through the same pass, and they never lost that chroma. A
photograph is display-referred content already; the lit material and ACES
take a little out of it, and the rebuild then puts more back than was taken.
Measured on the desk portrait against the file it came from, same region of
the same capture:

| Render                    | HSV saturation | chroma / luminance |
| ------------------------- | -------------- | ------------------ |
| Light theme, as shipped   | +6%            | +18%               |
| Light theme, `?nograde=1` | -7%            | -4%                |
| Dark theme, as shipped    | -6%            | -6%                |
| Dark theme, `?nograde=1`  | -11%           | -15%               |

So the overshoot is the light theme's, it is the grade's, and lowering the
boost globally would dull the sky and meadow the boost exists for.

Two cheaper routes were considered and rejected. Pre-desaturating the texture
in the canvas pass that already applies the warm tint is one function, but the
boost depends on the final on-screen luminance, so it over-corrects in shadow
and under-corrects beside the lamp. Skipping tone mapping on the photo
materials undoes the deliberate "lit print, not a sticker" choice in
`LitImage.tsx`.

## Decision

**Photographs opt out of the chroma rebuild and nothing else.** The curve,
the split tone, the key hue and the vignette still apply, so a print keeps
sitting in the same light as the room around it. Only the saturation
multiplier is blended back to 1.0, the file's own chroma.

**The grade learns where the photographs are from a mask, per pixel.** Every
scene image is drawn by `LitImage`, which registers its mesh with
`registerPhotograph` unless the caller passes `gradeChroma`. `PhotoMaskPass`
sits first in the composer, right behind the render pass, and draws a private
scene of proxy quads, one per registered photograph, sharing its geometry and
copying its world matrix, flat white, at half resolution, into a target with
its own depth texture. The grade samples the mask and compares the mask's
depth with the composer's in view space, so a prop standing in front of a
print is graded as a prop and the print beneath it is not masked.

**The grade reads depth through a uniform, never through the depth
attribute.** The first cut declared `EffectAttribute.DEPTH` on the grade to
get `readDepth` for the occlusion test, and that broke every HDR practical:
the lamp mouth went cyan in the light theme and black in the dark, the fixture
faces with it. postprocessing sorts the effects of a merged pass by their
attribute bits, so the depth-attributed grade was moved ahead of Vignette and
ToneMapping and ran on raw HDR, where its S-curve goes negative above 1.5.
`PhotoMaskPass` sets `needsDepthTexture` instead, which makes the composer
create its depth texture and hand it to the pass, and the grade binds that
texture as a plain sampler. The effect order in the pass is the children's
order again.

**The room's scene is never rendered a second time.** The first cut also drew
the room itself with the camera moved onto a photo layer and a white override
material. That was rewritten to proxies before the sort was found, and stays:
proxies in their own scene share nothing with the room, not its lights, fog,
background, override material or camera layers, so nothing the room renders
can change because this pass exists.

**Cover art keeps the rebuild.** Book covers are graphic design, not
photographs. The grade's band limit was already written to protect them from
oversaturating, and the punchier cover is part of the room's look. The two
cover sites pass `gradeChroma`; `photoMaskLayer.test.ts` pins the rule.

**The shade probe's CPU port follows.** `artifactShadeProbe.ts` replays the
grade on a probe of a print to derive the DOM preview's correction, and it now
replays it as the grade treats a photograph. The probe test pins the shader
line and the constant together.

## Consequences

Touch devices have no composer and no grade, so nothing changes there, and the
mask only runs where the grade runs. The cost on desktop is one half-resolution
R8 target with a depth texture, cleared every frame, plus fifteen or so quads
and two extra texture reads per pixel in the grade pass.

The DOM preview's shade sample corrects brightness and tint, not chroma, so the
print used to hand off to a preview that was less saturated than it. Taking the
boost off the print narrows that gap.

The mask is half the composer's size, so its edge is soft by a pixel or two at
full resolution. That edge always lands on a frame or a mat, and a one-pixel
sliver of over- or under-saturated frame is not visible. If a photograph is
ever drawn without a border, that is the first place to look.

`PhotoMaskPass` asks for the composer's depth texture. On profiles that mount
neither ambient occlusion nor depth of field, the composer therefore keeps a
depth texture on its input buffer that it did not need before.
