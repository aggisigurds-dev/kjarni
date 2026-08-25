import { NextResponse } from 'next/server';
import type { Project } from '@/lib/3dwork/project';
import {
  publicStatus,
  readConnection,
  readIndex,
  writeIndex,
  writeManifest,
  writeProject,
} from '@/lib/3dwork/github-server';
import { upsertIndex, type CloudManifest } from '@/lib/3dwork/github-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connection = await readConnection();
  if (!connection) {
    return NextResponse.json({ ...publicStatus(null), projects: [] });
  }
  try {
    const projects = await readIndex(connection);
    return NextResponse.json({ ...publicStatus(connection), projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not list GitHub projects.' },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request) {
  const connection = await readConnection();
  if (!connection) {
    return NextResponse.json({ error: 'GitHub is not connected.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      project?: Project;
      manifest?: CloudManifest;
    };
    if (!body.project?.id) {
      return NextResponse.json({ error: 'Missing project.' }, { status: 400 });
    }

    const project: Project = { ...body.project, updatedAt: Date.now() };
    await writeProject(connection, project.id, project);
    if (body.manifest) await writeManifest(connection, project.id, body.manifest);

    const index = upsertIndex(await readIndex(connection), {
      id: project.id,
      name: project.name,
      parts: project.parts.length,
      updatedAt: project.updatedAt,
    });
    await writeIndex(connection, index);

    return NextResponse.json({ ok: true, updatedAt: project.updatedAt, repo: `${connection.owner}/${connection.repo}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save to GitHub.' },
      { status: 502 }
    );
  }
}
