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
