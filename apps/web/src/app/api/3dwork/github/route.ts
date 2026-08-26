import { NextResponse } from 'next/server';
import {
  clearUserConnection,
  connectWithToken,
  connectionCookie,
  publicStatus,
  readConnection,
} from '@/lib/3dwork/github-server';

export async function GET() {
  try {
    const connection = await readConnection();
    return NextResponse.json(publicStatus(connection));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GitHub status failed.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; owner?: string };
    const connection = await connectWithToken(body.token ?? '', body.owner);
    const cookie = connectionCookie({
      token: connection.token,
      owner: connection.owner,
      repo: connection.repo,
      login: connection.login,
    });
    const response = NextResponse.json(publicStatus(connection));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not connect GitHub.' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  await clearUserConnection();
  const response = NextResponse.json(publicStatus(await readConnection()));
  response.cookies.delete('kjarni_3dwork_gh');
  return response;
}
