'use client';

/**
 * The builds worked on lately, newest first, as cards with pictures of their
 * parts — so the start page shows recent work to pick up again, not an empty
 * folder browser.
 *
 * What this computer has shows at once; Supabase fills in builds made
 * elsewhere a moment later. Pictures come from this computer's copies, drawn
 * the first time a build is opened here; one never opened here shows its part
 * names instead.
 *
 * Each card can be renamed, and saved as a copy under a new name — the
 * "Vista sem…" that leaves the build as it is, to go back to.
 */

import { useCallback, useEffect, useState } from 'react';
import { Boxes, Clock, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { bumpVersionName, copyBuild, failureNote } from '@/lib/3dwork/parts-library';
import type { Part, Project } from '@/lib/3dwork/project';
import {
  buildLabel,
  cleanPartName,
  cloudIsNewer,
  mergeProjectLists,
  sinceLabel,
  type ProjectListEntry,
} from '@/lib/3dwork/project-sync';
import { listProjects, loadGeometry, saveGeometry, saveProject } from '@/lib/3dwork/storage';
import {
  listCloudProjects,
  loadCloudGeometry,
  loadFromCloud,
  renameCloudBuild,
  saveToCloud,
} from '@/lib/3dwork/supabase-sync';
import { NameDialog } from './name-dialog';
import { LABEL } from './ui';

/** A build with every mesh it refers to: this computer's copy, or Supabase's when that is newer or the only one. */
async function loadBuild(entry: ProjectListEntry): Promise<{ project: Project; geometries: Map<string, Float32Array> }> {
  const here = (await listProjects()).find((project) => project.id === entry.id);
  if (!here || (entry.cloud && cloudIsNewer(here.updatedAt, entry.updatedAt))) return loadFromCloud(entry.id);
  const geometries = new Map<string, Float32Array>();
  const pending: Part[] = [...here.parts];
  for (let index = 0; index < pending.length; index++) {
    const part = pending[index];
    for (const version of part.versions ?? []) {
      const soup = (await loadGeometry(version.id)) ?? (entry.cloud ? await loadCloudGeometry(entry.id, version.id) : null);
      if (soup) geometries.set(version.id, soup);
    }
    if (part.group) pending.push(...part.group.members);
  }
  return { project: here, geometries };
}

/** Cards on the start page before the rest wait for the Projects list. */
const SHOWN = 8;

function BuildCard({
  entry,
  onOpen,
  onRename,
  onSaveAs,
}: {
  entry: ProjectListEntry;
  onOpen: () => void;
  onRename: () => void;
  onSaveAs: () => void;
}) {
  const names = (entry.partNames ?? []).map(cleanPartName);
  const pictures = (entry.thumbnails ?? []).slice(0, 3);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition hover:border-emerald-500 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        title={names.join('\n')}
        className="flex min-w-0 flex-1 flex-col text-left"
      >
        <span className="flex h-28 items-stretch gap-px bg-slate-100">
          {pictures.length > 0 ? (
            pictures.map((picture, index) => (
              <span
                key={index}
                className="min-w-0 flex-1 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${picture})` }}
              />
            ))
          ) : (
            <Boxes className="m-auto h-8 w-8 text-slate-300" />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-3">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">
              {buildLabel(entry.name, entry.partNames)}
            </span>
            <span className="shrink-0 font-mono text-[0.65rem] text-slate-400">
              {sinceLabel(entry.updatedAt)}
            </span>
          </span>
          <span className="line-clamp-3 text-[0.7rem] leading-snug text-slate-500 [overflow-wrap:anywhere]">
            {entry.parts} part{entry.parts === 1 ? '' : 's'}
            {names.length > 0 ? `: ${names.join(' · ')}` : ''}
          </span>
          {!entry.cloud && (
            <span className="text-[0.65rem] font-semibold text-amber-600">On this computer only</span>
          )}
        </span>
      </button>
      <span className="flex border-t border-slate-200 text-[0.68rem] font-bold text-slate-500">
        <button
          type="button"
          onClick={onRename}
          className="flex min-h-9 flex-1 items-center justify-center gap-1 hover:bg-slate-50 hover:text-slate-900"
          aria-label={`Endurnefna ${buildLabel(entry.name, entry.partNames)}`}
        >
          <Pencil className="h-3 w-3" />
          Nafn
        </button>
        <button
          type="button"
          onClick={onSaveAs}
          className="flex min-h-9 flex-1 items-center justify-center gap-1 border-l border-slate-200 hover:bg-slate-50 hover:text-slate-900"
          aria-label={`Vista ${buildLabel(entry.name, entry.partNames)} sem afrit`}
        >
          <Copy className="h-3 w-3" />
          Vista sem…
        </button>
      </span>
    </div>
  );
}

export function RecentBuilds({ onOpen }: { onOpen: (entry: ProjectListEntry) => void }) {
  const [entries, setEntries] = useState<ProjectListEntry[] | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  // Bumped after a rename or a copy, so the list is read again.
  const [generation, setGeneration] = useState(0);
  const [naming, setNaming] = useState<{ mode: 'rename' | 'saveas'; entry: ProjectListEntry } | null>(null);
  const [busy, setBusy] = useState(false);

  const rename = useCallback(async (entry: ProjectListEntry, name: string) => {
    setBusy(true);
    try {
      // A new name is not a new edit: both copies keep their stamps, so a
      // rename never makes an older copy win over newer work on the other side.
      // Supabase first, so a failed rename there leaves both names as they were.
      if (entry.cloud) await renameCloudBuild(entry.id, name);
      const here = (await listProjects()).find((project) => project.id === entry.id);
      if (here) await saveProject({ ...here, name }, here.updatedAt);
      setNaming(null);
      setGeneration((value) => value + 1);
      toast.success(`Endurnefnt í „${name}“.`);
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að endurnefna.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const saveAs = useCallback(async (entry: ProjectListEntry, name: string) => {
    setBusy(true);
    try {
      const build = await loadBuild(entry);
      const copy = copyBuild(build.project, name, build.geometries);
      for (const [id, soup] of copy.geometries) await saveGeometry(id, soup);
      await saveProject(copy.project, copy.project.updatedAt);
      try {
        const { updatedAt } = await saveToCloud(copy.project, copy.geometries, copy.project.updatedAt);
        await saveProject(copy.project, updatedAt);
      } catch {
        toast.message('Afritið er á þessari tölvu — það fer á Supabase þegar það er opnað.');
      }
      setNaming(null);
      setGeneration((value) => value + 1);
      toast.success(`Vistað sem „${copy.project.name}“.`);
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að vista afritið.'));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await listProjects();
      const local = saved
        .filter((project) => project.parts.length > 0)
        .map((project) => ({
          id: project.id,
          name: project.name,
          parts: project.parts.length,
          updatedAt: project.updatedAt ?? 0,
          partNames: project.parts.map((part) => part.name),
          thumbnails: project.parts
            .map((part) => part.thumbnail)
            .filter((thumbnail): thumbnail is string => Boolean(thumbnail)),
        }));
      if (cancelled) return;
      setEntries(mergeProjectLists(local, []));
      try {
        const cloud = await listCloudProjects();
        if (!cancelled) setEntries(mergeProjectLists(local, cloud.filter((entry) => entry.parts > 0)));
      } catch {
        if (!cancelled) setCloudFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generation]);

  if (entries === null) {
    return <p className="px-1 py-6 text-sm text-slate-500">Looking for your builds…</p>;
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Clock className="h-4 w-4 text-emerald-600" />
        <h2 className={LABEL}>Recent work</h2>
        {cloudFailed && (
          <span className="text-[0.65rem] text-amber-700">
            Supabase did not answer — showing this computer only.
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="px-1 py-4 text-sm text-slate-500">
          Nothing yet. Open the 3D bench and drop an STL or 3MF on it, or pick parts from Drive below.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {entries.slice(0, SHOWN).map((entry) => (
            <BuildCard
              key={entry.id}
              entry={entry}
              onOpen={() => onOpen(entry)}
              onRename={() => setNaming({ mode: 'rename', entry })}
              onSaveAs={() => setNaming({ mode: 'saveas', entry })}
            />
          ))}
        </div>
      )}
      <NameDialog
        open={naming !== null}
        title={naming?.mode === 'saveas' ? 'Vista verkefnið sem…' : 'Endurnefna verkefnið'}
        hint={
          naming?.mode === 'saveas'
            ? 'Afrit undir nýju nafni. Verkefnið sjálft stendur eins og það er — þangað geturðu farið aftur.'
            : undefined
        }
        defaultName={
          naming
            ? naming.mode === 'saveas'
              ? bumpVersionName(buildLabel(naming.entry.name, naming.entry.partNames))
              : naming.entry.name
            : ''
        }
        confirmLabel={naming?.mode === 'saveas' ? 'Vista sem' : 'Vista nafn'}
        busy={busy}
        onCancel={() => setNaming(null)}
        onConfirm={(name) =>
          naming ? (naming.mode === 'saveas' ? saveAs(naming.entry, name) : rename(naming.entry, name)) : undefined
        }
      />
    </section>
  );
}
