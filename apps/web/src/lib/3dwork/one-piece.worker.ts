/**
 * One one-piece job, off the page's thread.
 *
 * Loading the kernel and cutting a half-million-triangle receiver takes
 * seconds. On the page's own thread that would freeze the table — and the
 * spinner that is meant to say the bench is working. The client starts a fresh
 * worker for every job and discards it afterwards, so a kernel that crashed or
 * held on to memory during one job can never touch the next.
 */

import Module from 'manifold-3d';
import { makeOnePiece, type OnePieceReply, type OnePieceRequest } from './one-piece';

function reply(message: OnePieceReply, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

self.onmessage = async (event: MessageEvent<OnePieceRequest>) => {
  const { id, ...job } = event.data;
  try {
    reply({ id, type: 'progress', label: 'Loading the solid kernel…' });
    const wasm = await Module();
    wasm.setup();
    const result = makeOnePiece(wasm, job, (label) => reply({ id, type: 'progress', label }));
    reply({ id, type: 'done', result }, [result.soup.buffer as ArrayBuffer]);
  } catch (error) {
    reply({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
