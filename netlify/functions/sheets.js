// netlify/functions/sheets.js
// Uses a Google Service Account for full read/write/delete access.
// Environment variables required (set in Netlify dashboard):
//   GOOGLE_SERVICE_ACCOUNT_KEY  — full JSON contents of the service account key file
//   SHEET_ID                    — your Google Spreadsheet ID

const SHEET_ID = process.env.SHEET_ID;
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlBuffer(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${claim}`;
  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64urlBuffer(sign.sign(key.private_key));
  const jwt = `${signingInput}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Auth failed: ${err.error_description || err.error}`);
  }
  const data = await res.json();
  return data.access_token;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid JSON' }) };
  }

  const { action } = body;

  try {
    const token = await getAccessToken();
    const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (action === 'read') {
      const res = await fetch(`${BASE}/values/Sheet1!A:H`, { headers: authHeader });
      if (!res.ok) throw new Error(`Read failed: ${res.status}`);
      const json = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ rows: json.values || [] }) };
    }

    if (action === 'append') {
      const url = `${BASE}/values/Sheet1!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const res = await fetch(url, {
        method: 'POST', headers: authHeader,
        body: JSON.stringify({ values: [body.row] }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Append failed'); }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'update') {
      const range = `Sheet1!A${body.rowIndex}:H${body.rowIndex}`;
      const url = `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: 'PUT', headers: authHeader,
        body: JSON.stringify({ values: [body.row] }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Update failed'); }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'delete') {
      const res = await fetch(`${BASE}:batchUpdate`, {
        method: 'POST', headers: authHeader,
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: body.rowIndex - 1,
                endIndex: body.rowIndex,
              }
            }
          }]
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Delete failed'); }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Unknown action' }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ message: e.message }) };
  }
};
