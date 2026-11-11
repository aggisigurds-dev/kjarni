/** Heiti á því sem gerist í dansinum — stökk, snúningar, skref og stöður —
 *  skýringar á þeim (Kennsluefni) og æfingaáherslur út frá einkunnum.
 *
 *  Stökkin og snúningarnir fylgja lista Alþjóðaskautasambandsins (ISU, Scale
 *  of Values) og skammstöfunum hans (2Lz, FCSSp, StSq …) — sömu skammstafanir
 *  og Skautasamband Íslands notar í grunnprófum og á prótokolum. Annað á
 *  listanum (lítil stökk, tilbrigði, stöður) er ekki á ISU-listanum en algengt
 *  í dönsum. Hvert heiti er til á ensku og íslensku; það sem er GEYMT er alltaf
 *  íslenska grunnheitið ("2× Lutz + 2× Toe loop"), og `labelIn` sýnir það á
 *  málinu sem er valið ("Double Lutz + Double Toe loop"). Listinn er tillögur:
 *  þjálfarinn getur alltaf skrifað sitt eigið heiti. Hreint — prófað í node. */

export type Lang = "is" | "en";

export type ElementGroupId = "stokk" | "hopp" | "snuningar" | "tilbrigdi" | "skref" | "stodur" | "dans";

/** `name` er grunnheitið sem er geymt, `en` enska heitið (ef það er annað),
 *  `code` ISU-skammstöfunin, `also` önnur heiti sem leitin finnur og `info`
 *  stutt skýring fyrir Kennsluefni. */
export type ElementItem = { name: string; en?: string; code?: string; also?: string; info?: string };

export type ElementGroup = { id: ElementGroupId; label: string; note?: string; about?: string; items: ElementItem[] };

