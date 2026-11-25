'use client';

import { useMemo, useState, useActionState } from 'react';
import { reviewInventoryRecord, type InventoryReviewActionState } from './actions';

export interface InventoryReviewSourceRow {
  sheet: string;
  row: number;
  columns: Array<{ header: string; value: unknown }>;
}

export interface InventoryReviewRecord {
  projectId: string | null;
  youtubeId: string;
  url: string;
  title: string | null;
  topic: string | null;
  client: string | null;
  kind: string | null;
  category: string | null;
  categoryId: string | null;
  ratio: string | null;
  ratioRaw: string | null;
  status: string;
  reviewedAt: string | null;
  unavailable: boolean;
  unavailableStatus: number | null;
  thumbnailUnavailable: boolean;
  isConflict: boolean;
  differingFields: string[];
  sourceRows: InventoryReviewSourceRow[];
}

export interface InventoryReviewCategory {
  id: string;
  name: string;
}

const initialState: InventoryReviewActionState = { status: 'idle', message: '' };
type Filter = 'all' | 'uncategorized' | 'conflict' | 'orientation' | 'unavailable' | 'pending' | 'approved' | 'rejected';

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All records' },
  { key: 'uncategorized', label: 'Uncategorized' },
  { key: 'conflict', label: 'Metadata conflicts' },
  { key: 'orientation', label: 'Unverified orientation' },
  { key: 'unavailable', label: 'Unavailable videos' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function displayStatus(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceValue(value: unknown) {
  if (value == null || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function ReviewRecordCard({
  record,
  categories,
}: {
  record: InventoryReviewRecord;
  categories: InventoryReviewCategory[];
}) {
  const [state, action, pending] = useActionState(reviewInventoryRecord, initialState);
  const canUpdate = Boolean(record.projectId);

  return (
    <article className="card inventoryReviewCard">
      <div className="inventoryReviewCardHead">
        <div>
          <p className="portfolioMeta">{record.client || record.kind || 'Portfolio video'}</p>
          <h3>{record.title || record.topic || record.youtubeId}</h3>
          {record.topic && record.title && <p className="mut">{record.topic}</p>}
        </div>
        <span className={`reviewStatus reviewStatus-${record.status}`}>{displayStatus(record.status)}</span>
      </div>

      <div className="inventoryBadges" aria-label="Record review flags">
        {!record.category && <span className="reviewBadge">Uncategorized</span>}
        {record.isConflict && <span className="reviewBadge reviewBadge-warn">Duplicate metadata conflict</span>}
        {!record.ratio && <span className="reviewBadge">Orientation not verified</span>}
        {record.unavailable && <span className="reviewBadge reviewBadge-danger">YouTube unavailable{record.unavailableStatus ? ` · HTTP ${record.unavailableStatus}` : ''}</span>}
        {record.thumbnailUnavailable && <span className="reviewBadge reviewBadge-danger">Thumbnail unavailable</span>}
      </div>

      <dl className="inventoryReviewMeta">
        <div><dt>Category</dt><dd>{record.category || 'Uncategorized / To Classify'}</dd></div>
        <div><dt>Orientation</dt><dd>{record.ratio || `Unverified${record.ratioRaw ? ` · source: ${record.ratioRaw}` : ''}`}</dd></div>
        <div><dt>Format</dt><dd>{record.kind || 'Not classified'}</dd></div>
        <div><dt>Review date</dt><dd>{record.reviewedAt ? new Date(record.reviewedAt).toLocaleString() : 'Not reviewed'}</dd></div>
      </dl>

      <a className="watchLink" href={record.url} target="_blank" rel="noreferrer">Open original YouTube link ↗</a>

      <details className="inventorySourceDetails">
        <summary>
          Original workbook values and provenance
          <span>{record.sourceRows.length} source {record.sourceRows.length === 1 ? 'row' : 'rows'}</span>
        </summary>
        {record.isConflict && (
          <p className="reviewConflictNote">
            Conflicting fields: {record.differingFields.join(', ') || 'Review the source values below.'}
            {' '}No source value was selected automatically.
          </p>
        )}
        {record.sourceRows.map((source, index) => (
          <section className="inventorySourceRow" key={`${source.sheet}-${source.row}-${index}`}>
            <h4>{source.sheet} · row {source.row}</h4>
            <dl>
              {source.columns.map((column, columnIndex) => (
                <div key={`${column.header}-${columnIndex}`}>
                  <dt>{column.header}</dt><dd>{sourceValue(column.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </details>

      {canUpdate ? (
        <form action={action} className="inventoryReviewActions">
          <input type="hidden" name="project_id" value={record.projectId!} />
          <label>
            Assign category
            <select name="category_id" defaultValue={record.categoryId ?? ''}>
              <option value="">Uncategorized / To Classify</option>
              {categories.filter((category) => category.name !== 'Uncategorized / To Classify').map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <div className="inventoryReviewButtons">
            <button className="btn ghost" name="intent" value="category" disabled={pending}>Save category</button>
            {record.status !== 'approved' && <button className="btn" name="intent" value="approved" disabled={pending}>Approve</button>}
            {record.status !== 'rejected' && <button className="btn danger" name="intent" value="rejected" disabled={pending}>Reject</button>}
            {record.status !== 'pending_review' && <button className="btn ghost" name="intent" value="pending_review" disabled={pending}>Return to pending</button>}
          </div>
          {state.message && <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
        </form>
      ) : (
        <p className="reviewDatabaseNotice">Read-only until this workbook is imported to Supabase. No review decision has been saved.</p>
      )}
    </article>
  );
}

export default function InventoryReview({
  records,
  categories,
  sourceHashMatches,
}: {
  records: InventoryReviewRecord[];
  categories: InventoryReviewCategory[];
  sourceHashMatches: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const counts = useMemo(() => ({
    total: records.length,
    reviewed: records.filter((record) => record.status === 'approved' || record.status === 'rejected').length,
    approved: records.filter((record) => record.status === 'approved').length,
    pending: records.filter((record) => record.status === 'pending_review').length,
    rejected: records.filter((record) => record.status === 'rejected').length,
  }), [records]);
  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === 'uncategorized' && record.category) return false;
      if (filter === 'conflict' && !record.isConflict) return false;
      if (filter === 'orientation' && record.ratio) return false;
      if (filter === 'unavailable' && !record.unavailable && !record.thumbnailUnavailable) return false;
      if (filter === 'pending' && record.status !== 'pending_review') return false;
      if (filter === 'approved' && record.status !== 'approved') return false;
      if (filter === 'rejected' && record.status !== 'rejected') return false;
      if (!query) return true;
      return [record.youtubeId, record.url, record.title, record.topic, record.client, record.category]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [filter, records, search]);

  return (
    <>
      <div className="stats inventoryReviewStats">
        {[
          ['Inventory records', counts.total],
          ['Reviewed', counts.reviewed],
          ['Approved', counts.approved],
          ['Pending', counts.pending],
          ['Rejected', counts.rejected],
        ].map(([label, count]) => <div className="card" key={label}><strong>{count}</strong>{label}</div>)}
      </div>

      {!sourceHashMatches && (
        <p className="reviewDatabaseNotice" role="status">
          The matching workbook has not been imported into Supabase. Records and source data are shown read-only;
          category changes and review decisions are disabled until the matching import batch exists.
        </p>
      )}

      <div className="inventoryReviewTools">
        <label className="inventoryReviewSearch">
          Search inventory
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Video, client, category, or URL" />
        </label>
        <div className="inventoryReviewFilters" aria-label="Filter inventory records">
          {filters.map((item) => (
            <button
              className={`filterButton${filter === item.key ? ' active' : ''}`}
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {item.key === 'uncategorized' && ` (${records.filter((record) => !record.category).length})`}
              {item.key === 'conflict' && ` (${records.filter((record) => record.isConflict).length})`}
              {item.key === 'orientation' && ` (${records.filter((record) => !record.ratio).length})`}
              {item.key === 'unavailable' && ` (${records.filter((record) => record.unavailable || record.thumbnailUnavailable).length})`}
            </button>
          ))}
        </div>
      </div>

      <p className="mut inventoryReviewResultCount" aria-live="polite">
        Showing {visibleRecords.length} of {records.length} records
      </p>
      <div className="inventoryReviewList">
        {visibleRecords.map((record) => <ReviewRecordCard key={record.youtubeId} record={record} categories={categories} />)}
        {!visibleRecords.length && <p className="card mut">No records match this filter.</p>}
      </div>
    </>
  );
}
