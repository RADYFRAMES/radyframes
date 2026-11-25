import inventory from '@/data/portfolio-inventory.json';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import InventoryReview, { type InventoryReviewRecord, type InventoryReviewSourceRow } from './InventoryReview';

export const dynamic = 'force-dynamic';

function asSourceRows(video: (typeof inventory.videos)[number]): InventoryReviewSourceRow[] {
  return video.source_rows.map((row) => ({
    sheet: row.source_sheet,
    row: row.source_row_number,
    columns: row.source_data.columns.map((column) => ({ header: column.header, value: column.value })),
  }));
}

export default async function PortfolioReviewPage() {
  const { supabase } = await requireAdmin();
  const ids = inventory.videos.map((video) => video.youtube_id);
  const [projectResult, categoryResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id,youtube_id,category_id,status,ratio,ratio_raw,reviewed_at,import_batch_id')
      .in('youtube_id', ids),
    supabase.from('categories').select('id,name').order('sort_order', { ascending: true }),
  ]);
  if (projectResult.error) {
    const message = projectResult.error.message.toLowerCase();
    const missingReviewMetadata = message.includes('reviewed_at')
      && (projectResult.error.code === '42703'
        || projectResult.error.code === 'PGRST204'
        || message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('could not find'));
    if (missingReviewMetadata) {
      return (
        <>
          <div className="adminPageTitle">
            <div><p className="eyebrow">SUPER ADMIN</p><h1>Inventory review</h1></div>
            <p className="mut">{inventory.videos.length} workbook videos · source inventory preserved</p>
          </div>
          <section className="reviewDatabaseNotice" role="alert">
            <strong>Portfolio review is unavailable.</strong>
            <p>The configured Supabase database is missing the <code>projects.reviewed_at</code> column required by migration <code>004_portfolio_review.sql</code>. Ask the database owner to confirm the project and approve the migration before using review actions. No records were changed.</p>
          </section>
        </>
      );
    }
    throw new Error(`Could not load imported review statuses: ${projectResult.error.message}`);
  }
  if (categoryResult.error) throw new Error(`Could not load portfolio categories: ${categoryResult.error.message}`);

  const batchIds = [...new Set(projectResult.data.map((project) => project.import_batch_id).filter((id): id is string => Boolean(id)))];
  const batchResult = batchIds.length
    ? await supabase.from('import_batches').select('id,source_hash').in('id', batchIds)
    : { data: [], error: null };
  if (batchResult.error) throw new Error(`Could not verify the inventory import batch: ${batchResult.error.message}`);

  const currentBatchIds = new Set((batchResult.data ?? [])
    .filter((batch) => batch.source_hash === inventory.source_sha256)
    .map((batch) => batch.id));
  const importedProjects = new Map(projectResult.data
    .filter((project) => project.import_batch_id && currentBatchIds.has(project.import_batch_id))
    .map((project) => [project.youtube_id, project]));
  const categoryNames = new Map(categoryResult.data.map((category) => [category.id, category.name]));
  const categories = categoryResult.data.map(({ id, name }) => ({ id, name }));

  const unavailableIds = new Map(inventory.link_checks
    .filter((check) => !check.reachable)
    .map((check) => [check.youtube_id, check.status ?? null]));
  const unavailableThumbnailIds = new Set(inventory.thumbnail_checks
    .filter((check) => !check.available)
    .map((check) => check.youtube_id));
  const conflictIds = new Map(inventory.duplicate_metadata_conflicts
    .map((conflict) => [conflict.youtube_id, conflict.differing_fields]));

  const records: InventoryReviewRecord[] = inventory.videos.map((video) => {
    const project = importedProjects.get(video.youtube_id);
    const category = project
      ? project.category_id ? categoryNames.get(project.category_id) ?? null : null
      : video.category;
    return {
      projectId: project?.id ?? null,
      youtubeId: video.youtube_id,
      url: video.original_url,
      title: video.title,
      topic: video.topic,
      client: video.client,
      kind: video.kind,
      category,
      categoryId: project
        ? project.category_id
        : categoryResult.data.find((item) => item.name === video.category)?.id ?? null,
      ratio: project?.ratio ?? video.ratio,
      ratioRaw: project?.ratio_raw ?? video.ratio_raw,
      status: project?.status ?? 'pending_review',
      reviewedAt: project?.reviewed_at ?? null,
      unavailable: unavailableIds.has(video.youtube_id),
      unavailableStatus: unavailableIds.get(video.youtube_id) ?? null,
      thumbnailUnavailable: unavailableThumbnailIds.has(video.youtube_id),
      isConflict: conflictIds.has(video.youtube_id),
      differingFields: conflictIds.get(video.youtube_id) ?? [],
      sourceRows: asSourceRows(video),
    };
  });

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">SUPER ADMIN</p><h1>Inventory review</h1></div>
        <p className="mut">{inventory.videos.length} workbook videos · source hash verified</p>
      </div>
      <InventoryReview records={records} categories={categories} sourceHashMatches={currentBatchIds.size > 0} />
    </>
  );
}
