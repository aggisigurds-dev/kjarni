#!/usr/bin/env bash
# Start a local Automatic1111-compatible WebUI for Kjarni's private studio.
# Adult checkpoints are your choice; this script does not download any.
set -euo pipefail

ROOT="${WEBUI_DIR:-$HOME/stable-diffusion-webui}"
ORIGINS="${CORS_ORIGINS:-https://kjarni.vercel.app,http://localhost:3000,http://localhost:3100}"

echo "Kjarni einkastúdíó — staðbundið WebUI"
echo "Mappa: $ROOT"
echo "CORS:  $ORIGINS"
echo
echo "Forge, Automatic1111 og SD.Next duga. Dæmi um ræsingu:"
echo
echo "  export COMMANDLINE_ARGS='--api --listen --cors-allow-origins=$ORIGINS'"
echo "  cd \"$ROOT\" && ./webui.sh"
echo
echo "Svo opnaðu https://kjarni.vercel.app/kjarni/artcraft/studio"
echo "og slóðina http://127.0.0.1:7860"
echo
echo "Kjarni síar ekki nekt. Aðeins kynferðislegt myndefni af börnum er bannað."

if [[ -x "$ROOT/webui.sh" ]]; then
  export COMMANDLINE_ARGS="--api --listen --cors-allow-origins=$ORIGINS ${COMMANDLINE_ARGS:-}"
  exec "$ROOT/webui.sh"
fi

exit 0
