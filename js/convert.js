// Turns a Luma guest export into the 6-column check-in sheet.

export const OUTPUT_HEADERS = ['first_name', 'last_name', 'email', 'created_at', 'checked_in', 'ticket_venue'];

// Output column -> accepted header names in the source file (normalized).
const SOURCE_COLUMNS = {
  first_name: ['first_name', 'firstname', 'first'],
  last_name: ['last_name', 'lastname', 'last', 'surname'],
  email: ['email', 'email_address'],
  created_at: ['created_at', 'registered_at', 'registration_date'],
  checked_in: ['checked_in_at', 'checked_in', 'check_in_time', 'checkin_at'],
};

const normalize = (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function findColumns(header) {
  const normalized = header.map(normalize);
  const indexes = {};
  const missing = [];
  for (const [key, aliases] of Object.entries(SOURCE_COLUMNS)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx === -1) missing.push(key === 'checked_in' ? 'checked_in_at' : key);
    else indexes[key] = idx;
  }
  return { indexes, missing };
}

// Any non-empty value counts as checked in (a timestamp from Luma),
// except explicit "no" values in case the file was already converted.
export function isCheckedIn(value) {
  const v = (value ?? '').trim().toLowerCase();
  return v !== '' && !['false', 'no', '0', 'n'].includes(v);
}

const time = (s) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

/**
 * rows: parsed CSV including the header row.
 * Returns { header, rows: [[...6 cols with checked_in as boolean]], stats }.
 * Order: checked in first (earliest check-in first), then not checked in
 * (newest registration first). Ties keep the original file order.
 */
export function convert(rows, { venue = 'In-person' } = {}) {
  if (!rows.length) throw new Error('The file is empty.');
  const [header, ...data] = rows;
  const { indexes, missing } = findColumns(header);
  if (missing.length) {
    throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Is this a Luma guest export?`);
  }

  const records = data.map((r, order) => {
    const get = (k) => (r[indexes[k]] ?? '').trim();
    const rawCheckIn = get('checked_in');
    const checked = isCheckedIn(rawCheckIn);
    return {
      order,
      checked,
      checkInTime: checked ? time(rawCheckIn) : null,
      createdTime: time(get('created_at')),
      out: [get('first_name'), get('last_name'), get('email'), get('created_at'), checked, venue],
    };
  });

  // Nulls (unparseable dates) sink to the end of their group.
  const byTime = (a, b, dir) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : dir * (a - b));
  records.sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? -1 : 1;
    const cmp = a.checked ? byTime(a.checkInTime, b.checkInTime, 1) : byTime(a.createdTime, b.createdTime, -1);
    return cmp || a.order - b.order;
  });

  const checkedIn = records.filter((r) => r.checked).length;
  return {
    header: OUTPUT_HEADERS,
    rows: records.map((r) => r.out),
    stats: { total: records.length, checkedIn, notCheckedIn: records.length - checkedIn },
  };
}
