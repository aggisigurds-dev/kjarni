import type { Metadata } from 'next';
import { Workbench } from './workbench';

export const metadata: Metadata = {
  title: '3dwork — STL bench',
  description:
    'Load STL parts, measure them, repair them, and swap variants in and out of a multi-part build.',
};

export default function ThreeDWorkPage() {
  return <Workbench />;
}
