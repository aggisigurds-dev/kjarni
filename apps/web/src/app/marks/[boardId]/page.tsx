import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MARKS_BOARD_ID, isMarksBoardId } from '@/lib/marks/model';
import { MarksBoard } from '../board';

export const metadata: Metadata = {
  title: 'Marks — site',
  description: 'A clean Marks site for a different topic.',
};

export default async function MarksSitePage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  if (!isMarksBoardId(boardId) || boardId === MARKS_BOARD_ID) {
    redirect('/marks');
  }
  return (
    <Suspense fallback={null}>
      <MarksBoard key={boardId} boardId={boardId} />
    </Suspense>
  );
}
