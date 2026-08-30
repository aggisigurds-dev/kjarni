import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MarksBoard } from './board';

export const metadata: Metadata = {
  title: 'Marks — kjarni bookmarks',
  description: 'Frontpage bookmark organizer. Folders, links, and buttons follow you to your phone.',
};

export default function MarksPage() {
  return (
    <Suspense fallback={null}>
      <MarksBoard />
    </Suspense>
  );
}
