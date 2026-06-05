'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(token ? '/dashboard' : '/login');
    }
  }, [loading, token, router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <span className="text-zinc-500 animate-pulse text-sm font-semibold tracking-wider">
        INITIALIZING...
      </span>
    </div>
  );
}
