#!/usr/bin/env bash
# Bootstrap ComfyUI á RunPod (eða hvaða Linux-GPU-pod sem er) með
# Wan 2.2 (A14B T2V + I2V, fp8 default) og Juggernaut XL Ragnarok.
# Hugsað til að keyra inni í opinbera RunPod ComfyUI template-inu
# (/workspace/ComfyUI er þegar til þar), en lifir líka á berri Ubuntu
# ef COMFY_ROOT er sett og ComfyUI er sett upp handvirkt áður.
#
# Notkun:
#   export CIVITAI_TOKEN="ct_..."           # til að ná í Juggernaut
#   export HF_TOKEN="hf_..."                # valfrjálst, hækkar HF rate limit
#   bash runpod-comfyui-bootstrap.sh         # sækir módelin + ræsir
#   bash runpod-comfyui-bootstrap.sh models  # sækir bara módelin
#   bash runpod-comfyui-bootstrap.sh serve   # ræsir bara serverinn
#
# Umhverfisbreytur sem má yfirstýra:
#   COMFY_ROOT        (default /workspace/ComfyUI)
#   WAN_PRECISION     fp8 | fp16  (default fp8 — passar í 24 GB VRAM)
#   SKIP_WAN_I2V      1 til að sleppa I2V módelum (sparar ~28 GB á fp8)
#   CORS_ORIGINS      kommu-aðskilið (default: kjarni.vercel.app + localhost)
#   LISTEN_PORT       default 8188

set -euo pipefail

COMFY_ROOT="${COMFY_ROOT:-/workspace/ComfyUI}"
WAN_PRECISION="${WAN_PRECISION:-fp8}"
SKIP_WAN_I2V="${SKIP_WAN_I2V:-0}"
CORS_ORIGINS="${CORS_ORIGINS:-https://kjarni.vercel.app,http://localhost:3000,http://localhost:3100}"
LISTEN_PORT="${LISTEN_PORT:-8188}"

MODELS="$COMFY_ROOT/models"
CUSTOM_NODES="$COMFY_ROOT/custom_nodes"

HF_BASE="https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"
JUGGERNAUT_CIVITAI_URL="https://civitai.com/api/download/models/782002"  # Ragnarok

log() { printf '\033[1;36m[bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[bootstrap] %s\033[0m\n' "$*" >&2; exit 1; }

