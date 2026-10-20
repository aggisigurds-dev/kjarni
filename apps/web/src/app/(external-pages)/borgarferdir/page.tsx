import type { Metadata } from 'next';
import { CityTripPlanner } from './city-trip-planner';

export const metadata: Metadata = {
  title: 'City trips from Keflavík',
  description:
    'Flight search and package trips from Keflavík to Manchester and Glasgow for 3 adults and a child, with bags, hotel samples and live-search links.',
};

export default function BorgarferdirPage() {
  return <CityTripPlanner />;
}
