import React from 'react';
import ListingCard from './ListingCard';
import SkeletonCard from './SkeletonCard';

export default function ListingGrid({ properties, loading, onOpen }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {(properties || []).map((p) => (
        <ListingCard key={p.id} p={p} onOpen={onOpen} />
      ))}
    </div>
  );
}
