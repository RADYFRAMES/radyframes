import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { buildInventory, extractYoutubeUrls, parseYoutubeUrl } from './portfolio-import-core.mjs';

test('parses YouTube watch, short and short-link URLs without changing input strings', () => {
  const watch = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.deepEqual(parseYoutubeUrl(watch), { valid: true, videoId: 'abcdefghijk', kind: null });
  assert.deepEqual(parseYoutubeUrl('https://youtube.com/shorts/lmnopqrstuv'), { valid: true, videoId: 'lmnopqrstuv', kind: 'short' });
  assert.deepEqual(parseYoutubeUrl('https://youtu.be/12345678901'), { valid: true, videoId: '12345678901', kind: null });
  assert.deepEqual(extractYoutubeUrls(`${watch}.`), [watch]);
});

test('keeps duplicate video occurrences and classifications as separate source rows', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Video Inventory');
  sheet.addRow(['Approved video collection']);
  sheet.addRow(['Video URL', 'Category', 'Brand', 'Aspect Ratio', 'Format']);
  sheet.addRow(['https://youtube.com/watch?v=abcdefghijk', 'Saree Reels', 'Client A', '9:16', 'YouTube Shorts']);
  sheet.addRow(['https://youtu.be/12345678901', '', '', '', 'YouTube video']);
  sheet.addRow(['https://youtube.com/shorts/abcdefghijk', 'Clothing', 'Client B', '16:9', 'Short']);
  sheet.addRow(['https://youtube.com/watch?v=bad-id', 'Uncategorized / To Classify', '', '', 'Video']);

  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  const inventory = buildInventory(reopened);
  assert.equal(inventory.unique_video_ids, 2);
  assert.equal(inventory.valid_url_rows, 3);
  assert.equal(inventory.duplicate_url_rows, 1);
  assert.equal(inventory.duplicate_metadata_conflict_count, 1);
  assert.equal(inventory.categorized_unique_videos, 0);
  assert.equal(inventory.uncategorized_unique_videos, 2);
  assert.equal(inventory.invalid_rows.length, 1);
  const duplicate = inventory.videos.find((video) => video.youtube_id === 'abcdefghijk');
  assert.equal(duplicate.category, null);
  assert.equal(duplicate.ratio, null);
  assert.equal(duplicate.source_rows.length, 2);
  assert.equal(duplicate.source_rows[1].category_raw, 'Clothing');
  assert.equal(duplicate.source_rows[1].ratio, '16:9');
  assert.deepEqual(inventory.categories, ['Clothing', 'Saree Reels']);
  assert.equal(duplicate.source_rows[1].source_data.columns[0].value, 'https://youtube.com/shorts/abcdefghijk');
  assert.equal(duplicate.source_rows[1].source_data.header_row_number, 2);
});

test('does not classify unverified ratios or non-YouTube URLs as valid records', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Unclassified');
  sheet.addRow(['URL', 'Aspect Ratio']);
  sheet.addRow(['https://youtube.com/watch?v=abcdefghijk', 'Not verified']);
  sheet.addRow(['https://example.com/watch?v=12345678901', '16:9']);
  const hyperlinkRow = sheet.addRow(['', '4:5']);
  hyperlinkRow.getCell(1).value = { text: 'Watch', hyperlink: 'https://youtu.be/12345678901' };
  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  const inventory = buildInventory(reopened);
  assert.equal(inventory.unique_video_ids, 2);
  assert.equal(inventory.videos[0].ratio, null);
  assert.equal(inventory.videos[0].ratio_raw, 'Not verified');
  assert.equal(inventory.invalid_rows.length, 0);
  const linkedRecord = inventory.videos.find((video) => video.youtube_id === '12345678901');
  assert.equal(linkedRecord.original_url, 'https://youtu.be/12345678901');
  assert.equal(linkedRecord.ratio, '4:5');
});
