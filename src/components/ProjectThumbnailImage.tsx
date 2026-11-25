'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import type { PortfolioProject } from '@/lib/portfolio/types';
import { getProjectThumbnailSources } from '@/lib/portfolio/thumbnail';

export default function ProjectThumbnailImage({
  project,
  sizes,
  fallback,
}: {
  project: Pick<PortfolioProject, 'id' | 'thumbnail_path' | 'youtube_id' | 'original_url'>;
  sizes: string;
  fallback: ReactNode;
}) {
  const sources = getProjectThumbnailSources(project);
  const sourceKey = `${project.id}:${sources.custom ?? ''}:${sources.youtube ?? ''}`;
  const [failed, setFailed] = useState<{ key: string; sources: string[] }>({ key: '', sources: [] });
  const failedSources = failed.key === sourceKey ? failed.sources : [];
  const source = [sources.custom, sources.youtube]
    .find((candidate) => candidate && !failedSources.includes(candidate)) ?? null;

  if (!source) return fallback;
  return (
    <Image
      src={source}
      alt=""
      fill
      unoptimized={source.startsWith('https://')}
      sizes={sizes}
      onError={() => {
        setFailed({
          key: sourceKey,
          sources: [...failedSources, source],
        });
      }}
    />
  );
}
