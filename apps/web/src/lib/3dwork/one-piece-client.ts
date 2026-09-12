/**
 * The bench's handle on the one-piece worker.
 *
 * Every job gets a fresh worker, terminated as soon as it answers. Loading the
 * kernel again costs a fraction of a second against a job that takes many; in
 * exchange a job that crashed the kernel, or a failed repair attempt that left
 * memory behind, can never slow down or break the next one.
 */

import type { OnePieceJob, OnePieceReply, OnePieceRequest, OnePieceResult } from './one-piece';

let nextId = 1;

/**
 * Join, bore and clean up in a worker of its own.
 *
 * The body and cutter soups are handed over, not copied — pass freshly baked copies, never
 * the bench's own meshes, because a transferred buffer is gone from this side.
 */
export function runOnePiece(
  job: OnePieceJob,
  onProgress?: (label: string) => void
): Promise<OnePieceResult> {
  const id = nextId++;
  const request: OnePieceRequest = { ...job, id };

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./one-piece.worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    worker.onmessage = (event: MessageEvent<OnePieceReply>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === 'progress') {
        onProgress?.(message.label);
        return;
      }
      worker.terminate();
      if (message.type === 'done') resolve(message.result);
      else reject(new Error(message.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error(event.message || 'The solid kernel stopped unexpectedly.'));
    };

    try {
      const buffers = new Set(
        [...job.bodies, ...(job.cutters ?? [])].map((part) => part.soup.buffer as ArrayBuffer)
      );
      worker.postMessage(request, [...buffers]);
    } catch (error) {
      worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