export const ELEMENTS: ElementGroup[] = [
  {
    id: "stokk",
    label: "Stökk",
    note: "ISU-listinn",
    about:
      "Sex stökk eru á lista ISU, auk Euler. Þau þekkjast á uppstökkinu: af hvaða brún er stokkið og hvort táin hjálpar til (tástökk) eða ekki (brúnarstökk). Öll eru lent aftur á bak á ytri brún, nema Euler. Fjöldi snúninga er sagður á undan heitinu — Single, Double, Triple, Quad — og í skammstöfun 1, 2, 3, 4: Double Axel er 2A. Samsetning er skrifuð með plús: 2Lz+2T.",
    items: [
      {
        name: "Toe loop",
        code: "T",
        info: "Tástökk: stokkið af ytri brún aftur á bak með hjálp táar hins fótarins og lent á sama fæti. Oft fyrsta stökkið sem lærist með heilum snúningi, og algengt sem seinna stökk í samsetningu.",
      },
      { name: "Salchow", code: "S", info: "Brúnarstökk: stokkið af innri brún aftur á bak og lent á ytri brún aftur á bak á hinum fætinum." },
      { name: "Loop", code: "Lo", also: "Rittberger", info: "Brúnarstökk: stokkið af ytri brún aftur á bak og lent á sömu brún á sama fæti." },
      { name: "Flip", code: "F", info: "Tástökk: stokkið af innri brún aftur á bak með hjálp táar hins fótarins, lent á ytri brún aftur á bak á fætinum sem stakk tánni." },
      {
        name: "Lutz",
        code: "Lz",
        info: "Tástökk: stokkið af ytri brún aftur á bak með hjálp táar, og snúið á móti boganum sem rennt er eftir. Lent á ytri brún aftur á bak á hinum fætinum. Ef brúnin veltur inn á við í uppstökkinu er það kallað „flutz“.",
      },
      {
        name: "Axel",
        code: "A",
        info: "Eina stökkið sem er stokkið áfram (af ytri brún áfram). Þess vegna er það hálfum snúningi meira en hin: einfaldur Axel er einn og hálfur snúningur, Double Axel tveir og hálfur.",
      },
      {
        name: "Euler",
        code: "Eu",
        also: "hálft loop, half loop",
        info: "Einn snúningur af ytri brún aftur á bak, lent á innri brún aftur á bak á hinum fætinum. Notað sem tengistökk í samsetningu á undan Salchow eða Flip (t.d. 2A+1Eu+2S). Hét áður „half loop“.",
      },
    ],
  },
  {
    id: "hopp",
    label: "Lítil stökk og hopp",
    about: "Stökk sem eru ekki á ISU-listanum og fá því ekki stig sem stökk, en eru notuð sem tengingar, í skrefaröðum og í æfingum yngri iðkenda.",
    items: [
      {
        name: "Valshopp",
        en: "Waltz jump",
        also: "þriggja-hopp",
        info: "Hálfur snúningur: stokkið áfram af ytri brún og lent aftur á bak á ytri brún á hinum fætinum. Eitt fyrsta stökkið sem lærist og undirstaða Axel.",
      },
      { name: "Kanínuhopp", en: "Bunny hop", info: "Lítið hopp áfram án snúnings: lausa fætinum er sveiflað fram, lent á tánni og stigið aftur á upphafsfótinn. Fyrsta hoppið hjá byrjendum." },
      { name: "Hálft flip", en: "Half flip", info: "Flip-uppstökk með hálfum snúningi, lent áfram." },
      { name: "Hálft Lutz", en: "Half Lutz", info: "Lutz-uppstökk með hálfum snúningi, lent áfram." },
      { name: "Split-stökk", en: "Split jump", also: "splittstökk", info: "Stökk þar sem farið er í splitt í loftinu; snúningurinn skiptir ekki máli." },
      { name: "Stag-stökk", en: "Stag jump", also: "stag leap", info: "Eins og split-stökk, nema fremri fóturinn er beygður undir líkamann." },
      { name: "Rússneskt split", en: "Russian split", info: "Split-stökk með fæturna út til hliðanna, svo fætur og búkur mynda V." },
      { name: "Falling leaf", also: "fallandi lauf", info: "Hálfur snúningur af ytri brún aftur á bak (eins og Loop); fæturnir opnast í loftinu og lent er áfram." },
      { name: "Mazurka", info: "Hálfur snúningur með táaraðstoð af ytri brún aftur á bak; fæturnir krossast eins og skæri í loftinu og lent er áfram á tánni." },
      { name: "Ballettstökk", en: "Ballet jump", info: "Lítið tástökk með hálfum snúningi af ytri brún aftur á bak, lent áfram á tánni." },
      { name: "Walley", info: "Stokkið af innri brún aftur á bak, snúið á móti brúninni og lent á ytri brún aftur á bak." },
      { name: "Toe walley", info: "Eins og Walley en með táaraðstoð. Í stigagjöf er það metið eins og Toe loop." },
      {
        name: "Stökksamsetning",
        en: "Jump combination",
        also: "combo",
        info: "Tvö eða fleiri stökk í röð þar sem lendingarfótur fyrra stökksins er uppstökksfótur þess næsta, án skrefa á milli (t.d. 2Lz+2T).",
      },
      { name: "Stökkröð", en: "Jump sequence", info: "Tvö eða þrjú stökk þar sem seinna stökkið (eða þau seinni) er Axel, stokkið beint úr lendingu þess fyrra (t.d. 2F+1A+SEQ)." },
    ],
  },
  {
    id: "snuningar",
    label: "Snúningar",
    note: "ISU-listinn",
    about:
      "Grunnstöðurnar eru þrjár — uppréttur, sitjandi og vog (camel) — og layback er sérstakt afbrigði af uppréttum. Í skammstöfun er F fremst flug (Flying: farið inn í snúninginn með stökki), C fótaskipti (Change foot: snúningurinn heldur áfram á hinum fætinum) og Co samsettur (Combination). FCSSp er því sitjandi snúningur með flugi og fótaskiptum.",
    items: [
      {
        name: "Uppréttur snúningur",
        en: "Upright spin",
        code: "USp",
        also: "standandi",
        info: "Snúningur standandi á beinum eða lítið beygðum fæti, í hvaða stöðu sem er sem er ekki vogarstaða.",
      },
      { name: "Layback", en: "Layback spin", code: "LSp", also: "baksveigja", info: "Uppréttur snúningur þar sem bakið er sveigt aftur (eða til hliðar) og höfuðið hallar aftur." },
      { name: "Vogarsnúningur", en: "Camel spin", code: "CSp", info: "Snúningur á öðrum fæti með lausa fótinn réttan aftur í mjaðmahæð eða hærra — eins og vog (arabesque)." },
      {
        name: "Sitjandi snúningur",
        en: "Sit spin",
        code: "SSp",
        info: "Snúningur í sitjandi stöðu: fóturinn sem snúið er á er beygður svo lærið sé að minnsta kosti lárétt; lausi fóturinn fram, til hliðar eða aftur.",
      },
      {
        name: "Samsettur snúningur",
        en: "Combination spin",
        code: "CoSp",
        info: "Snúningur með að minnsta kosti tveimur ólíkum grunnstöðum (uppréttur, sitjandi, vog), tveir hringir eða fleiri í hverri.",
      },
    ],
  },
  {
    id: "tilbrigdi",
    label: "Tilbrigði í snúningi",
    about: "Erfiðari útfærslur á grunnstöðunum og inngangar í snúninga. Þær geta hækkað þrep (level) snúningsins en hafa ekki eigin skammstöfun.",
    items: [
      { name: "Biellmann", info: "Lausi fóturinn er dreginn upp fyrir höfuð aftan frá, með báðum höndum." },
      { name: "Donut", also: "kleinuhringur", info: "Vogarsnúningur þar sem bakið er sveigt og gripið í blað lausa fótarins, svo líkaminn myndar láréttan hring." },
      { name: "Pancake", also: "pönnukaka", info: "Sitjandi snúningur með lausa fótinn krosslagðan yfir hinn og búkinn lagðan fram yfir hann." },
      { name: "Cannonball", also: "fallbyssukúla", info: "Sitjandi snúningur þar sem lausi fóturinn er réttur fram og búkurinn beygður þétt fram yfir hann." },
      { name: "Y-snúningur", en: "Y-spin", info: "Uppréttur snúningur með lausa fótinn dreginn beint upp til hliðar, svo líkaminn myndar Y." },
      { name: "I-snúningur", en: "I-spin", info: "Uppréttur snúningur með lausa fótinn dreginn beint upp fyrir framan líkamann." },
      { name: "Haircutter", info: "Layback þar sem gripið er í blað lausa fótarins og það dregið upp að höfði (ekki upp fyrir það)." },
      { name: "Catch-foot", info: "Hvaða staða sem er þar sem haldið er í blað eða fót lausa fótarins." },
      { name: "Scratch-snúningur", en: "Scratch spin", also: "skrúfa, blur spin", info: "Hraður uppréttur snúningur með lausa fótinn krosslagðan yfir ökklann; oft lokasnúningur." },
      {
        name: "Baksnúningur",
        en: "Back spin",
        also: "backspin",
        info: "Snúningur á ytri brún aftur á bak (á lendingarfætinum). Sama staða og í loftinu í stökkum, og því mikilvæg æfing fyrir þau.",
      },
      { name: "Death drop", info: "Fluginngangur: hátt stökk með líkamann láréttan, lent beint í sitjandi baksnúning." },
      { name: "Butterfly", also: "fiðrildi", info: "Fluginngangur af báðum fótum með líkamann láréttan og fæturna í skærahreyfingu; lent í baksnúningi." },
      { name: "Illusion", info: "Búkurinn sveiflast niður að ísnum og lausi fóturinn upp, eins og vindmylla, einu sinni eða oftar í snúningnum." },
      { name: "Broken leg", info: "Sitjandi snúningur með lausa fótinn beygðan út til hliðar." },
    ],
  },
  {
    id: "skref",
    label: "Skref og beygjur",
    about: "Skrefaröð (StSq) og kóreógrafísk röð (ChSq) eru sjálfstæð atriði í prógramminu. Beygjurnar og skrefin fyrir neðan eru byggingarefnið í þeim — og í grunnmynstrum grunnprófanna.",
    items: [
      { name: "Skrefaröð", en: "Step sequence", code: "StSq", also: "sporaröð, footwork", info: "Röð skrefa og beygja sem nýtir svellið; metin í þrepum eftir fjölbreytni og erfiðleika." },
      {
        name: "Kóreógrafísk röð",
        en: "Choreographic sequence",
        code: "ChSq",
        also: "choreo",
        info: "Frjáls röð hreyfinga — spíralar, spread eagle, Ina Bauer, hydroblade, lítil stökk — sem er aðeins metin eftir gæðum, ekki þrepum.",
      },
      { name: "Three-turn", also: "þristur, 3-turn", info: "Beygja á öðrum fæti þar sem skipt er um brún og stefnu; farið á ísnum lítur út eins og talan 3." },
      { name: "Mohawk", info: "Beygja þar sem stigið er af öðrum fæti á hinn, á sams konar brún og áfram eftir sama boga." },
      { name: "Choctaw", info: "Beygja þar sem stigið er af öðrum fæti á hinn og skipt um brún, svo boginn snýst við." },
      { name: "Bracket", info: "Beygja á öðrum fæti með brúnarskiptum þar sem snúið er á móti boganum; farið á ísnum lítur út eins og slaufusvigi }." },
      { name: "Rocker", info: "Beygja á öðrum fæti þar sem brúnin helst sú sama en boginn snýst við; snúið er inn í bogann sem komið er eftir." },
      { name: "Counter", info: "Beygja á öðrum fæti þar sem brúnin helst sú sama en boginn snýst við; snúið er á móti boganum sem komið er eftir." },
      { name: "Loop-beygja", en: "Loop turn", also: "lykkja", info: "Lítil lykkja teiknuð á ísinn á öðrum fæti, á sömu brún allan tímann." },
      { name: "Twizzle", info: "Hröð beygja með mörgum snúningum á öðrum fæti á meðan rennt er áfram eða aftur á bak." },
      { name: "Chassé", also: "chasse", info: "Skref þar sem lausi fóturinn er settur niður við hliðina á hinum, sem lyftist þá aðeins frá ísnum." },
      { name: "Krossskref", en: "Crossovers", also: "yfirstig", info: "Annar fóturinn stígur yfir hinn á boga — til að ná hraða og taka beygjur." },
      { name: "Cross-roll", also: "cross roll", info: "Fóturinn krossar yfir og stígur á ytri brún, og rúllað er af einum boga á þann næsta." },
      { name: "Táskref", en: "Toe steps", info: "Lítil skref á tánum (tágöddunum)." },
    ],
  },
  {
    id: "stodur",
    label: "Stöður og svif",
    about: "Hreyfingar og stöður sem tengja atriðin saman og eru uppistaðan í kóreógrafískri röð.",
    items: [
      { name: "Spírall", en: "Spiral", also: "arabesque, vog, vogarstaða", info: "Rennt á öðrum fæti með lausa fótinn réttan í mjaðmahæð eða hærra." },
      { name: "Charlotte", also: "charlotte spiral", info: "Spírall þar sem búkurinn er beygður niður að fætinum sem rennt er á og lausi fóturinn vísar beint upp." },
      { name: "Kerrigan-spírall", en: "Kerrigan spiral", info: "Spírall þar sem hönd styður undir hné lausa fótarins, sem er lyft hátt til hliðar." },
      { name: "Y-spírall", en: "Y-spiral", info: "Spírall með lausa fótinn dreginn beint upp til hliðar." },
      { name: "Biellmann-spírall", en: "Biellmann spiral", info: "Spírall í Biellmann-stöðu: lausi fóturinn dreginn upp fyrir höfuð aftan frá." },
      { name: "Catch-foot spírall", en: "Catch-foot spiral", info: "Spírall þar sem haldið er í blað lausa fótarins." },
      { name: "Spread eagle", also: "örn", info: "Rennt á báðum fótum með tærnar út og hælana hvorn á móti öðrum, á innri eða ytri brúnum." },
      { name: "Ina Bauer", info: "Líkt og spread eagle, en fremra hnéð er djúpt beygt og aftari fóturinn beinn, blöðin samsíða; oft með bakið sveigt aftur." },
      { name: "Hydroblade", also: "hydroblading", info: "Rennt á djúpri brún með líkamann teygðan mjög lágt, nánast láréttan við ísinn." },
      { name: "Besti squat", info: "Spread eagle í djúpri hnébeygju, á ytri brúnum." },
      { name: "Cantilever", info: "Hnén beygð og bakið sveigt aftur, lárétt við ísinn, á meðan rennt er á báðum fótum." },
      { name: "Útfall", en: "Lunge", info: "Annað hnéð djúpt beygt og hinn fóturinn réttur beint aftur eftir ísnum." },
      { name: "Pivot", info: "Táin á öðrum fæti er sett í ísinn og hinn fóturinn rennur í hring í kringum hana." },
      { name: "Shoot-the-duck", also: "shoot the duck, hnébeygja á öðrum fæti", info: "Rennt sitjandi á öðrum fæti með lausa fótinn réttan fram." },
      { name: "Hnérennsli", en: "Knee slide", info: "Rennt á öðru hné eða báðum." },
    ],
  },
  {
    id: "dans",
    label: "Í dansinum",
    items: [
      { name: "Byrjunarstaða", en: "Starting pose" },
      { name: "Lokastaða", en: "Ending pose" },
      { name: "Hápunktur í tónlist", en: "Music highlight" },
      { name: "Hraður kafli", en: "Fast section" },
      { name: "Rólegur kafli", en: "Slow section" },
      { name: "Taktbreyting", en: "Tempo change" },
      { name: "Armhreyfing", en: "Arm movement" },
      { name: "Hneiging", en: "Bow" },
    ],
  },
];

