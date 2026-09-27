// On each release bump ?v= here and in index.html so browsers fetch fresh files.
import { parseCsv, toCsv } from './csv.js?v=4';
import { convert } from './convert.js?v=4';
import { buildXlsx } from './xlsx.js?v=4';

const PREVIEW_ROWS = 15;

// Every element this script touches; see the stale-page check below.
const REQUIRED_IDS = [
  'file', 'dropzone', 'venue', 'filename', 'error', 'result', 'stat-total', 'stat-true', 'stat-false',
  'excluded-note', 'sheet-names', 'preview', 'preview-note', 'dl-xlsx', 'dl-csv',
];

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const dropzone = $('dropzone');
const venueInput = $('venue');

let source = null; // { baseName, rows }
let result = null;

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = !msg;
}

async function loadFile(file) {
  if (!file) return;
  showError('');
  $('filename').textContent = file.name;
  $('filename').hidden = false;
  try {
    const text = await file.text();
    source = { baseName: file.name.replace(/\.csv$/i, ''), rows: parseCsv(text) };
    render();
  } catch (err) {
    source = null;
    showError(err.message);
    $('result').hidden = true;
  }
}

function render() {
  if (!source) return;
  try {
    result = convert(source.rows, { venue: venueInput.value.trim() });
  } catch (err) {
    result = null;
    showError(err.message);
    $('result').hidden = true;
    return;
  }
  showError('');

  $('stat-total').textContent = result.stats.total;
  $('stat-true').textContent = result.stats.checkedIn;
  $('stat-false').textContent = result.stats.notCheckedIn;
  const excluded = Object.entries(result.stats.excluded);
  $('excluded-note').hidden = !excluded.length;
  $('excluded-note').textContent =
    `Removed from the copy: ${excluded.map(([status, n]) => `${n} ${status.replace(/_/g, ' ')}`).join(', ')} ` +
    '(still in the original sheet).';
  $('sheet-names').textContent =
    `Sheets: “${source.baseName}” (original) and “Copy of ${source.baseName}”. ` +
    'Excel limits sheet names to 31 characters, so long names are shortened inside the .xlsx.';

  const table = $('preview');
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of result.header) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (const row of result.rows.slice(0, PREVIEW_ROWS)) {
    const tr = body.insertRow();
    for (const v of row) {
      const td = tr.insertCell();
      if (typeof v === 'boolean') {
        const pill = document.createElement('span');
        pill.className = `pill pill-${v}`;
        pill.textContent = v ? 'TRUE' : 'FALSE';
        td.appendChild(pill);
      } else {
        td.textContent = v;
      }
    }
  }
  $('preview-note').textContent =
    result.rows.length > PREVIEW_ROWS ? `· first ${PREVIEW_ROWS} of ${result.rows.length} rows` : '';

  $('result').hidden = false;
}

const copyRows = () => [result.header, ...result.rows];

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('dl-csv').addEventListener('click', () => {
  if (!result) return;
  const csv = toCsv(copyRows().map((r) => r.map((v) => (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v))));
  // BOM so Excel reads accented names (ñ, é…) correctly.
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `Copy of ${source.baseName}.csv`);
});

$('dl-xlsx').addEventListener('click', () => {
  if (!result) return;
  const blob = buildXlsx([
    { name: source.baseName, rows: source.rows },
    { name: `Copy of ${source.baseName}`, rows: copyRows() },
  ]);
  download(blob, `${source.baseName}.xlsx`);
});

// A cached old index.html can pair with this newer script right after a deploy.
if (REQUIRED_IDS.some((id) => !$(id))) {
  showError('This page was just updated. Please refresh it (Ctrl/Cmd + Shift + R) and try again.');
  throw new Error('Stale page markup; reload required.');
}

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
venueInput.addEventListener('input', render);

for (const evt of ['dragenter', 'dragover']) {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
}
for (const evt of ['dragleave', 'drop']) {
  dropzone.addEventListener(evt, () => dropzone.classList.remove('dragover'));
}
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});
