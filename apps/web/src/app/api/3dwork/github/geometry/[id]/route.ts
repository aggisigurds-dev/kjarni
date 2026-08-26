import { NextResponse } from 'next/server';
import { readConnection, readGeometry, writeGeometry } from '@/lib/3dwork/github-server';

const MAX_BYTES = 4_000_000;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const connection = await readConnection();
  if (!connection) {
    return NextResponse.json({ error: 'GitHub is not connected.' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const soup = await readGeometry(connection, id);
    if (!soup) return new NextResponse(null, { status: 404 });
    return new NextResponse(soup.slice().buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load mesh.' },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const connection = await readConnection();
  if (!connection) {
    return NextResponse.json({ error: 'GitHub is not connected.' }, { status: 401 });
  }

  const { id } = await context.params;
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Mesh is too large to sync through GitHub in one piece. It stays on this computer.' },
      { status: 413 }
    );
  }
  if (buffer.byteLength % 4 !== 0) {
    return NextResponse.json({ error: 'Mesh payload is not float32 data.' }, { status: 400 });
  }

  try {
    const soup = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    await writeGeometry(connection, id, soup);
    return NextResponse.json({ ok: true, bytes: buffer.byteLength });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save mesh.' },
      { status: 502 }
    );
  }
}
