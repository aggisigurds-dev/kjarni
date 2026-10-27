# ComfyUI — staðbundin tenging

Kjarni-síðan `/kjarni/artcraft/comfy` talar beint við þitt eigið
[ComfyUI](https://github.com/comfyanonymous/ComfyUI) sem þú keyrir á þinni
vél — sama mynstur og Einkastúdíó talar við Automatic1111/Forge og
Ljósmyndaviðgerð talar við sinn staðbundna netþjón. Ekkert fer í skýið, og
það er engin ný þjónusta í þessu repo-i til að setja upp — ComfyUI er
þjónninn.

## Uppsetning

Settu upp og ræstu ComfyUI eins og vanalega (sjá
[opinberu leiðbeiningarnar](https://github.com/comfyanonymous/ComfyUI)), en
bættu við **`--enable-cors-header`** þegar þú ræsir, annars hafnar vafrinn
köllunum frá Kjarna (CORS):

```sh
python main.py --enable-cors-header
```

Sjálfgefin slóð ComfyUI er `http://127.0.0.1:8188` — stilltu slóðina í
viðmótinu ef þú keyrir á annarri vél/porti.

## Hvað Kjarni gerir

Síðan byggir lágmarks "API format" hnútaverk (checkpoint → CLIP-prompt →
KSampler → VAE-afkóðun → vista mynd), sendir það á `POST /prompt`, póllar
`GET /history/{prompt_id}` þangað til myndin er tilbúin, og sækir hana af
`GET /view`. Checkpoint-listinn kemur beint úr
`GET /object_info/CheckpointLoaderSimple`, svo hvaða líkan sem er í þínu
`models/checkpoints` birtist sjálfkrafa.

Allar slóðir og JSON-form eru staðfest gegn ComfyUI's eigin kóða
(`server.py`, `execution.py`, `comfy/samplers.py` og
`script_examples/websockets_api_example.py` í
[comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI)), ekki
giskuð.

## Útvíkkun

Þetta er vísvitandi einfaldasta mögulega workflow — ekkert ControlNet,
LoRA eða margra-þrepa flæði. Vilji einhver flóknara hnútaverk (t.d. sama
auðkenni/stellingu og Einkastúdíó notar, eða img2img) er rétti staðurinn að
útvíkka `buildTxt2ImgWorkflow` í
`app/kjarni/artcraft/comfy/comfy.ts` — eða skrifa nýtt
`build*Workflow`-fall við hliðina á því fyrir sértækt flæði.

## Hreyfimynd (mynd → myndband, Wan 2.1)

Síðan `/kjarni/artcraft/hreyfimynd` talar við sama ComfyUI-netþjón, en
keyrir Wan 2.1 Image-to-Video í staðinn fyrir venjulegt txt2img. Hnútaverkið
(`buildImg2VidWorkflow` í `comfy.ts`) er stað- og nafnnákvæm eftirmynd af
Comfy-Org's opinbera dæmi
([`image_to_video_wan.json`](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_to_video_wan.json)),
staðfest hnút fyrir hnút gegn raunverulega Python-kóðanum í
[comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI)
(`comfy_extras/nodes_wan.py`, `nodes_video.py`, `nodes_model_advanced.py`).

**Þarf til viðbótar** (Wan er stórt myndbands-líkan, ekki með í venjulegri
ComfyUI-uppsetningu — sækja þarf þessi líkön sjálf af
[Hugging Face/Comfy-Org](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged)):

| Hlutverk | Skrá | Mappa |
|---|---|---|
| Díffusion-líkan | `wan2.1_i2v_480p_14B_fp16.safetensors` (eða `720p`-útgáfan) | `models/diffusion_models/` |
| Texta-encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` |
| VAE | `wan_2.1_vae.safetensors` | `models/vae/` |
| CLIP Vision | `clip_vision_h.safetensors` | `models/clip_vision/` |

14B-líkanið þarf vel af VRAM (20GB+ fyrir góð gæði — minni fp8-útgáfur eru
til fyrir veikari skjákort). Myndbandsgerð er mun þyngri en kyrrmynd —
reiknaðu með nokkrum mínútum per myndband á öflugu skjákorti.

Líkanalistarnir í viðmótinu (`listUnetModels`, `listClipModels`,
`listVaeModels`, `listClipVisionModels` í `comfy.ts`) koma beint úr
`GET /object_info/<NodeClass>`, sömu leið og checkpoint-listinn fyrir
txt2img — hvað sem er sett í möppurnar hér að ofan birtist sjálfkrafa.
