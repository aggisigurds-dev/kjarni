import { NextResponse } from 'next/server';
import { readConnection, readProject, readManifest } from '@/lib/3dwork/github-server';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const connection = await readConnection();
  if (!connection) {
    return NextResponse.json({ error: 'GitHub is not connected.' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const project = await readProject(connection, id);
    if (!project) {
      return NextResponse.json({ error: 'Project not on GitHub.' }, { status: 404 });
    }
    const manifest = (await readManifest(connection, id)) ?? {};
    return NextResponse.json({ project, manifest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load from GitHub.' },
      { status: 502 }
    );
  }
}
