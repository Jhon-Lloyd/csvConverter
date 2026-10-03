// Turns a Luma guest export into the check-in sheet.

export const OUTPUT_HEADERS = ['first_name', 'last_name', 'email', 'created_at', 'checked_in'];

// Output column -> accepted header names in the source file (normalized).
const SOURCE_COLUMNS = {
  first_name: ['first_name', 'firstname', 'first'],
  last_name: ['last_name', 'lastname', 'last', 'surname'],
  email: ['email', 'email_address'],
  created_at: ['created_at', 'registered_at', 'registration_date'],
  checked_in: ['checked_in_at', 'checked_in', 'check_in_time', 'checkin_at'],
};

// Guests with these approval_status values are left out of the copy.
// Compared after normalize(), so "Pending approval" matches too.
const EXCLUDED_STATUSES = ['invited', 'pending_approval'];

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
  // Optional: files without approval_status keep every row.
  const status = normalized.indexOf('approval_status');
  if (status !== -1) indexes.approval_status = status;
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
 * Returns { header, rows: [[...cols with checked_in as boolean]], stats }.
 * ticketColumn: { name, value } adds a last column with that header and
 * value on every row (e.g. ticket_venue = In-person); null leaves it out.
 * Rows whose approval_status is "invited" or "pending_approval" are dropped.
 * Order: checked in first (earliest check-in first), then not checked in
 * (newest registration first). Ties keep the original file order.
 */
export function convert(rows, { ticketColumn = { name: 'ticket_venue', value: 'In-person' } } = {}) {
  if (!rows.length) throw new Error('The file is empty.');
  const [header, ...data] = rows;
  const { indexes, missing } = findColumns(header);
  if (missing.length) {
    throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Is this a Luma guest export?`);
  }

  // Count of dropped rows per status, e.g. { invited: 2, pending_approval: 1 }.
  const excluded = {};
  const kept = data.filter((r) => {
    if (!('approval_status' in indexes)) return true;
    const status = normalize(r[indexes.approval_status] ?? '');
    if (!EXCLUDED_STATUSES.includes(status)) return true;
    excluded[status] = (excluded[status] ?? 0) + 1;
    return false;
  });

  const records = kept.map((r, order) => {
    const get = (k) => (r[indexes[k]] ?? '').trim();
    const rawCheckIn = get('checked_in');
    const checked = isCheckedIn(rawCheckIn);
    return {
      order,
      checked,
      checkInTime: checked ? time(rawCheckIn) : null,
      createdTime: time(get('created_at')),
      out: [get('first_name'), get('last_name'), get('email'), get('created_at'), checked, ...(ticketColumn ? [ticketColumn.value] : [])],
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
    header: ticketColumn ? [...OUTPUT_HEADERS, ticketColumn.name] : OUTPUT_HEADERS,
    rows: records.map((r) => r.out),
    stats: { total: records.length, checkedIn, notCheckedIn: records.length - checkedIn, excluded },
  };
}