export const ALL_ELEMENTS: string[] = ELEMENTS.flatMap((g) => g.items.map((i) => i.name));

const lower = (s: string) => s.trim().toLowerCase();

/** Heiti atriðisins á málinu sem er valið. */
export function nameIn(item: ElementItem, lang: Lang): string {
  return lang === "en" ? (item.en ?? item.name) : item.name;
}

function itemIn(group: ElementGroupId, name: string): ElementItem | undefined {
  const n = lower(name);
  return ELEMENTS.find((g) => g.id === group)?.items.find((i) => lower(i.name) === n);
}

function findItem(name: string): ElementItem | undefined {
  const n = lower(name);
  for (const g of ELEMENTS) {
    const item = g.items.find((i) => lower(i.name) === n);
    if (item) return item;
  }
  return undefined;
}

/** Fjöldi snúninga í stökki, sem forskeyti á grunnheitinu: "2× Salchow". Einfalt stökk hefur ekkert forskeyti. */
export const TURNS = ["", "2×", "3×", "4×"] as const;
export type Turns = (typeof TURNS)[number];

/** Hvernig snúningafjöldinn er sagður: „Double Axel“, „Tvöfaldur Axel“. */
export const TURN_WORDS: Record<Lang, Record<Turns, string>> = {
  en: { "": "Single", "2×": "Double", "3×": "Triple", "4×": "Quad" },
  is: { "": "Einfaldur", "2×": "Tvöfaldur", "3×": "Þrefaldur", "4×": "Fjórfaldur" },
};

