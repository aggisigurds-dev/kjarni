"use client";

import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import "../artcraft.css";
import CopyButton from "./CopyButton";

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="ac-shot">
      <ImageZoom src={src} alt={alt} />
    </figure>
  );
}

export default function LeidarvisirClient() {
  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Leiðarvísir"}
          </p>
          <h1>Leiðarvísir</h1>
          <p className="ac-lead">
            Sjö myndvinnslutól. Fjögur virka samstundis í vafranum — slepptu mynd inn og
            er það. Þrjú þurfa forrit í gangi á þinni eigin vél — hér er nákvæmlega hvernig
            á að setja þau upp, skref fyrir skref, með skjáskotum af alvöru viðmótinu.
          </p>

          <section className="ac-panel">
            <h2>Þessi virka strax — ekkert uppsett</h2>
            <p className="ac-hint">Opnaðu tólið, slepptu mynd inn. Ekkert fer í skýið.</p>
            <div className="ac-grid">
              <a className="ac-card" href="/kjarni/artcraft/bakgrunnur">
                <span className="ac-ico" aria-hidden="true">✂️</span>
                <b>Fjarlægja bakgrunn</b>
                <span className="ac-role">Vörumyndir</span>
                <p>Klippir vöruna úr myndinni, skilar gegnsærri PNG.</p>
              </a>
              <a className="ac-card" href="/kjarni/artcraft/bakgrunnur?botn=hvitt">
                <span className="ac-ico" aria-hidden="true">⬜</span>
                <b>Á hvítan bakgrunn</b>
                <span className="ac-role">Vörumyndir</span>
                <p>Sama klipping, varan sett á hreint hvítt.</p>
              </a>
              <a className="ac-card" href="/kjarni/artcraft/kastljos">
                <span className="ac-ico" aria-hidden="true">🔦</span>
                <b>Kastljós</b>
                <span className="ac-role">Birta</span>
                <p>Finnur persónuna, stillir birtu á henni og bakgrunninum — hverja hlið sér.</p>
              </a>
              <a className="ac-card" href="/kjarni/artcraft/mota">
                <span className="ac-ico" aria-hidden="true">🖌️</span>
                <b>Móta</b>
                <span className="ac-role">Lögun</span>
                <p>Mjókka, þenja eða draga líkamslínur með bursta sem þú stillir.</p>
              </a>
            </div>
          </section>

          <section className="ac-panel">
            <h2>Bakgrunnur — í smáatriðum</h2>
            <Shot src="/leidarvisir/bakgrunnur.png" alt="Bakgrunnur-tólið: dropzone og sýnismyndir úr versluninni" />
            <p className="ac-hint">
              Slepptu vörumynd í kassann, eða smelltu á eitt af slökkvitækjunum úr versluninni
              til að prófa strax. Veldu „Á hvítu" efst til að fá hreint hvítan bakgrunn í
              staðinn fyrir gegnsæi.
            </p>
          </section>

          <section className="ac-panel">
            <h2>Kastljós — í smáatriðum</h2>
            <Shot src="/leidarvisir/kastljos.png" alt="Kastljós-tólið: átta sleðar, einn fyrir hverja hlið bakgrunns og persónu" />
            <p className="ac-hint">
              Átta sleðar — fjórar hliðar (upp/niður/vinstri/hægri) fyrir bakgrunninn og
              sama fyrir persónuna, hver frá -100% (dekkra) upp í +100% (bjartara). Þeir
              leggjast saman, svo t.d. má hafa dökkt að neðan OG dekkra hægra megin samtímis.
              Ýttu á „Reikna kastljós" þegar stillingarnar eru réttar.
            </p>
          </section>

          <section className="ac-panel">
            <h2>Móta — í smáatriðum</h2>
            <Shot src="/leidarvisir/mota.png" alt="Móta-tólið: burstahringur fylgir músinni, stærð stillt með sleða" />
            <p className="ac-hint">
              Veldu Minnka/Stækka/Færa efst, stilltu burstastærð og styrk, strjúktu svo yfir
              myndina. Hringurinn kringum bendilinn sýnir nákvæmlega hvað næsta stroka nær
              yfir. Afturkalla tekur til baka eina stroku í einu, Núllstilla fer alla leið
              aftur í upprunalegu myndina.
            </p>
          </section>

          <section className="ac-panel">
            <h2>Þessi þurfa forrit á þinni vél</h2>
            <p className="ac-hint">
              Þrjú tól nota þung AI-líkön sem vafri getur ekki keyrt sjálfur — þau þurfa
              alvöru tölvuafl. Þess vegna talar kjarni-síðan beint við forrit sem{" "}
              <b>þú ræsir og lætur vera í gangi á þinni eigin vél</b> á meðan þú notar tólið.
              Myndin fer aldrei í skýið með þessari leið — nema þú veljir skýjaleiðina í
              Ljósmyndaviðgerð sérstaklega.
            </p>
          </section>

          <section className="ac-panel">
            <h2>Einkastúdíó</h2>
            <p className="ac-hint">Texti → mynd með Automatic1111, Forge eða SD.Next sem keyrir á þinni vél.</p>
            <Shot src="/leidarvisir/studio.png" alt="Einkastúdíó: slóð á staðbundna vefviðmótið og Prófa tengingu-hnappur" />
            <ol className="ac-steps">
              <li>
                <div>
                  Settu upp{" "}
                  <a href="https://github.com/lllyasviel/stable-diffusion-webui-forge" target="_blank" rel="noreferrer">
                    Forge
                  </a>{" "}
                  eða{" "}
                  <a href="https://github.com/AUTOMATIC1111/stable-diffusion-webui" target="_blank" rel="noreferrer">
                    Automatic1111
                  </a>{" "}
                  eins og vanalega, og sæktu a.m.k. eitt checkpoint-líkan (t.d. af{" "}
                  <a href="https://civitai.com" target="_blank" rel="noreferrer">
                    Civitai
                  </a>
                  ) í <code>models/Stable-diffusion</code>.
                </div>
              </li>
              <li>
                <div>
                  Ræstu það með <code>--api</code> og leyfðu CORS svo vafrinn megi tala við það:
                  <div className="ac-cmdrow">
                    <code>--api --cors-allow-origins=*</code>
                    <CopyButton text="--api --cors-allow-origins=*" />
                  </div>
                  Bættu þessu við <code>COMMANDLINE_ARGS</code> í <code>webui-user.bat</code> (Windows)
                  eða <code>webui-user.sh</code> (Mac/Linux).
                </div>
              </li>
              <li>
                <div>
                  Opnaðu <a href="/kjarni/artcraft/studio">/kjarni/artcraft/studio</a>, settu inn
                  slóðina (sjálfgefið <code>http://127.0.0.1:7860</code>) og ýttu á „Prófa tengingu".
                </div>
              </li>
              <li>
                <div>Grænt „Tengt" — þá er allt klárt. Haltu Forge/A1111-glugganum opnum á meðan þú notar Einkastúdíó.</div>
              </li>
            </ol>
          </section>

          <section className="ac-panel">
            <h2>Ljósmyndaviðgerð</h2>
            <p className="ac-hint">Laga óskýr andlit (GFPGAN), rauð augu og áferð. Veldu á milli þriggja leiða efst á síðunni.</p>
            <Shot src="/leidarvisir/vidgerd.png" alt="Ljósmyndaviðgerð: skerpt fyrir/eftir útkoma úr í-vafra leiðinni" />
            <div className="ac-grid">
              <a className="ac-card" href="/kjarni/artcraft/vidgerd">
                <span className="ac-ico" aria-hidden="true">🖥️</span>
                <b>Staðbundinn netþjónn</b>
                <span className="ac-role">Besta gæðin</span>
                <p>Engin mynd fer neitt — en þarf eina Python-uppsetningu.</p>
              </a>
              <a className="ac-card" href="/kjarni/artcraft/vidgerd">
                <span className="ac-ico" aria-hidden="true">☁️</span>
                <b>Skýjaþjónusta</b>
                <span className="ac-role">Ekkert uppsett</span>
                <p>Sama gæði — en kostar smá upphæð per mynd, myndin fer í skýið.</p>
              </a>
              <a className="ac-card" href="/kjarni/artcraft/vidgerd">
                <span className="ac-ico" aria-hidden="true">🌐</span>
                <b>Í vafra</b>
                <span className="ac-role">Ókeypis</span>
                <p>Ekkert uppsett, engin mynd send — en bara skerpa, ekki full lagfæring.</p>
              </a>
            </div>

            <h3 style={{ marginTop: 20 }}>🖥️ Staðbundinn netþjónn — uppsetning</h3>
            <ol className="ac-steps">
              <li><div>Opnaðu <code>tools/vidgerd-server</code> í repo-inu á þinni vél (þarf Python 3 uppsett).</div></li>
              <li>
                <div>
                  Keyrðu uppsetningarskriftuna — sækir líkönin sjálfkrafa (~500MB):
                  <div className="ac-cmdrow">
                    <code>./setup.sh</code>
                    <CopyButton text="./setup.sh" />
                  </div>
                </div>
              </li>
              <li>
                <div>
                  Ræstu netþjóninn:
                  <div className="ac-cmdrow">
                    <code>source .venv/bin/activate && python3 server.py</code>
                    <CopyButton text="source .venv/bin/activate && python3 server.py" />
                  </div>
                </div>
              </li>
              <li><div>Veldu „Staðbundinn netþjónn" í tólinu, prófaðu tengingu — sjálfgefin slóð er <code>http://127.0.0.1:8787</code>.</div></li>
            </ol>

            <h3 style={{ marginTop: 20 }}>☁️ Skýjaþjónusta — uppsetning</h3>
            <ol className="ac-steps">
              <li><div>Stofnaðu reikning á <a href="https://replicate.com" target="_blank" rel="noreferrer">replicate.com</a> og tengdu greiðslukort (borgað er per mynd, ~0,2-1 kr).</div></li>
              <li><div>Account Settings → API tokens → búðu til lykil.</div></li>
              <li><div>Settu hann sem umhverfisbreytuna <code>REPLICATE_API_TOKEN</code> á Vercel-verkefninu (Settings → Environment Variables).</div></li>
              <li><div>Veldu „Skýjaþjónusta" í tólinu — ekkert annað að gera.</div></li>
            </ol>

            <h3 style={{ marginTop: 20 }}>🌐 Í vafra</h3>
            <p className="ac-hint">Veldu „Í vafra" í tólinu og smelltu „Laga mynd". Ekkert annað að gera.</p>
          </section>

          <section className="ac-panel">
            <h2>ComfyUI</h2>
            <p className="ac-hint">Texti → mynd gegnum þitt eigið ComfyUI-hnútaverk — lágmarks flæði (checkpoint → prompt → mynd).</p>
            <Shot src="/leidarvisir/comfy.png" alt="ComfyUI-tólið: útkoma eftir tengingu og teiknun" />
            <ol className="ac-steps">
              <li>
                <div>
                  Settu upp{" "}
                  <a href="https://github.com/comfyanonymous/ComfyUI" target="_blank" rel="noreferrer">
                    ComfyUI
                  </a>{" "}
                  eins og vanalega, og settu a.m.k. eitt checkpoint í <code>models/checkpoints</code>.
                </div>
              </li>
              <li>
                <div>
                  Ræstu það með þessu, annars hafnar vafrinn köllunum frá kjarna:
                  <div className="ac-cmdrow">
                    <code>python main.py --enable-cors-header</code>
                    <CopyButton text="python main.py --enable-cors-header" />
                  </div>
                </div>
              </li>
              <li><div>Opnaðu <a href="/kjarni/artcraft/comfy">/kjarni/artcraft/comfy</a>, settu inn slóðina (sjálfgefið <code>http://127.0.0.1:8188</code>) og ýttu á „Prófa tengingu".</div></li>
              <li><div>Checkpoint-listinn fyllist sjálfkrafa út úr ComfyUI — veldu eitt, skrifaðu prompt, ýttu á „Teikna mynd".</div></li>
            </ol>
          </section>

          <section className="ac-panel">
            <h2>Villuboð — hvað þýða þau?</h2>
            <p className="ac-hint">Allar þrjár staðbundnu leiðirnar sýna sömu tegund villu þegar eitthvað klikkar.</p>
            <ol className="ac-steps">
              <li>
                <div>
                  <b><code>Náði ekki í staðbundna netþjóninn / ComfyUI / vefviðmótið</code></b> — Forritið er
                  ekki í gangi. Athugaðu að Forge/ComfyUI/<code>server.py</code> sé opið og keyrandi á
                  vélinni þinni.
                </div>
              </li>
              <li>
                <div>
                  <b>Rautt „blocked by CORS policy" í vafra-console</b> — CORS-flaggið vantar. Bættu{" "}
                  <code>--cors-allow-origins=*</code> (Forge/A1111) eða <code>--enable-cors-header</code>{" "}
                  (ComfyUI) við ræsinguna og endurræstu forritið.
                </div>
              </li>
              <li>
                <div>
                  <b><code>REPLICATE_API_TOKEN vantar í umhverfisbreytur</code></b> — Skýjaleið
                  Ljósmyndaviðgerðar — API-lykillinn er ekki settur upp á Vercel enn.
                </div>
              </li>
              <li>
                <div>
                  <b>Grátt „Tengt" en checkpoint-listinn er tómur</b> — Ekkert líkan fannst í{" "}
                  <code>models/Stable-diffusion</code> (Einkastúdíó) eða <code>models/checkpoints</code>{" "}
                  (ComfyUI). Sæktu a.m.k. eitt og endurræstu forritið.
                </div>
              </li>
              <li>
                <div>
                  <b>Allt mjög hægt</b> — Eðlilegt án skjákorts (GPU), nokkrar sekúndur upp í nokkrar
                  mínútur eftir tóli og vél.
                </div>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </StationChrome>
  );
}
