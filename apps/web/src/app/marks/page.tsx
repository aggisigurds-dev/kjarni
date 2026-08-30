import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MarksBoard } from './board';

export const metadata: Metadata = {
  title: 'Marks — kjarni bookmarks',
  description: 'Whiteboard bookmark organizer. Folders, covers, tags — same board on your phone.',
};

export default function MarksPage() {
  return (
    <Suspense fallback={null}>
      <MarksBoard />
    </Suspense>
  );
}
