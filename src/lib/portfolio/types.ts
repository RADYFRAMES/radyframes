export type VideoKind = 'short' | 'video' | null;
export type ProjectStatus = 'pending_review' | 'approved' | 'rejected' | 'draft' | 'published' | 'archived';
export type VideoRatio = '16:9' | '1:1' | '4:5' | '9:16' | null;

export interface VideoAdoption {
  id: string;
  ratio: Exclude<VideoRatio, null>;
  source_url: string;
}

export interface PortfolioProject {
  id: string;
  youtube_id: string | null;
  thumbnail_path?: string | null;
  original_url: string;
  kind: VideoKind;
  category_id: string | null;
  category: string | null;
  import_batch_id?: string | null;
  topic: string | null;
  client: string | null;
  title: string | null;
  description: string | null;
  ratio_raw: string | null;
  ratio: VideoRatio;
  status: ProjectStatus;
  sort_order?: number;
  adoption_versions?: VideoAdoption[];
  local_preview?: boolean;
  metadata_conflict?: boolean;
}

export interface PortfolioCategory {
  id: string;
  name: string;
  slug: string;
}
