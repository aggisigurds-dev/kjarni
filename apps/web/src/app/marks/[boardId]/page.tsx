import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MARKS_BOARD_ID, isMarksBoardId } from '@/lib/marks/model';
import { MarksBoard } from '../board';

export const metadata: Metadata = {
  title: 'Marks — site',
  description: 'A clean Marks site for a different topic.',
};

export default function MarksSitePage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <MarksSite params={params} />
    </Suspense>
  );
}

async function MarksSite({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  if (!isMarksBoardId(boardId) || boardId === MARKS_BOARD_ID) {
    redirect('/marks');
  }
  return <MarksBoard key={boardId} boardId={boardId} />;
}
