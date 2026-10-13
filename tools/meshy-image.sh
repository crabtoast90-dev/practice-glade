#!/usr/bin/env bash
# Generate one image with Meshy Image-to-Image, using reference images as style input.
# Usage: tools/meshy-image.sh <out.png> "<prompt>" <ref1> [ref2 ...]
# The API key is injected by the network proxy; never put it in this script.
set -euo pipefail
out="$1"; prompt="$2"; shift 2
model="${MESHY_IMAGE_MODEL:-nano-banana-2}"
body_file=$(mktemp); trap 'rm -f "$body_file"' EXIT
python3 -I - "$model" "$prompt" "$@" > "$body_file" <<'PY'
import base64, json, mimetypes, sys
model, prompt, *refs = sys.argv[1:]
urls = []
for r in refs:
    mime = mimetypes.guess_type(r)[0] or "image/png"
    if r.endswith(".webp"): mime = "image/webp"
    urls.append(f"data:{mime};base64," + base64.b64encode(open(r, "rb").read()).decode())
print(json.dumps({"ai_model": model, "prompt": prompt, "reference_image_urls": urls, "aspect_ratio": "16:9"}))
PY
task=$(curl -sS -X POST https://api.meshy.ai/openapi/v1/image-to-image \
  -H "Content-Type: application/json" --data-binary "@$body_file" | tee /dev/stderr | jq -r '.result')
[ -n "$task" ] && [ "$task" != null ] || { echo "create failed" >&2; exit 1; }
echo "task $task" >&2
for i in $(seq 1 120); do
  sleep 5
  resp=$(curl -sS "https://api.meshy.ai/openapi/v1/image-to-image/$task")
  status=$(echo "$resp" | jq -r '.status')
  echo "$status $(echo "$resp" | jq -r '.progress')" >&2
  if [ "$status" = "SUCCEEDED" ]; then
    curl -sS -o "$out" "$(echo "$resp" | jq -r '.image_urls[0]')"
    echo "saved $out"; exit 0
  fi
  if [ "$status" = "FAILED" ] || [ "$status" = "CANCELED" ]; then echo "$resp" >&2; exit 1; fi
done
echo "timed out" >&2; exit 1
