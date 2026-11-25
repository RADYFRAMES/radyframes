const URL_PATTERN = /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s"'<>]+/gi;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_RATIOS = new Set(['9:16', '16:9', '1:1', '4:5']);

export function extractYoutubeUrls(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(URL_PATTERN)].map(([matched]) => matched.replace(/[.,;:!?)\]}]+$/g, ''));
}

export function parseYoutubeUrl(originalUrl) {
  try {
    const url = new URL(originalUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(hostname)) {
      return { valid: false, error: 'Unsupported YouTube hostname.' };
    }

    let videoId = null;
    let kind = null;
    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else {
      const segments = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      if (['shorts', 'embed', 'live', 'v'].includes(segments[0])) {
        videoId = segments[1] ?? null;
        if (segments[0] === 'shorts') kind = 'short';
      }
    }

    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
      return { valid: false, error: 'Missing or malformed 11-character video ID.' };
    }
    return { valid: true, videoId, kind };
  } catch {
    return { valid: false, error: 'Malformed URL.' };
  }
}

export function normalizeRatio(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/(?:^|[^0-9])((?:9:16)|(?:16:9)|(?:1:1)|(?:4:5))(?:$|[^0-9])/);
  const ratio = match?.[1] ?? null;
  return { raw: raw || null, ratio: ratio && ALLOWED_RATIOS.has(ratio) ? ratio : null };
}

function cellValue(value) {
  if (value && typeof value === 'object' && 'hyperlink' in value) {
    return `${String(value.text ?? '')} ${String(value.hyperlink ?? '')}`.trim();
  }
  if (value && typeof value === 'object' && 'text' in value) return String(value.text);
  if (value && typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  if (value instanceof Date) return value.toISOString();
  return value == null ? '' : String(value);
}

function sourceCellValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if ('hyperlink' in value) return { text: value.text ?? null, hyperlink: value.hyperlink ?? null };
  if ('formula' in value) return { formula: value.formula, result: sourceCellValue(value.result) };
  if ('richText' in value) return { richText: value.richText, text: cellValue(value) };
  if ('text' in value) return { text: value.text };
  return String(value);
}

function headerName(value, index) {
  return String(value ?? '').trim() || `column_${index + 1}`;
}

function findHeaders(sheet) {
  const candidates = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 10) return;
    const values = Array.from(row.values.slice(1), cellValue);
    if (!values.some((value) => String(value).trim())) return;
    const score = values.filter((value) => /youtube|url|link|category|classif|brand|client|aspect|ratio|format|topic|title|video|type|orientation/i.test(value)).length;
    candidates.push({ rowNumber, values, score });
  });
  const best = candidates.reduce((selected, item) => item.score > selected.score ? item : selected, candidates[0]);
  if (!best) return { rowNumber: 1, headers: [] };
  const chosen = best.score >= 2 ? best : candidates[0];
  return { rowNumber: chosen.rowNumber, headers: Array.from(chosen.values, headerName) };
}

function valueFor(headers, values, pattern) {
  const index = headers.findIndex((header) => pattern.test(header));
  return index < 0 ? '' : cellValue(values[index]).trim();
}

function recordFromRow(sheetName, rowNumber, headers, rawValues) {
  const values = Array.from(rawValues, cellValue);
  const sourceData = {
    headers,
    columns: rawValues.map((value, index) => ({
      column_index: index + 1,
      header: headers[index] ?? `column_${index + 1}`,
      value: sourceCellValue(value),
    })),
  };
  const candidates = values.flatMap(extractYoutubeUrls);
  const records = candidates.length ? candidates : [''];

  return records.map((originalUrl) => {
    const parsed = originalUrl ? parseYoutubeUrl(originalUrl) : { valid: false, error: 'No YouTube URL found in source row.' };
    const categoryRaw = valueFor(headers, values, /category|classification|content\s*type/i) || null;
    const category = categoryRaw && !/uncategorized|to classify|not supplied/i.test(categoryRaw) ? categoryRaw : null;
    const ratio = normalizeRatio(valueFor(headers, values, /aspect|ratio|orientation/i));
    const format = valueFor(headers, values, /format|video\s*type|shorts?/i);
    const rowKind = parsed.kind ?? (/short/i.test(format) ? 'short' : /regular|landscape|long[\s-]?form|video/i.test(format) ? 'video' : null);
    return {
      source_sheet: sheetName,
      source_row_number: rowNumber,
      source_data: sourceData,
      original_url: originalUrl,
      youtube_id: parsed.valid ? parsed.videoId : null,
      validation_status: parsed.valid ? 'valid' : 'invalid',
      validation_error: parsed.valid ? null : parsed.error,
      category,
      category_raw: categoryRaw,
      client: valueFor(headers, values, /brand|client|customer/i) || null,
      topic: valueFor(headers, values, /topic|project\s*name/i) || null,
      title: valueFor(headers, values, /^title$/i) || null,
      ratio_raw: ratio.raw,
      ratio: ratio.ratio,
      kind: rowKind,
    };
  });
}

