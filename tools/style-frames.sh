#!/usr/bin/env bash
# Regenerate the three style frames in style-frames/ from the Firewatch reference shots.
set -euo pipefail
cd "$(dirname "$0")/.."
R="style-frames/reference/firewatch-1.webp style-frames/reference/firewatch-2.webp"
COMMON="An original video game concept frame for a small third-person exploration game set in a forested mountain valley at golden hour. A small hiker figure stands on a path in the mid-ground; a single paper lantern glows faintly on a rock. Use the reference images only for art style and lighting, not their exact composition. No text, no UI, no logos."
tools/meshy-image.sh style-frames/1-close-to-reference.png "$COMMON Style: very close to the references - flat-shaded stylized forms with crisp graphic shapes, dark silhouetted pine trees and dead snags in the foreground, warm low sun glowing gold and orange against a teal sky, long shadows across dry golden grass, several layers of blue-teal atmospheric haze receding into distant mountains, soft bloom around the sun, subtle god rays." $R &
tools/meshy-image.sh style-frames/2-warmer-storybook.png "$COMMON Style: a warmer, softer, storybook take on the references - rounder, gentler shapes, painterly soft gradients, peachy-gold sunlight, pink and amber wildflowers, a softer teal-to-apricot sky with fluffy clouds, cosy and inviting, gentle haze layers fading into rounded distant hills, soft glowing bloom." $R &
tools/meshy-image.sh style-frames/3-chunky-low-poly.png "$COMMON Style: a simpler, chunkier low-poly take on the references - very few large flat-colored facets, cone and pyramid shaped pine trees, blocky faceted boulders, large flat ground planes, minimal detail, still a warm low orange sun against a teal sky with long shadows and two or three flat haze layers into faceted distant mountains. Clean and cheap to build in a real-time engine." $R &
wait
