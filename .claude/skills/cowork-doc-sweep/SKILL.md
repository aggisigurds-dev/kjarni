---
name: cowork-doc-sweep
description: >
  Orchestrate the Brunahólf / Slökkvitæki multi-agent "teamwork" — Claude (cloud)
  + Cowork on the 3 desktop computers + luna-bridge — to find service-customer
  documents (samningar, úttektarskýrslur, reikningar) scattered across the
  computers, Google Drive, email and dkPlus, and record them into the Supabase
  customer_documents tracker so the per-customer documentation counter fills up.
  Use when (re)running the document sweep, setting up the doc counter, onboarding
  a Cowork machine, or coordinating who-does-what across the agents. Also the
  reference for how the customer database is modelled (customers_base root,
  fyrirtaeki service branch, rekstrarfélög + sites).
---

# Cowork doc-sweep — teamwork playbook

The repeatable setup for finding service-customer documents and counting them.
This is the single source of truth for **who the players are, where everything
lives, and the steps to run it again**.

> Owner: Agnar (aggisigurds@gmail.com). UI/notes in Icelandic. Money ISK.

---

## The players (who does what)

| Agent | Runs on | Reaches | Job |
|---|---|---|---|
| **Claude (this)** | Cloud (web/CLI, ephemeral container) | Supabase (MCP), Google Drive (MCP), GitHub, Miro | Schema + migrations, Drive/email cloud sweep, resolution passes, the repo + board |
| **Cowork** | The user's **3 desktop computers** | Each machine's **local files**; some reach `bokhald@eldklar.is` | Sweep local folders, file finds to Drive, record into `customer_documents` |
| **luna-bridge** | A Windows desktop (scheduled) | Thunderbird mbox, Downloads xlsx/csv | Feeds `email_digest`, `timavera_entries`, `ajour_registrations` (see luna-bridge repo) |

**Key limits:** Claude's cloud sandbox **cannot** read the desktops' local files
and **cannot** curl Supabase directly (egress 403) — it only reaches the DB via
the Supabase MCP tool, during a turn. So **no autonomous timers** here: progress
updates are on-demand ("score?"). Cowork must run **on** each machine to read its
files.

---

## Where everything lives

### Supabase (shared by Brunahólf + Slökkvitæki)
- Project `osfdzskyvisifcwyjkuk` (eu-west-1). Access via Supabase MCP.
- Publishable key (also in `js/config.js`): `sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f`
- REST base: `https://osfdzskyvisifcwyjkuk.supabase.co/rest/v1`

### Google Drive (`aggisigurds@gmail.com`) — canonical document home
Drive is a **mesh** of duplicate/empty folders — **ignore the legacy `Brunakerfi`
folders**; file everything into the ONE clean home:

| Folder | ID |
|---|---|
| `Slokkvitæki Master` | `19nroTYoV7_YHgnxZ88yz_lw7_uPUzDzl` |
| └ `Þjónustuskjöl kúnna (MASTER)` | `1cKcu-4L74coPKnzLBHD7NVUHBM6lLh1g` |
| &nbsp;&nbsp;├ `Samningar` | `1boTGJwmEPVeiyt98__Bd-4nytXZGh4Pj` |
| &nbsp;&nbsp;├ `Úttektarskýrslur` | `1olOPuADGowkDXsqaaIPBqtAltvPaYCWi` |
| &nbsp;&nbsp;└ `Reikningar` | `16iJUzelpE8eKUzVvVSGxsZxDFyFjmLoV` |
| Cowork brief doc ("LESTU MIG") | `1T077NZKHLZhejITz-jNxOUdGHu87oWrlc6y16ncE4es` |

### Miro Verkborð (decisions + roadmap)
- Ákvarðanir & svör: https://miro.com/app/board/uXjVHJhT9t8=/
- Roadmap & Projects: https://miro.com/app/board/uXjVHJgEtV0=/

