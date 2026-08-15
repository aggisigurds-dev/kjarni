"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbSelect } from "../lib/supabase";

type Skjal = { id: number; heiti: string; slod: string; url: string; stord: number; tegund: string; mappa: string; buid_til: string };

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const BUCKET = "skjalarinn";

const fmtSize = (b: number) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : b + " B");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric" });
const safeName = (s: string) => s.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-90);
function icon(t: string, heiti: string) {
  const e = (heiti.split(".").pop() || "").toLowerCase();
  if (t.includes("pdf") || e === "pdf") return "📄";
  if (t.startsWith("image") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "🖼️";
  if (["doc", "docx"].includes(e) || t.includes("word")) return "📝";
  if (["xls", "xlsx", "csv"].includes(e) || t.includes("sheet")) return "📊";
  if (["zip", "rar", "7z"].includes(e)) return "🗜️";
  return "📎";
}

export default function SkjalarinnClient() {
  const [files, setFiles] = useState<Skjal[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "name" | "size">("new");
  const [folder, setFolder] = useState<string>("__all");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState("");
  const [drag, setDrag] = useState(false);
  const [editing, setEditing] = useState<Skjal | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const rows = await sbSelect<Skjal[]>("kjarni_skjol?select=*&order=buid_til.desc").catch(() => []);
    setFiles(Array.isArray(rows) ? rows : []);
  }
  useEffect(() => { load(); }, []);

  async function uploadFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    setBusy(true);
    let done = 0;
    for (const f of arr) {
      setProg(`Hleð upp ${++done}/${arr.length}…`);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(f.name)}`;
      try {
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
          method: "POST",
          headers: { ...H, "Content-Type": f.type || "application/octet-stream", "x-upsert": "true" },
          body: f,
        });
        if (!up.ok) continue;
        const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
        await fetch(`${SUPABASE_URL}/rest/v1/kjarni_skjol`, {
          method: "POST",
          headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ heiti: f.name, slod: path, url, stord: f.size, tegund: f.type || "", mappa: folder === "__all" ? "Almennt" : folder }),
        });
      } catch {}
    }
    setProg("");
    setBusy(false);
    await load();
  }

  async function saveEdit(heiti: string, mappa: string) {
    if (!editing) return;
    setFiles((fs) => fs.map((x) => (x.id === editing.id ? { ...x, heiti, mappa } : x)));
    setEditing(null);
    await fetch(`${SUPABASE_URL}/rest/v1/kjarni_skjol?id=eq.${editing.id}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ heiti, mappa: mappa || "Almennt" }),
    }).catch(() => {});
  }
  async function del(f: Skjal) {
    setFiles((fs) => fs.filter((x) => x.id !== f.id));
    await fetch(`${SUPABASE_URL}/rest/v1/kjarni_skjol?id=eq.${f.id}`, { method: "DELETE", headers: H }).catch(() => {});
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(f.slod)}`, { method: "DELETE", headers: H }).catch(() => {});
  }

  const folders = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of files) m[f.mappa || "Almennt"] = (m[f.mappa || "Almennt"] || 0) + 1;
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = files.filter((f) => (folder === "__all" || f.mappa === folder) && (!s || f.heiti.toLowerCase().includes(s)));
    if (sort === "name") list = [...list].sort((a, b) => a.heiti.localeCompare(b.heiti));
    else if (sort === "size") list = [...list].sort((a, b) => b.stord - a.stord);
    return list;
  }, [files, q, folder, sort]);

  const totalSize = files.reduce((s, f) => s + (f.stord || 0), 0);

  return (
    <div className="sk">
      <header className="sk-top">
        <div className="sk-brand"><span className="sk-logo">🗂️</span><div><b>Skjalarinn</b><small>skjöl · pdf · skrár</small></div></div>
        <a className="sk-home" href="/kjarni">Stjórnstöð →</a>
      </header>

      <div className="sk-main">
        <aside className="sk-side">
          <button className="sk-up" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? prog || "Hleð upp…" : "↑ Hlaða upp"}</button>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }} />
          <div className="sk-folders">
            <button className={folder === "__all" ? "on" : ""} onClick={() => setFolder("__all")}><span>Öll skjöl</span><em>{files.length}</em></button>
            {folders.map(([f, n]) => (
              <button key={f} className={folder === f ? "on" : ""} onClick={() => setFolder(f)}><span>{f}</span><em>{n}</em></button>
            ))}
          </div>
          <div className="sk-stat">{files.length} skjöl · {fmtSize(totalSize)}</div>
        </aside>

        <section
          className={`sk-content ${drag ? "drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files); }}
        >
          <div className="sk-tools">
            <input className="sk-search" placeholder="Leita í skjölum…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="sk-seg">
              {(["new", "name", "size"] as const).map((s) => (
                <button key={s} className={sort === s ? "on" : ""} onClick={() => setSort(s)}>{s === "new" ? "Nýjast" : s === "name" ? "Nafn" : "Stærð"}</button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="sk-empty">
              <span>🗂️</span>
              <p>{files.length === 0 ? "Engin skjöl enn — dragðu skrár hingað eða smelltu á „Hlaða upp“." : "Ekkert skjal fannst."}</p>
            </div>
          ) : (
            <div className="sk-grid">
              {shown.map((f) => (
                <article className="sk-file" key={f.id}>
                  <a className="sk-file-ico" href={f.url} target="_blank" rel="noreferrer">{icon(f.tegund, f.heiti)}</a>
                  <div className="sk-file-b">
                    <a className="sk-file-nafn" href={f.url} target="_blank" rel="noreferrer" title={f.heiti}>{f.heiti}</a>
                    <span className="sk-file-meta">{fmtSize(f.stord)} · {fmtDate(f.buid_til)}</span>
                    <span className="sk-file-mappa">{f.mappa}</span>
                  </div>
                  <div className="sk-file-act">
                    <button onClick={() => setEditing(f)} aria-label="Breyta">✏️</button>
                    <button onClick={() => del(f)} aria-label="Eyða">🗑️</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {drag && <div className="sk-drop">Slepptu til að hlaða upp</div>}
        </section>
      </div>

      {editing && (
        <div className="sk-modal-wrap" onClick={() => setEditing(null)}>
          <div className="sk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sk-modal-h"><h2>Skjal</h2><button className="sk-x" onClick={() => setEditing(null)}>✕</button></div>
            <EditForm f={editing} folders={folders.map((x) => x[0])} onSave={saveEdit} />
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({ f, folders, onSave }: { f: Skjal; folders: string[]; onSave: (heiti: string, mappa: string) => void }) {
  const [heiti, setHeiti] = useState(f.heiti);
  const [mappa, setMappa] = useState(f.mappa);
  return (
    <form className="sk-form" onSubmit={(e) => { e.preventDefault(); onSave(heiti.trim() || f.heiti, mappa.trim()); }}>
      <label>Heiti<input value={heiti} onChange={(e) => setHeiti(e.target.value)} /></label>
      <label>Mappa
        <input list="sk-folders" value={mappa} onChange={(e) => setMappa(e.target.value)} placeholder="Almennt" />
        <datalist id="sk-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      <div className="sk-form-btns">
        <a className="sk-open" href={f.url} target="_blank" rel="noreferrer">Opna skjal ↗</a>
        <button className="sk-btn" type="submit">Vista</button>
      </div>
    </form>
  );
}
