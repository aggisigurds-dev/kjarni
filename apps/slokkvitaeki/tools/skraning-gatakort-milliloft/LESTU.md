# Milliloftspunktar á hringtákn frárennslis (18.11.2026)

Færir milliloftsþéttingar (flokkar „Gólf …") á hringtáknin á grænu frárennslislögnunum í laginu „Vatnslagnir í lit" (M115).
Hringtáknið er þar sem lögnin fer í gegnum gólfið. Agnar færði 86 punkta á 5H S1 í höndunum; þær færslur eru prófunarsettið.

Skrárnar eru afrit úr lotumöppu og reikna með þessari uppröðun við hliðina á sér:

- `../flisar/M115/<dálkur>_<röð>.png` — 4x flísar lagsins (`skr_log.flisar`, 1930 x 1900, 12 x 6)
- lyklar úr `C:/Users/Slokkvitaeki/luna-bridge/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

Röð:

1. `python gogn.py` — sækir milliloftspunkta 5H/4H með hæðarhnitum og færslum → `gogn.json`
2. `python hringir4.py` — finnur hringtákn (lokaðir hringir á grænum og dökkgrænum lögnum, rofnir hringir lokaðir) → `hringir.json`
3. `python para.py 60` — prófar pörun á handfærslum og þurrkeyrir
4. `python faera.py [--write]` — skrifar AÐEINS öruggar færslur í `skr_faerslur` (uppruni `sjalfvirkt`)

Regla öruggrar færslu: einn punktur á hring (lágmarksheildarfjarlægð innan 60 px), hringurinn er næsti hringur við punktinn,
færsla 1–30 px, næsti hringur sem er ekki tvíburi a.m.k. 15 px fjær. Prófað á handfærslunum: 45 af 46 sami hringur og Agnar valdi.

Þekkt takmörk:

- Grænar frárennslislagnir vantar í lagið á stórum svæðum í hægra húsi (S4/S5); þar finnst enginn hringur.
- 4H S1/S2 (skannað blað, teikning 10) er sleppt: vörpunin er of ónákvæm.
- `skraning-gatakort-skr-festa.cjs` snertir ekki þessar færslur (síar á hópa sem það ræður yfir).