### Per-computer access map (fill in as machines come online)
| Computer | `source` tag | Reaches `bokhald@eldklar.is`? | Notes |
|---|---|---|---|
| 1 | `computer-1` | ? | |
| 2 | `computer-2` | ? | |
| 3 | `computer-3` | ? | |

---

## The data model (customer database)

- **`customers_base`** = the single identity root. **One row per kennitala**
  (0 dups). Owns identity only (nafn, kt, contact).
- **`fyrirtaeki`** = the **rich service branch** (*fyrirtæki í þjónustu*). Per
  service-entry rows with `er_i_thjonustu`, `status`, `customer_base_id` → root.
  Each row shows by its own name in the service lists.
- **`vidskiptavinir`** = regular/cash customers → fold into the root.
- **Rekstrarfélag** = one paying company (one kt, one `customers_base` row) with
  **many sites** in **`customer_worksite_map`** (`base_id` → root). Example:
  Center Hotels = base 146, kt `450905-1430`, 9 hotel sites; Colas = base 52, 3 sites.
- **Service type** = `thjonustusamningar.thjonusta` — `'Brunakerfi'` (fire-alarm
  system) vs `'Slökkvitæki'` (extinguishers) vs `'Árleg þjónusta'`. A property can
  have one or both. **Don't assume all sites are Brunakerfi** — confirm per site.

### The documentation tracker
- **`customer_documents`** (`doc_type` samningur|uttektarskyrsla|reikningur,
  `year`, `drive_file_id`, `source`, `amount`, `found_by`, `notes`,
  `customer_base_id`). samningur = one-time (no year); úttekt + reikningur = one
  per year. Dedup unique on `drive_file_id`.
- **`customer_doc_status`** view = per-customer rollup (`has_samningur`,
  `uttektir`, `reikningar`, `total_docs`) → the "least-documented" sort.
- Expected per service customer: **1 samningur + 1 úttektarskýrsla/yr + 1 reikningur/yr**
  (signup year → current). See `docs/customer-documents.md` + `docs/customer-db.md`.

---

## Run it again — steps

1. **Schema** (additive, safe without backup): ensure `customer_documents` table
   + `customer_doc_status` view exist (migration `customer_documents_tracker`).
2. **Drive home**: ensure the MASTER folder + Samningar/Úttektarskýrslur/Reikningar
   exist (IDs above). Publish/refresh the **LESTU MIG** brief doc in MASTER.
3. **Start Cowork** on each machine → point it at the MASTER folder + LESTU MIG;
   set `SOURCE = computer-1/2/3`. Machines with mailbox access also sweep
   `bokhald@eldklar.is` → **Sent** for reikningar.
4. **Claude takes the cloud side**: sweep Google Drive (incl. legacy folders) +
   email; record finds with `source='gdrive'`/`'email'`, `customer_base_id` null
   when unsure (put the name in `notes`).
5. **Resolution pass**: map unresolved docs → `customers_base` by name/address.
   **Watch for rekstrarfélög** (many addresses, one kt — e.g. Center Hotels):
   map all their docs to the one base row; create sites in
   `customer_worksite_map`; flag service rows in `fyrirtaeki`. **Never blind-delete**
   unresolved/orphan rows (the ICS/Hjallabraut lesson) — mark for review.
6. **Counter**: read `customer_doc_status` for progress; on-demand updates only.

## Gates
- **Additive writes** (new tables/rows: `customer_documents`, sites, service
  flags) are fine without a backup.
- **Destructive steps** (demote/drop/delete, customer-DB unification) require:
  Supabase **backup first** + Agnar's go-ahead + Cowork read-only confirmation.
  No `backup_2026*` snapshot exists yet.

## Cowork brief (paste per machine)
The authoritative copy is the **LESTU MIG** doc in the MASTER folder. It contains
the doc types, the Drive folder IDs, the Supabase URL+key, the resolve+insert
recipe, and the `source` tag. Update that doc rather than scattering copies.
