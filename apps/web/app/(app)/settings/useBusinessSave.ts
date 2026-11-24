'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

/** PATCH /business with only the fields one settings form owns (omitted fields stay as they are). */
export function useBusinessSave() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setPending(true);
    setSaved(false);
    const res = await api('PATCH', '/business', patch);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSaved(true);
    refreshData(router);
  }

  return { save, error, saved, pending };
}
