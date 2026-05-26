// netlify/functions/sheets.js
// Handles all Google Sheets operations server-side so the API key stays secret.
// Environment variables required (set in Netlify dashboard):
//   GOOGLE_API_KEY   — your restricted Google Sheets API key
//   SHEET_ID         — your Google Spreadsheet ID

const API_KEY  = process.env.GOOGLE_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const BASE     = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid JSON' }) };
  }

  const { action } = body;

  try {
    // ── READ ──────────────────────────────────────────────────────────────────
    if (action === 'read') {
      const url = `${BASE}/values/Sheet1!A:H?key=${API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
      const json = await res.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ rows: json.values || [] }),
      };
    }

    // ── APPEND (add new row) ──────────────────────────────────────────────────
    if (action === 'append') {
      const url = `${BASE}/values/Sheet1!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [body.row] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Append failed');
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── UPDATE (edit existing row) ────────────────────────────────────────────
    // rowIndex is 1-based sheet row number
    if (action === 'update') {
      const range = `Sheet1!A${body.rowIndex}:H${body.rowIndex}`;
      const url = `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED&key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [body.row] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Update failed');
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── DELETE (clear row content) ────────────────────────────────────────────
    // We clear the row rather than delete it to preserve sheet structure.
    // Make.com automation should filter out blank rows.
    if (action === 'delete') {
      const range = `Sheet1!A${body.rowIndex}:H${body.rowIndex}`;
      const url = `${BASE}/values/${encodeURIComponent(range)}:clear?key=${API_KEY}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Delete failed');
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Unknown action' }) };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: e.message }),
    };
  }
};
