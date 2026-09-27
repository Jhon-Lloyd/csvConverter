import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../js/csv.js';
import { convert, isCheckedIn } from '../js/convert.js';
import { buildXlsx, safeSheetName } from '../js/xlsx.js';

// Shape of a Luma guest export (extra columns are dropped).
const LUMA = [
  'api_id,name,first_name,last_name,email,phone_number,created_at,approval_status,checked_in_at,ticket_name',
  'g-1,Alice Example,Alice,Example,alice@example.com,,2026-04-01T08:00:00.000Z,approved,,Standard',
  'g-2,"Sample, Bob","Sample,",Bob,bob@example.com,,2026-04-02T08:00:00.000Z,approved,2026-05-16T01:10:00.000Z,Standard',
  'g-3,,,,anon@example.com,,2026-05-10T08:00:00.000Z,approved,2026-05-16T00:30:00.000Z,Standard',
  'g-4,Dana Test,Dana,Test,dana@example.com,,2026-05-14T08:00:00.000Z,approved,,Standard',
  'g-5,Iñigo Demo,Iñigo,Demo,inigo@example.com,,2026-04-20T08:00:00.000Z,approved,2026-05-16T00:45:00.000Z,Standard',
].join('\n');

test('keeps the 6 columns in order and adds ticket_venue', () => {
  const { header, rows } = convert(parseCsv(LUMA));
  assert.deepEqual(header, ['first_name', 'last_name', 'email', 'created_at', 'checked_in', 'ticket_venue']);
  assert.ok(rows.every((r) => r.length === 6 && r[5] === 'In-person'));
});

test('sorts checked-in first by check-in time, then others newest registration first', () => {
  const { rows, stats } = convert(parseCsv(LUMA));
  assert.deepEqual(
    rows.map((r) => [r[2], r[4]]),
    [
      ['anon@example.com', true],
      ['inigo@example.com', true],
      ['bob@example.com', true],
      ['dana@example.com', false],
      ['alice@example.com', false],
    ]
  );
  assert.deepEqual(stats, { total: 5, checkedIn: 3, notCheckedIn: 2 });
});

test('custom venue and quoted fields survive a CSV round trip', () => {
  const { header, rows } = convert(parseCsv(LUMA), { venue: 'Online' });
  const csv = toCsv([header, ...rows.map((r) => r.map((v) => (typeof v === 'boolean' ? String(v).toUpperCase() : v)))]);
  const back = parseCsv(csv);
  assert.equal(back[3][0], 'Sample,');
  assert.equal(back[1][5], 'Online');
  assert.equal(back[1][4], 'TRUE');
});

test('header matching is case/space insensitive and reports missing columns', () => {
  const ok = convert(parseCsv('First Name,Last Name,Email,Created At,Checked In At\na,b,c,2026-01-01,\n'));
  assert.equal(ok.rows[0][4], false);
  assert.throws(() => convert(parseCsv('name,email\na,b')), /Missing columns: first_name, last_name, created_at, checked_in_at/);
});

test('isCheckedIn', () => {
  assert.equal(isCheckedIn('2026-05-16T01:31:16.890Z'), true);
  assert.equal(isCheckedIn('TRUE'), true);
  assert.equal(isCheckedIn(''), false);
  assert.equal(isCheckedIn('FALSE'), false);
});

test('parseCsv handles BOM, CRLF and escaped quotes', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x ""y""",z\r\n'), [['a', 'b'], ['x "y"', 'z']]);
});

test('xlsx is a zip with two sheets and safe names', async () => {
  const blob = buildXlsx([
    { name: 'Build with AI 2026 - Guests - 2026-09-27-12-24-25', rows: [['a']] },
    { name: 'Copy of Build with AI 2026 - Guests - 2026-09-27-12-24-25', rows: [['h'], [true]] },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /<sheet name="Build with AI 2026 - Guests - 2"/);
  assert.match(text, /<sheet name="Copy of Build with AI 2026 - Gu"/);
  assert.match(text, /t="b"><v>1<\/v>/);
  assert.equal(safeSheetName('a/b:c'), 'a b c');
});
