import type { Metadata } from 'next';
import { ManchesterPlanner } from './manchester-planner';

export const metadata: Metadata = {
  title: 'Manchester trip deals',
  description:
    'Compare easyJet and Icelandair from Keflavík to Manchester for 3 adults and a child, with bags, hotel and live-search links.',
};

export default function ManchesterPage() {
  return <ManchesterPlanner />;
}