ensure_tools() {
  local need=()
  command -v wget >/dev/null || need+=("wget")
  command -v git  >/dev/null || need+=("git")
  if ((${#need[@]})); then
    log "Set upp: ${need[*]}"
    apt-get update -qq && apt-get install -y --no-install-recommends "${need[@]}"
  fi
  if ! command -v aria2c >/dev/null; then
    log "Set upp aria2 (hraðari niðurhal í bútum)"
    apt-get install -y --no-install-recommends aria2 || true
  fi
}

download() {
  # download <url> <dest-dir> <filename> [auth-header]
  local url="$1" dir="$2" name="$3" auth="${4:-}"
  mkdir -p "$dir"
  local out="$dir/$name"
  if [[ -s "$out" ]]; then
    log "Þegar til: $name ($(du -h "$out" | cut -f1))"
    return 0
  fi
  log "Sæki $name"
  if command -v aria2c >/dev/null; then
    local -a args=(-x 16 -s 16 -c --summary-interval=10 --console-log-level=warn -d "$dir" -o "$name" "$url")
    [[ -n "$auth" ]] && args+=(--header="$auth")
    aria2c "${args[@]}"
  else
    local -a args=(-c --show-progress -O "$out" "$url")
    [[ -n "$auth" ]] && args=(--header="$auth" "${args[@]}")
    wget "${args[@]}"
  fi
}

install_custom_nodes() {
  log "Set upp custom nodes"
  mkdir -p "$CUSTOM_NODES"
  cd "$CUSTOM_NODES"
  local repos=(
    "https://github.com/ltdrdata/ComfyUI-Manager.git"
    "https://github.com/kijai/ComfyUI-WanVideoWrapper.git"
    "https://github.com/cubiq/ComfyUI_essentials.git"
    "https://github.com/Fannovel16/comfyui_controlnet_aux.git"
  )
  for repo in "${repos[@]}"; do
    local name
    name="$(basename "$repo" .git)"
    if [[ -d "$name/.git" ]]; then
      log "Uppfæri $name"
      git -C "$name" pull --ff-only || log "  (gat ekki uppfært — fer áfram)"
    else
      git clone --depth 1 "$repo" "$name"
    fi
    if [[ -f "$name/requirements.txt" ]]; then
      pip install -q -r "$name/requirements.txt" || log "  (pip install skilaði villu á $name — fer áfram)"
    fi
  done
}

download_wan22() {
  log "Wan 2.2 — nákvæmni: $WAN_PRECISION, I2V: $([[ $SKIP_WAN_I2V == 1 ]] && echo nei || echo já)"
  local suffix
  case "$WAN_PRECISION" in
    fp8)  suffix="fp8_e4m3fn_scaled_KJ.safetensors" ;;
    fp16) suffix="fp16.safetensors" ;;
    *)    die "Óþekkt WAN_PRECISION: $WAN_PRECISION (notaðu fp8 eða fp16)" ;;
  esac

  # Diffusion models — high + low noise expert pair (Wan 2.2 er MoE)
  local variants=(t2v)
  [[ "$SKIP_WAN_I2V" != "1" ]] && variants+=(i2v)
  for v in "${variants[@]}"; do
    for noise in high low; do
      local file="wan2.2_${v}_${noise}_noise_14B_${suffix}"
      download "$HF_BASE/diffusion_models/$file" "$MODELS/diffusion_models" "$file" "${HF_AUTH:-}"
    done
  done

  # Text encoder (umt5-xxl, fp8 scaled dugar)
  download "$HF_BASE/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" \
    "$MODELS/text_encoders" "umt5_xxl_fp8_e4m3fn_scaled.safetensors" "${HF_AUTH:-}"

  # VAE (Wan 2.2 endurnotar 2.1 VAE)
  download "$HF_BASE/vae/wan_2.1_vae.safetensors" \
    "$MODELS/vae" "wan_2.1_vae.safetensors" "${HF_AUTH:-}"
}

download_juggernaut() {
  if [[ -z "${CIVITAI_TOKEN:-}" ]]; then
    log "⚠️  CIVITAI_TOKEN ekki sett — slepp Juggernaut XL Ragnarok."
    log "    Náðu í token á https://civitai.com/user/account → API Keys"
    log "    og settu   export CIVITAI_TOKEN=ct_...   áður en skriftan er keyrð."
    return 0
  fi
  download \
    "${JUGGERNAUT_CIVITAI_URL}?token=${CIVITAI_TOKEN}" \
    "$MODELS/checkpoints" \
    "juggernautXL_ragnarok.safetensors"
}

serve() {
  cd "$COMFY_ROOT"
  log "Ræsi ComfyUI á 0.0.0.0:$LISTEN_PORT (CORS: $CORS_ORIGINS)"
  log "RunPod gefur public URL á forminu  https://<pod-id>-$LISTEN_PORT.proxy.runpod.net"
  exec python main.py \
    --listen 0.0.0.0 \
    --port "$LISTEN_PORT" \
    --enable-cors-header "$CORS_ORIGINS" \
    --preview-method auto
}

main() {
  [[ -d "$COMFY_ROOT" ]] || die "COMFY_ROOT finnst ekki: $COMFY_ROOT"
  if [[ -n "${HF_TOKEN:-}" ]]; then
    export HF_AUTH="Authorization: Bearer $HF_TOKEN"
  fi

  local mode="${1:-all}"
  case "$mode" in
    all)
      ensure_tools
      install_custom_nodes
      download_wan22
      download_juggernaut
      serve
      ;;
    models)
      ensure_tools
      install_custom_nodes
      download_wan22
      download_juggernaut
      log "Lokið — ComfyUI ekki ræst (keyrðu  $0 serve  til að ræsa)."
      ;;
    serve)
      serve
      ;;
    *)
      die "Óþekktur hamur: $mode (all | models | serve)"
      ;;
  esac
}

main "$@"
