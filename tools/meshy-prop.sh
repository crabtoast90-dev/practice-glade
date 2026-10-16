#!/usr/bin/env bash
# Generate one low-poly prop with Meshy text-to-3D (preview mesh, then flat-colour texture) and save a GLB.
# Usage: tools/meshy-prop.sh <out.glb> "<prompt>" [target_polycount]
# The API key is injected by the network proxy; never put it in this script.
set -euo pipefail
out="$1"; prompt="$2"; polys="${3:-3000}"
style=" Low poly, flat shaded, simple chunky stylized forms, flat solid colours, no fine texture detail."
post() { curl -sS -X POST "https://api.meshy.ai/openapi/v2/text-to-3d" -H "Content-Type: application/json" --data-binary "$1"; }
wait_for() {
  for i in $(seq 1 120); do
    sleep 5
    resp=$(curl -sS "https://api.meshy.ai/openapi/v2/text-to-3d/$1")
    status=$(echo "$resp" | jq -r '.status')
    echo "$status $(echo "$resp" | jq -r '.progress')" >&2
    [ "$status" = "SUCCEEDED" ] && { echo "$resp"; return 0; }
    if [ "$status" = "FAILED" ] || [ "$status" = "CANCELED" ]; then echo "$resp" >&2; return 1; fi
  done
  return 1
}
body=$(jq -n --arg p "$prompt$style" --argjson n "$polys" '{mode:"preview", prompt:$p, ai_model:"meshy-6", topology:"triangle", target_polycount:$n, should_remesh:true, symmetry_mode:"off"}')
pre=$(post "$body" | tee /dev/stderr | jq -r '.result')
[ -n "$pre" ] && [ "$pre" != null ] || { echo "create failed" >&2; exit 1; }
wait_for "$pre" > /dev/null
body=$(jq -n --arg id "$pre" --arg tex "${TEXTURE:-flat solid colours, matte, painted low poly}" '{mode:"refine", preview_task_id:$id, enable_pbr:false, texture_prompt:$tex}')
ref=$(post "$body" | tee /dev/stderr | jq -r '.result')
[ -n "$ref" ] && [ "$ref" != null ] || { echo "refine failed" >&2; exit 1; }
resp=$(wait_for "$ref")
curl -sS -o "$out" "$(echo "$resp" | jq -r '.model_urls.glb')"
echo "saved $out (task $ref)"
