'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function DashboardRetryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="btn ghost"
      type="button"
      disabled={isPending}
      aria-label={isPending ? 'Retrying dashboard data' : 'Retry dashboard data loading'}
      onClick={() => startTransition(() => router.refresh())}
    >
      {isPending ? 'Retrying...' : 'Retry'}
    </button>
  );
}
