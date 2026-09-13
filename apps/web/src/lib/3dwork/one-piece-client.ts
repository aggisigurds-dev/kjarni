/**
 * The bench's handle on the one-piece worker.
 *
 * Every job gets a fresh worker, terminated as soon as it answers. Loading the
 * kernel again costs a fraction of a second against a job that takes many; in
 * exchange a job that crashed the kernel, or a failed repair attempt that left
 * memory behind, can never slow down or break the next one. A job stopped half
 * way goes the same way: its worker is thrown away with whatever it was doing.
 */

import type { OnePieceJob, OnePieceReply, OnePieceRequest, OnePieceResult } from './one-piece';

let nextId = 1;

/** What a stopped job rejects with, so stopping can be told apart from failing. */
export class OnePieceStopped extends Error {
  constructor() {
    super('Stopped before it finished. Nothing was changed.');
    this.name = 'OnePieceStopped';
  }
}

/**
 * Join, bore and clean up in a worker of its own.
 *
 * The body and cutter soups are handed over, not copied — pass freshly baked copies, never
 * the bench's own meshes, because a transferred buffer is gone from this side.
 * Aborting `signal` ends the worker at once, even in the middle of a kernel call.
 */
export function runOnePiece(
  job: OnePieceJob,
  onProgress?: (label: string) => void,
  signal?: AbortSignal
): Promise<OnePieceResult> {
  const id = nextId++;
  const request: OnePieceRequest = { ...job, id };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OnePieceStopped());
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./one-piece.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const finish = () => {
      signal?.removeEventListener('abort', stop);
      worker.terminate();
    };
    const stop = () => {
      finish();
      reject(new OnePieceStopped());
    };
    signal?.addEventListener('abort', stop, { once: true });

    worker.onmessage = (event: MessageEvent<OnePieceReply>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === 'progress') {
        onProgress?.(message.label);
        return;
      }
      finish();
      if (message.type === 'done') resolve(message.result);
      else reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(event.message || 'The solid kernel stopped unexpectedly.'));
    };

    try {
      const buffers = new Set(
        [...job.bodies, ...(job.cutters ?? [])].map((part) => part.soup.buffer as ArrayBuffer)
      );
      worker.postMessage(request, [...buffers]);
    } catch (error) {
      finish();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