/** "2× Lutz" → { turns: "2×", name: "Lutz" } */
export function splitTurns(label: string): { turns: Turns; name: string } {
  const m = label.trim().match(/^([1-4])\s*[×x]\s*(.+)$/i);
  if (!m) return { turns: "", name: label.trim() };
  return { turns: (m[1] === "1" ? "" : `${m[1]}×`) as Turns, name: m[2].trim() };
}

export function withTurns(name: string, turns: Turns): string {
  return turns ? `${turns} ${name}` : name;
}

/** Stökksamsetning er skrifuð með plúsum: "2× Lutz + 2× Toe loop". */
export const COMBO_MAX = 4;

export function splitCombo(label: string): string[] {
  return label
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinCombo(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, COMBO_MAX)
    .join(" + ");
}

/** Stökkin í heitinu (eitt, eða fleiri í samsetningu) ef þau eru öll á ISU-listanum; annars null. */
export function jumpParts(label: string): Array<{ turns: Turns; name: string }> | null {
  const parts = splitCombo(label).map(splitTurns);
  if (!parts.length || parts.length > COMBO_MAX) return null;
  const listed = parts.map((p) => ({ turns: p.turns, name: itemIn("stokk", p.name)?.name }));
  return listed.every((p) => p.name) ? (listed as Array<{ turns: Turns; name: string }>) : null;
}

