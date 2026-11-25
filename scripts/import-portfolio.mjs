import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import nextEnv from '@next/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildInventory } from './portfolio-import-core.mjs';

nextEnv.loadEnvConfig(process.cwd());

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function slugify(value) {
  const base = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uncategorized';
  return `${base}-${createHash('sha256').update(value).digest('hex').slice(0, 8)}`;
}

async function verifyLinks(sourceRows) {
  const results = [];
  const queue = sourceRows.filter((row) => row.validation_status === 'valid');
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const sourceRow = queue.shift();
      const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceRow.original_url)}`;
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
        results.push({
          youtube_id: sourceRow.youtube_id,
          source_sheet: sourceRow.source_sheet,
          source_row_number: sourceRow.source_row_number,
          original_url: sourceRow.original_url,
          reachable: response.ok,
          status: response.status,
        });
      } catch (error) {
        results.push({
          youtube_id: sourceRow.youtube_id,
          source_sheet: sourceRow.source_sheet,
          source_row_number: sourceRow.source_row_number,
          original_url: sourceRow.original_url,
          reachable: false,
          error: error instanceof Error ? error.message : 'Network verification failed.',
        });
      }
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.youtube_id.localeCompare(b.youtube_id));
}

async function verifyThumbnails(videos) {
  const results = [];
  const queue = [...videos];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const video = queue.shift();
      const url = `https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg`;
      try {
        const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(12000) });
        results.push({ youtube_id: video.youtube_id, url, available: response.ok, status: response.status });
        await response.body?.cancel();
      } catch (error) {
        results.push({
          youtube_id: video.youtube_id,
          url,
          available: false,
          error: error instanceof Error ? error.message : 'Thumbnail check failed.',
        });
      }
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.youtube_id.localeCompare(b.youtube_id));
}

async function applyInventory(inventory, inputPath, sourceHash) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Apply requires NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const categoryNames = new Set(inventory.categories);
  if (inventory.uncategorized_unique_videos) categoryNames.add('Uncategorized / To Classify');
  if (inventory.videos.some((video) => !video.category)) categoryNames.add('Uncategorized / To Classify');
  const categories = [...categoryNames].map((name) => ({ name, slug: slugify(name) }));
  const videos = inventory.videos.map((video) => ({
    youtube_id: video.youtube_id,
    original_url: video.original_url,
    kind: video.kind,
    category: video.category,
    topic: video.topic,
    client: video.client,
    title: video.title,
    description: null,
    ratio_raw: video.ratio_raw,
    ratio: video.ratio,
    source_sheet: video.source_sheet,
  }));
  const sourceRows = inventory.source_rows.map((row) => ({
    youtube_id: row.youtube_id,
    original_url: row.original_url,
    source_sheet: row.source_sheet,
    source_row_number: row.source_row_number,
    source_data: row.source_data,
    validation_status: row.original_url ? row.validation_status : 'no_video_url',
    validation_error: row.validation_error,
  }));
  const { data: batchId, error } = await supabase.rpc('import_portfolio_inventory', {
    p_source: path.basename(inputPath),
    p_source_hash: sourceHash,
    p_videos: videos,
    p_source_rows: sourceRows,
    p_categories: categories,
  });
  if (error) throw new Error(`Database import transaction failed: ${error.message}`);
  return batchId;
}

async function main() {
  const inputPath = option('--input');
  if (!inputPath) throw new Error('Usage: npm run portfolio:import -- --input <workbook.xlsx> [--verify-links] [--dry-run|--apply]');
  if (hasFlag('--apply') && hasFlag('--dry-run')) throw new Error('Choose either --dry-run or --apply, not both.');
  if (hasFlag('--apply') && !hasFlag('--verify-links')) throw new Error('Run link and thumbnail checks before applying by adding --verify-links.');
  const absoluteInput = path.resolve(inputPath);
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = await readFile(absoluteInput);
  const sourceHash = createHash('sha256').update(workbookBytes).digest('hex');
  await workbook.xlsx.load(workbookBytes);
  const inventory = buildInventory(workbook);
  inventory.source_sha256 = sourceHash;

  if (hasFlag('--verify-links')) {
    inventory.link_checks = await verifyLinks(inventory.source_rows);
    inventory.thumbnail_checks = await verifyThumbnails(inventory.videos);
  }
  const explicitOutputPath = option('--output');
  let outputPath = path.resolve(explicitOutputPath ?? 'src/data/portfolio-inventory.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (explicitOutputPath || !(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    outputPath = path.resolve(`src/data/portfolio-inventory-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }

  let batchId = null;
  if (hasFlag('--apply')) batchId = await applyInventory(inventory, absoluteInput, sourceHash);
  const report = {
    sheets: inventory.sheets,
    source_sha256: inventory.source_sha256,
    total_non_empty_rows: inventory.total_non_empty_rows,
    valid_url_rows: inventory.valid_url_rows,
    unique_video_ids: inventory.unique_video_ids,
    duplicate_url_rows: inventory.duplicate_url_rows,
    duplicate_metadata_conflict_count: inventory.duplicate_metadata_conflict_count,
    duplicate_metadata_conflicts: inventory.duplicate_metadata_conflicts,
    categorized_unique_videos: inventory.categorized_unique_videos,
    uncategorized_unique_videos: inventory.uncategorized_unique_videos,
    shorts: inventory.shorts,
    regular_videos: inventory.regular_videos,
    unclassified_format: inventory.unclassified_format,
    categories: inventory.categories,
    invalid_url_rows: inventory.invalid_rows.length,
    unavailable_url_checks: inventory.link_checks?.filter((result) => !result.reachable).length,
    url_checks_completed: inventory.link_checks?.length,
    unavailable_thumbnails: inventory.thumbnail_checks?.filter((result) => !result.available).length,
    thumbnails_checked: inventory.thumbnail_checks?.length,
    structured_output: outputPath,
    database_batch_id: batchId,
    mode: batchId ? 'applied' : 'dry-run',
  };
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
