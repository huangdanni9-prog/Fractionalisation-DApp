import React from 'react';

export default function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
      <div className="bg-gray-200 h-40 w-full" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-5/6" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
      <div className="bg-violet-200 h-10" />
    </div>
  );
}