/** Snúningur getur hafist með flugi og/eða skipt um fót: "Sitjandi snúningur með flugi". */
const FLY = " með flugi";
const CHANGE = " með fótaskiptum";
const BOTH = " með flugi og fótaskiptum";

export type Spin = { base: string; fly: boolean; change: boolean };

/** Snúningurinn í heitinu ef hann er á ISU-listanum; annars null. */
export function splitSpin(label: string): Spin | null {
  const text = label.trim();
  const low = text.toLowerCase();
  let base = text;
  let fly = false;
  let change = false;
  if (low.endsWith(BOTH)) {
    base = text.slice(0, -BOTH.length);
    fly = change = true;
  } else if (low.endsWith(FLY)) {
    base = text.slice(0, -FLY.length);
    fly = true;
  } else if (low.endsWith(CHANGE)) {
    base = text.slice(0, -CHANGE.length);
    change = true;
  }
  const item = itemIn("snuningar", base);
  return item ? { base: item.name, fly, change } : null;
}

export function withSpin(base: string, fly: boolean, change: boolean): string {
  return base + (fly && change ? BOTH : fly ? FLY : change ? CHANGE : "");
}

/** Í hvaða flokki heitið er (eftir listanum; óþekkt heiti → null). */
export function groupOf(label: string): ElementGroupId | null {
  const name = lower(label);
  if (!name) return null;
  if (jumpParts(label)) return "stokk";
  if (splitSpin(label)) return "snuningar";
  for (const g of ELEMENTS) if (g.items.some((i) => lower(i.name) === name)) return g.id;
  if (name === "stökk") return "stokk";
  if (name.includes("snúningur")) return "snuningar";
  return null;
}

