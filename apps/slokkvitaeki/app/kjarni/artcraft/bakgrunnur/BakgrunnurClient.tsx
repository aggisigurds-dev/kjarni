"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StationChrome } from "../../StationChrome";
import { artcraftAppHref, artcraftBakgrunnurHref, artcraftHubHref, artcraftToolsHref } from "../apps";
import { artcraftBakgrunnurWhiteHref } from "../tol";
import "../artcraft.css";
import { PRODUCTS } from "../../../verslun/products";
import {
  PRODUCT_IMAGE_ACCEPT,
  cutoutFilename,
  isProductImageFile,
  isWhiteBackground,
  processProductImage,
} from "./cut";

type Job = {
  id: string;
  name: string;
  sourceUrl: string;
  resultUrl?: string;
  status: "wait" | "run" | "ok" | "err";
  error?: string;
};

const SAMPLES = PRODUCTS.filter((p) => p.img).slice(0, 4);

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function BakgrunnurClient() {
  const white = isWhiteBackground(useSearchParams().get("botn"));
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [drag, setDrag] = useState(false);

  async function runJobs(next: Job[]) {
    if (next.length === 0) return;
    setJobs((cur) => [...cur, ...next]);
    setBusy(true);
    for (const job of next) {
      setJobs((cur) => cur.map((row) => (row.id === job.id ? { ...row, status: "run" } : row)));
      setProgress(white ? `Set ${job.name} á hvítt…` : `Tek bakgrunn af ${job.name}…`);
      try {
        const blob = await processProductImage(job.sourceUrl, {
          white,
          onProgress: (info) => {
            if (info.total > 0) {
              setProgress(`Hleð líkani ${Math.round((info.current / info.total) * 100)}%`);
            }
          },
        });
        const resultUrl = URL.createObjectURL(blob);
        setJobs((cur) =>
          cur.map((row) => (row.id === job.id ? { ...row, status: "ok", resultUrl } : row)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Gat ekki tekið bakgrunn";
        setJobs((cur) =>
          cur.map((row) => (row.id === job.id ? { ...row, status: "err", error: message } : row)),
        );
      }
    }
    setProgress("");
    setBusy(false);
  }

  async function addFiles(files: FileList | File[]) {
    const accepted = [...files].filter(isProductImageFile);
    const next = accepted.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      name: file.name,
      sourceUrl: URL.createObjectURL(file),
      status: "wait" as const,
    }));
    await runJobs(next);
  }

  async function addSample(src: string, name: string) {
    await runJobs([
      {
        id: `${src}-${Date.now()}`,
        name,
        sourceUrl: src,
        status: "wait",
      },
    ]);
  }

  const done = jobs.filter((job) => job.status === "ok" && job.resultUrl);

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {white ? " · Á hvítan bakgrunn" : " · Bakgrunnur"}
          </p>
          <h1>{white ? "Á hvítan bakgrunn" : "Fjarlægja bakgrunn"}</h1>
          <p className="ac-lead">
            {white
              ? "Slepptu vörumyndum. Veggur, borð og skuggi fara, svo varan situr á hreinu hvítu — tilbúið í verslun. Skrárnar fara ekki í skýið."
              : "Slepptu vörumyndum — veggur, borð og skuggi hverfa. Útkoman er PNG með gegnsæjum bakgrunni. Skrárnar fara ekki í skýið."}
          </p>

          <div className="ac-modes" role="tablist" aria-label="Bakgrunnshamur">
            <a
              href={artcraftBakgrunnurHref()}
              className={!white ? "on" : undefined}
              aria-current={!white ? "page" : undefined}
            >
              Gegnsætt
            </a>
            <a
              href={artcraftBakgrunnurWhiteHref()}
              className={white ? "on" : undefined}
              aria-current={white ? "page" : undefined}
            >
              Á hvítu
            </a>
          </div>

          <section
            className={`ac-drop ${drag ? "on" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
            }}
          >
            <p>Slepptu myndum hér, eða</p>
            <button
              type="button"
              className="ac-btn"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Velja vörumyndir
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={PRODUCT_IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </section>

          <section className="ac-panel">
            <h2>Prufa á vörum úr versluninni</h2>
            <p className="ac-hint">Sömu slökkvitæki og á verslunarsíðunni — smelltu og bakgrunnurinn fer.</p>
            <div className="ac-samples">
              {SAMPLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ac-sample"
                  disabled={busy}
                  onClick={() => void addSample(item.img!, `${item.name}.jpg`)}
                >
                  <img src={item.img} alt="" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </section>

          {progress && <p className="ac-status">{progress}</p>}

          {jobs.length > 0 && (
            <section className="ac-panel">
              <div className="ac-row" style={{ justifyContent: "space-between" }}>
                <h2>Útkoma</h2>
                {done.length > 0 && (
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => {
                      done.forEach((job) =>
                        downloadBlob(job.resultUrl!, cutoutFilename(job.name, white)),
                      );
                    }}
                  >
                    Sækja allar PNG
                  </button>
                )}
              </div>
              <div className="ac-cuts">
                {jobs.map((job) => (
                  <article key={job.id} className="ac-cut">
                    <div className="ac-cut-pair">
                      <figure>
                        <img src={job.sourceUrl} alt={`Fyrir: ${job.name}`} />
                        <figcaption>Fyrir</figcaption>
                      </figure>
                      <figure className={white ? "ac-cut-out ac-cut-white" : "ac-cut-out"}>
                        {job.resultUrl ? (
                          <img src={job.resultUrl} alt={`Eftir: ${job.name}`} />
                        ) : (
                          <p>
                            {job.status === "err"
                              ? job.error
                              : job.status === "run"
                                ? white
                                  ? "Set á hvítt…"
                                  : "Tek bakgrunn…"
                                : "Í röð"}
                          </p>
                        )}
                        <figcaption>{white ? "Á hvítu" : "Eftir"}</figcaption>
                      </figure>
                    </div>
                    {job.resultUrl && (
                      <div className="ac-cut-actions">
                        <button
                          type="button"
                          className="ac-btn"
                          onClick={() =>
                            downloadBlob(job.resultUrl!, cutoutFilename(job.name, white))
                          }
                        >
                          Sækja PNG
                        </button>
                        <a className="ac-btn ghost" href={artcraftAppHref("photocraft")}>
                          Opna PhotoCraft
                        </a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
