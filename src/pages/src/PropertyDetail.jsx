import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import HeroGallery from './components/HeroGallery';
import PriceChart from './components/PriceChart';
import KPIChips from './components/KPIChips';
import DocumentsAccordion from './components/DocumentsAccordion';
import PriceCard from './components/PriceCard';
import AppHeader from './components/AppHeader';
import { web3Client } from './web3/client';

const BG = '#050721';

function useProperty(propertyId) {
  return useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      await web3Client.connect();
      const arr = await web3Client.getProperties(0, 50);
      const hit = arr.find((p) => String(p.id) === String(propertyId));
      if (hit) return hit;
      // Fallback to local metadata
      const local = JSON.parse(localStorage.getItem('properties') || '[]');
      return local.find((p) => String(p.id) === String(propertyId));
    },
    staleTime: 60_000,
  });
}

export default function PropertyDetail() {
  const { id } = useParams();
  const { data: prop, isLoading } = useProperty(id);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    setUser(userStr ? JSON.parse(userStr) : null);
  }, []);

  const images = useMemo(() => {
    const img = prop?.image;
    if (img) return [img];
    // Generate placeholder images if none provided
    const seed = Number(prop?.id || 1) % 10;
    return [
      `https://picsum.photos/seed/${seed + 1}/1200/800`,
      `https://picsum.photos/seed/${seed + 2}/1200/800`,
      `https://picsum.photos/seed/${seed + 3}/1200/800`,
    ];
  }, [prop?.image, prop?.id]);

  const docs = [
    { title: 'Operating Agreement', href: '#' },
    { title: 'Offering Circular', href: '#' },
    { title: 'Property Inspection Report', href: '#' },
  ];

  const kpis = [
    { label: 'Occupancy', value: '98%' },
    { label: 'Cap Rate', value: '6.1%' },
    { label: 'Units', value: '12' },
  ];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <AppHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 pb-10">
        <div className="pt-4">
          <HeroGallery images={images} alt={`${prop?.title || 'Property'} gallery`} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <header className="mb-4">
              <div className="inline-flex items-center rounded-full border border-white/20 px-3 py-1 text-sm text-white/80">
                {prop?.active ? 'Active' : 'Coming Soon'}
              </div>
              <h1 className="mt-3 text-4xl font-bold text-white">{prop?.title || `Property #${id}`}</h1>
              <p className="text-white/70">{prop?.address || '—'}</p>
              <a href="#reviews" className="mt-2 inline-block text-sm text-white underline underline-offset-4">Co-Owner Reviews</a>
              <KPIChips items={kpis} />
            </header>

            <div className="rounded-2xl bg-white/5 p-4">
              <PriceChart propertyId={id} />
            </div>

            <DocumentsAccordion docs={docs} />
          </div>
          <div className="lg:col-span-1">
            {!isLoading && prop && (
              <PriceCard property={prop} onSuccess={() => { /* noop: could refetch */ }} />
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link to="/marketplace" className="text-white/70 underline">Back to Marketplace</Link>
        </div>
      </main>
    </div>
  );
}