/** Heitið eins og það er sýnt á málinu sem er valið: "2× Axel" → "Double Axel" /
 *  "Tvöfaldur Axel"; "Sitjandi snúningur með flugi" → "Flying sit spin".
 *  Eigin heiti þjálfarans (ekki á listanum) eru sýnd óbreytt. */
export function labelIn(label: string, lang: Lang): string {
  const jumps = jumpParts(label);
  if (jumps) return jumps.map((j) => (j.turns ? `${TURN_WORDS[lang][j.turns]} ${j.name}` : j.name)).join(" + ");
  const spin = splitSpin(label);
  if (spin) {
    if (lang === "is") return withSpin(spin.base, spin.fly, spin.change);
    const words = `${spin.fly ? "flying " : ""}${spin.change ? "change foot " : ""}${nameIn(itemIn("snuningar", spin.base)!, "en").toLowerCase()}`;
    return words[0].toUpperCase() + words.slice(1);
  }
  const item = findItem(label);
  return item ? nameIn(item, lang) : label.trim();
}

/** ISU-skammstöfun heitisins: "2× Lutz + 2× Toe loop" → "2Lz+2T", "Sitjandi
 *  snúningur með flugi" → "FSSp", "Skrefaröð" → "StSq". Ekkert á listanum → null. */
