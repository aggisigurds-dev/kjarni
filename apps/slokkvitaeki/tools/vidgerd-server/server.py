#!/usr/bin/env python3
"""Ljósmyndaviðgerð — local photo-repair server for Kjarni's ArtCraft
Autogenerator. Runs entirely on your own machine; nothing is uploaded
anywhere else. Kjarni's /kjarni/artcraft/vidgerd page talks to this over
HTTP, the same way Einkastúdíó talks to a local Automatic1111/Forge.

Endpoints:
  GET  /health   -> {"ok": true}
  POST /enhance  -> multipart form: file=<image>, face=<bool>,
                     redeye=<bool>, texture=<bool>. Returns the fixed
                     image (image/jpeg).

Start: python3 server.py  (defaults to http://127.0.0.1:8787)
"""
import io
import os

import cv2
import numpy as np
import torch
import uvicorn
from basicsr.archs.rrdbnet_arch import RRDBNet
from fastapi import FastAPI, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from facexlib.detection import init_detection_model
from gfpgan import GFPGANer
from realesrgan import RealESRGANer

HERE = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(HERE, "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)

# Resizing before processing is not an optional nicety — a full-resolution
# phone/camera photo (20+ MP) run through these models on CPU can take over
# 30 minutes. This cap keeps a single request to well under a minute while
# losing no meaningful quality for face/skin work.
MAX_DIMENSION = 1600

app = FastAPI(title="Kjarni Ljósmyndaviðgerð")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local-only server; same trust model as Einkastúdíó's WebUI
    allow_methods=["*"],
    allow_headers=["*"],
)

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_gfpgan_cache: dict[bool, GFPGANer] = {}
_detector = None


def _build_texture_upsampler() -> RealESRGANer:
    # half=False on CPU: fp16 kernels aren't implemented for CPU ops, so this
    # must be False there. Already validated end-to-end on CPU (slower, but works).
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
    return RealESRGANer(
        scale=2,
        model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
        model=model,
        tile=400,
        tile_pad=10,
        pre_pad=0,
        half=torch.cuda.is_available(),
        device=_device,
    )


def get_gfpgan(with_texture: bool) -> GFPGANer:
    """Cached per bg-upsampler mode: GFPGAN's bg_upsampler is fixed at
    construction time, so "face + texture together" needs a distinct
    instance from "face only" rather than a per-request toggle."""
    if with_texture not in _gfpgan_cache:
        bg_upsampler = _build_texture_upsampler() if with_texture else None
        _gfpgan_cache[with_texture] = GFPGANer(
            model_path="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
            upscale=1,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=bg_upsampler,
            device=_device,
        )
    return _gfpgan_cache[with_texture]


def get_texture_upsampler() -> RealESRGANer:
    return _build_texture_upsampler()


def get_detector():
    global _detector
    if _detector is None:
        _detector = init_detection_model("retinaface_resnet50", half=False, device=_device)
    return _detector


def resize_if_needed(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) <= MAX_DIMENSION:
        return img
    scale = MAX_DIMENSION / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def fix_red_eye(img: np.ndarray) -> np.ndarray:
    det_net = get_detector()
    with torch.no_grad():
        bboxes = det_net.detect_faces(img, 0.97)
    img = img.copy()
    for bbox in bboxes:
        face_w = bbox[2] - bbox[0]
        radius = max(4, int(face_w * 0.09))
        for ex, ey in ((int(bbox[5]), int(bbox[6])), (int(bbox[7]), int(bbox[8]))):
            x0, y0 = max(0, ex - radius), max(0, ey - radius)
            x1, y1 = min(img.shape[1], ex + radius), min(img.shape[0], ey + radius)
            roi = img[y0:y1, x0:x1].astype(np.int32)
            b, g, r = cv2.split(roi)
            red_mask = (r > 1.35 * g) & (r > 1.35 * b) & (r > 50)
            if red_mask.sum() == 0:
                continue
            avg_gb = (g + b) // 2
            r[red_mask] = avg_gb[red_mask]
            img[y0:y1, x0:x1] = cv2.merge([b, g, r]).astype(np.uint8)
    return img


@app.get("/health")
def health():
    return {"ok": True, "device": str(_device)}


@app.post("/enhance")
async def enhance(
    file: UploadFile,
    face: bool = Form(True),
    redeye: bool = Form(True),
    texture: bool = Form(False),
):
    raw = await file.read()
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse(status_code=400, content={"error": "Gat ekki lesið myndina"})

    img = resize_if_needed(img)

    try:
        if face:
            restorer = get_gfpgan(with_texture=texture)
            _, _, img = restorer.enhance(img, has_aligned=False, only_center_face=False, paste_back=True)
        elif texture:
            # texture-only pass (no face restoration) — plain Real-ESRGAN over the whole frame
            upsampler = get_texture_upsampler()
            img, _ = upsampler.enhance(img, outscale=1)

        if redeye:
            img = fix_red_eye(img)
    except Exception as exc:  # noqa: BLE001 — surface the real error to the caller
        return JSONResponse(status_code=500, content={"error": str(exc)})

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        return JSONResponse(status_code=500, content={"error": "Gat ekki vistað útkomuna"})
    return Response(content=buf.tobytes(), media_type="image/jpeg")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    print(f"Ljósmyndaviðgerð running on http://127.0.0.1:{port}  (device: {_device})")
    uvicorn.run(app, host="127.0.0.1", port=port)