export function buildInventory(workbook) {
  const sourceRows = [];
  const sheetStats = [];

  workbook.eachSheet((sheet) => {
    const { headers, rowNumber: headerRowNumber } = findHeaders(sheet);
    let nonEmptyRows = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rawValues = Array.from(row.values.slice(1));
      const values = rawValues.map(cellValue);
      if (!values.some((value) => String(value).trim())) return;
      nonEmptyRows += 1;
      const sourceRecords = recordFromRow(sheet.name, rowNumber, headers, rawValues);
      sourceRows.push(...sourceRecords.map((record) => ({
        ...record,
        source_data: { ...record.source_data, header_row_number: headerRowNumber },
      })));
    });
    sheetStats.push({ name: sheet.name, rows: sheet.rowCount, non_empty_rows: nonEmptyRows });
  });

  const videosById = new Map();
  const duplicates = [];
  const invalidRows = [];
  const duplicateMetadataConflicts = [];
  const mergeFields = ['category', 'category_raw', 'client', 'topic', 'title', 'ratio', 'ratio_raw', 'kind'];
  for (const row of sourceRows) {
    if (row.validation_status !== 'valid') {
      if (row.original_url || row.validation_error !== 'No YouTube URL found in source row.') invalidRows.push(row);
      continue;
    }
    const existing = videosById.get(row.youtube_id);
    if (existing) {
      existing.source_rows.push(row);
      const differences = mergeFields.filter((field) => existing[field] !== row[field]);
      const duplicate = {
        youtube_id: row.youtube_id,
        original_url: row.original_url,
        source_sheet: row.source_sheet,
        source_row_number: row.source_row_number,
        first_seen_sheet: existing.source_rows[0].source_sheet,
        first_seen_row_number: existing.source_rows[0].source_row_number,
        differing_fields: differences,
      };
      duplicates.push(duplicate);
      if (differences.length) duplicateMetadataConflicts.push(duplicate);
      continue;
    }
    videosById.set(row.youtube_id, { ...row, source_rows: [row] });
  }

  const videos = [...videosById.values()];
  for (const video of videos) {
    for (const field of ['category', 'client', 'topic', 'title', 'ratio', 'kind']) {
      const values = [...new Set(video.source_rows.map((row) => row[field]).filter(Boolean))];
      video[field] = values.length === 1 ? values[0] : null;
    }
    video.status = 'pending_review';
  }
  const categories = [...new Set(sourceRows.filter((row) => row.validation_status === 'valid').map((row) => row.category).filter(Boolean))].sort();
  return {
    sheets: sheetStats,
    total_non_empty_rows: sheetStats.reduce((total, sheet) => total + sheet.non_empty_rows, 0),
    valid_url_rows: sourceRows.filter((row) => row.validation_status === 'valid').length,
    unique_video_ids: videos.length,
    duplicate_url_rows: duplicates.length,
    duplicate_metadata_conflicts: duplicateMetadataConflicts,
    duplicate_metadata_conflict_count: duplicateMetadataConflicts.length,
    categorized_unique_videos: videos.filter((video) => video.category).length,
    uncategorized_unique_videos: videos.filter((video) => !video.category).length,
    shorts: videos.filter((video) => video.kind === 'short').length,
    regular_videos: videos.filter((video) => video.kind === 'video').length,
    unclassified_format: videos.filter((video) => !video.kind).length,
    categories,
    invalid_rows: invalidRows,
    duplicates,
    source_rows: sourceRows,
    videos,
  };
}