export function codeOf(label: string): string | null {
  const jumps = jumpParts(label);
  if (jumps) return jumps.map((j) => `${j.turns ? j.turns[0] : "1"}${itemIn("stokk", j.name)!.code}`).join("+");
  const spin = splitSpin(label);
  if (spin) return `${spin.fly ? "F" : ""}${spin.change ? "C" : ""}${itemIn("snuningar", spin.base)!.code}`;
  return findItem(label)?.code ?? null;
}

/** Skýringin á heitinu (síðasta stökkið í samsetningu, grunnstaða snúnings); ekkert á listanum → null. */
export function infoOf(label: string): string | null {
  const jumps = jumpParts(label);
  if (jumps) return itemIn("stokk", jumps[jumps.length - 1].name)?.info ?? null;
  const spin = splitSpin(label);
  if (spin) return itemIn("snuningar", spin.base)?.info ?? null;
  return findItem(label)?.info ?? null;
}

const JUMP_CODE = /^([1-4])?(lz|lo|eu|t|s|f|a)$/i;
const SPIN_CODE = /^(f)?(c)?(co|u|l|c|s)sp$/i;

/** Skammstöfun → grunnheiti: "2lz+2t" → "2× Lutz + 2× Toe loop", "FCSSp" →
 *  "Sitjandi snúningur með flugi og fótaskiptum". Ekki skammstöfun → null. */
export function fromCode(text: string): string | null {
  const raw = text.replace(/\s+/g, "");
  if (!raw) return null;
  const parts = raw.split("+");
  if (parts.length <= COMBO_MAX && parts.every((p) => JUMP_CODE.test(p))) {
    // Eitt stakt stökk án tölu ("T", "S", "A") er of tvírætt til að teljast skammstöfun.
    if (parts.length === 1 && !/^[1-4]/.test(parts[0]) && parts[0].length < 2) return null;
    return joinCombo(
      parts.map((p) => {
        const m = p.match(JUMP_CODE)!;
        const item = ELEMENTS[0].items.find((i) => i.code!.toLowerCase() === m[2].toLowerCase())!;
        return withTurns(item.name, (m[1] && m[1] !== "1" ? `${m[1]}×` : "") as Turns);
      }),
    );
  }
  const spin = raw.match(SPIN_CODE);
  if (spin) {
    const item = ELEMENTS.find((g) => g.id === "snuningar")!.items.find((i) => i.code!.toLowerCase() === `${spin[3]}sp`.toLowerCase());
    if (item) return withSpin(item.name, !!spin[1], !!spin[2]);
  }
  const low = raw.toLowerCase();
  for (const g of ELEMENTS) {
    if (g.id === "stokk" || g.id === "snuningar") continue;
    const item = g.items.find((i) => i.code?.toLowerCase() === low);
    if (item) return item.name;
  }
  return null;
}

/** Leitarsnið: lágstafir án brodda og íslenskra sérstafa, svo "spirall" finni "Spírall". */
export function plainText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TURN_WORD: Record<string, Turns> = {
  single: "",
  einfaldur: "",
  einfalt: "",
  double: "2×",
  tvofaldur: "2×",
  tvofalt: "2×",
  triple: "3×",
  threfaldur: "3×",
  threfalt: "3×",
  quad: "4×",
  quadruple: "4×",
  fjorfaldur: "4×",
  fjorfalt: "4×",
};

/** Orð → grunnheiti: "double axel" → "2× Axel", "tvöfaldur lutz + double toe
 *  loop" → "2× Lutz + 2× Toe loop", "flying sit spin" → "Sitjandi snúningur með
 *  flugi". Annað → null (stök heiti af listanum finnur leitin sjálf). */
export function fromWords(text: string): string | null {
  const parts = splitCombo(text).map(plainText).filter(Boolean);
  if (!parts.length || parts.length > COMBO_MAX) return null;
  let counted = false;
  const jumps: string[] = [];
  for (const part of parts) {
    const [first, ...rest] = part.split(" ");
    const turns = rest.length ? TURN_WORD[first] : undefined;
    const name = turns === undefined ? part : rest.join(" ");
    const item = ELEMENTS[0].items.find((i) => plainText(i.name) === name);
    if (!item) break;
    if (turns !== undefined) counted = true;
    jumps.push(withTurns(item.name, turns ?? ""));
  }
  if (jumps.length === parts.length && (counted || parts.length > 1)) return joinCombo(jumps);

  if (parts.length !== 1) return null;
  let rest = parts[0];
  const fly = rest.startsWith("flying ");
  if (fly) rest = rest.slice(7);
  const change = /^change (of )?foot /.test(rest);
  if (change) rest = rest.replace(/^change (of )?foot /, "");
  if (!fly && !change) return null;
  const spin = ELEMENTS.find((g) => g.id === "snuningar")!.items.find((i) => {
    const en = plainText(nameIn(i, "en"));
    return en === rest || en === `${rest} spin` || plainText(i.name) === rest;
  });
  return spin ? withSpin(spin.name, fly, change) : null;
}

/** Það sem var slegið inn, túlkað sem skammstöfun eða orð; annars null. */
export function parseElement(text: string): string | null {
  return fromCode(text) ?? fromWords(text);
}

/** Listinn síaður eftir leitarorði (heiti á báðum málum, annað heiti eða skammstöfun). Tóm leit → allur listinn. */
export function searchElements(query: string): ElementGroup[] {
  const q = plainText(query);
  if (!q) return ELEMENTS;
  return ELEMENTS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => plainText(i.name).includes(q) || (i.en ? plainText(i.en).includes(q) : false) || (i.also ? plainText(i.also).includes(q) : false) || (i.code ? i.code.toLowerCase().startsWith(q) : false),
    ),
  })).filter((g) => g.items.length > 0);
}

export const GRADES = [1, 2, 3, 4, 5] as const;
export const GRADE_LABEL: Record<number, string> = { 1: "Þarf mikla æfingu", 2: "Óöruggt", 3: "Í lagi", 4: "Gott", 5: "Frábært" };

export type Graded = { label: string; grade?: number };

export type Focus = { label: string; grade: number; count: number };

/** Æfingaáherslur: það sem fékk lægsta einkunn fyrst. Sama heiti oftar en
 *  einu sinni er tekið saman (meðaleinkunn); óeinkunnað og ónefnt er ekki með. */
export function focusList(markers: Graded[]): Focus[] {
  const by = new Map<string, { label: string; sum: number; count: number }>();
  for (const m of markers) {
    const label = m.label.trim();
    if (!label || !m.grade) continue;
    const key = label.toLowerCase();
    const cur = by.get(key) ?? { label, sum: 0, count: 0 };
    cur.sum += m.grade;
    cur.count++;
    by.set(key, cur);
  }
  return [...by.values()]
    .map((x) => ({ label: x.label, grade: Math.round((x.sum / x.count) * 10) / 10, count: x.count }))
    .sort((a, b) => a.grade - b.grade || a.label.localeCompare(b.label, "is"));
}

/** Það sem ætti að leggja áherslu á: einkunn 3 eða lægri. */
export function needsWork(markers: Graded[]): Focus[] {
  return focusList(markers).filter((f) => f.grade <= 3);
}
