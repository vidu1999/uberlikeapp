'use strict';

const DIDIT_URL = 'https://verification.didit.me/v3/id-verification/';
const MAX_DATA_CHARS = 1800000;

function apiKey() {
  return String(process.env.DIDIT_API_KEY || process.env.ID_VERIFY_API_KEY || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, '');
}

function parseSriNic(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{9}[VX]$/.test(s) || /^\d{12}$/.test(s)) return s;
  return '';
}

function parseLicenseId(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s\-/]/g, '');
  if (s.length >= 5 && s.length <= 20 && /^[A-Z0-9]+$/.test(s)) return s;
  return '';
}

function nicFromText(raw) {
  const u = String(raw || '').toUpperCase().replace(/O/g, '0');
  const compact = u.replace(/[^A-Z0-9]/g, '');
  let m = compact.match(/\d{12}/);
  if (m && parseSriNic(m[0])) return parseSriNic(m[0]);
  m = compact.match(/\d{9}[VX]/);
  if (m && parseSriNic(m[0])) return parseSriNic(m[0]);
  return parseSriNic(raw);
}

function licenseFromText(raw, skipNic) {
  const skip = String(skipNic || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n = parseLicenseId(raw);
  if (n && n !== skip) return n;
  const compact = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const lic = parseLicenseId(compact.slice(0, 16));
  if (lic && lic !== skip) return lic;
  return '';
}

function decodeDataUrl(s) {
  const m = String(s || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  if (m[0].length > MAX_DATA_CHARS) return null;
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) return null;
  return { type: m[1] || 'image/jpeg', bytes: buf };
}

function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h.endsWith('.supabase.co')) return true;
  if (h.endsWith('.pages.dev')) return true;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  return false;
}

async function imagePart(src) {
  const s = String(src || '').trim();
  if (!s || s === 'uploaded') throw new Error('Upload this photo again.');
  if (s.indexOf('data:') === 0) {
    const d = decodeDataUrl(s);
    if (!d) throw new Error('Could not read this photo.');
    return d;
  }
  let u;
  try { u = new URL(s); } catch (_) {
    throw new Error('Upload this photo again.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Upload this photo again.');
  if (!hostAllowed(u.hostname)) throw new Error('Upload this photo again.');
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error('Could not open this photo.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 80) throw new Error('Could not open this photo.');
  if (buf.length > 6 * 1024 * 1024) throw new Error('Photo is too large. Try a smaller photo.');
  const type = String(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return { type: type.indexOf('image/') === 0 ? type : 'image/jpeg', bytes: buf };
}

function docTypeOf(iv) {
  return String((iv && (iv.document_type || iv.documentType)) || '').toLowerCase();
}

function isIdCard(t) {
  return /identity|id card|national id|id_card/.test(t);
}

function isDriverLicense(t) {
  return /driver|licence|license/.test(t);
}

function pickNumbers(iv) {
  const docNo = String((iv && (iv.document_number || iv.documentNumber)) || '');
  const personal = String((iv && (iv.personal_number || iv.personalNumber)) || '');
  const extra = iv && iv.extra_fields && typeof iv.extra_fields === 'object' ? iv.extra_fields : {};
  const extraBits = [extra.nic, extra.national_id, extra.personal_number, extra.document_number]
    .map((v) => String(v || '')).join(' ');
  const blob = [docNo, personal, extraBits, iv && iv.full_name].join(' ');
  const nic = nicFromText(personal) || nicFromText(docNo) || nicFromText(blob);
  const licenseId = licenseFromText(docNo, nic) || licenseFromText(personal, nic) || licenseFromText(blob, nic);
  return { nic, licenseId, documentNumber: docNo, personalNumber: personal };
}

function warningText(iv) {
  const warns = iv && Array.isArray(iv.warnings) ? iv.warnings : [];
  return warns.map((w) => {
    if (!w) return '';
    if (typeof w === 'string') return w;
    return [w.log_type, w.risk, w.message, w.code].filter(Boolean).join(' ');
  }).join(' ').toLowerCase();
}

function userMessage(kind, status, iv, mismatch) {
  if (mismatch) return mismatch;
  const st = String(status || '');
  if (st === 'Approved') return kind === 'nic' ? 'NIC verified.' : 'Driving licence verified.';
  const w = warningText(iv);
  if (/liveness|screen|print|replay|spoof/.test(w)) return 'Use the real card, not a photo of a screen.';
  if (/blur|quality|focus|dark|bright/.test(w)) return 'Photo is too blurry. Take a brighter, flat photo of both sides.';
  if (st === 'In Review') return 'ID check is reviewing this card. Tap Save again in a minute.';
  if (kind === 'nic') return 'NIC was not accepted. Upload a clear front and back of the real card.';
  return 'Driving licence was not accepted. Upload a clear front and back of the real card.';
}

function publicResult(kind, iv, requestId) {
  const status = String((iv && iv.status) || 'Declined');
  const type = docTypeOf(iv);
  const nums = pickNumbers(iv || {});
  let mismatch = '';
  if (status === 'Approved') {
    if (kind === 'nic' && isDriverLicense(type) && !isIdCard(type) && !nums.nic) {
      mismatch = 'That looks like a driving licence. Upload your NIC in this slot.';
    }
    if (kind === 'license' && isIdCard(type) && !isDriverLicense(type) && !nums.licenseId) {
      mismatch = 'That looks like a NIC. Upload your driving licence in this slot.';
    }
  }
  let approved = status === 'Approved' && !mismatch;
  if (approved && kind === 'nic' && !nums.nic) approved = false;
  if (approved && kind === 'license' && !(nums.licenseId || nums.nic)) approved = false;
  const licenseId = nums.licenseId || (kind === 'license' && nums.nic ? nums.nic : '');
  return {
    ok: true,
    approved,
    status,
    kind,
    nic: nums.nic || '',
    licenseId: licenseId || '',
    name: String((iv && (iv.full_name || iv.fullName)) || '').slice(0, 80),
    documentType: String((iv && iv.document_type) || ''),
    requestId: String(requestId || ''),
    message: userMessage(kind, approved ? 'Approved' : status, iv, mismatch),
  };
}

function detailText(data) {
  if (!data) return '';
  if (typeof data.detail === 'string') return data.detail;
  if (data.detail && typeof data.detail === 'object') {
    return String(data.detail.message || data.detail.error || data.detail.code || '');
  }
  if (typeof data.error === 'string') return data.error;
  if (data.error && data.error.message) return String(data.error.message);
  if (typeof data.message === 'string') return data.message;
  return '';
}

function diditErrorMessage(httpStatus, data) {
  const raw = detailText(data);
  const d = raw.toLowerCase();
  if (/credit|balance|billing|not-enough/.test(d)) return 'ID check has no credits. Add Didit credits, then try again.';
  if (httpStatus === 429) return 'Too many checks. Wait a minute and try again.';
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 402) {
    return 'Didit blocked this check (403). Use a secret API key with ID Verification access, no IP lock, and enough credits.';
  }
  if (raw && raw.length < 160 && !/api[- ]?key/i.test(raw)) {
    if (/image|file|front|back|document/i.test(d)) return 'Could not read this card. Use a clearer front and back photo.';
  }
  return 'Could not verify this document. Try again.';
}

async function verifyIdDocument(body) {
  const mod = await import('../functions/_lib/id-verify.js');
  return mod.verifyIdDocument(process.env, body);
}

async function verifyLiveness(body) {
  const mod = await import('../functions/_lib/id-verify.js');
  return mod.verifyLiveness(process.env, body);
}

function configured() {
  return !!apiKey();
}

function nodeHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach((k) => {
    const v = h[k];
    if (v == null) return;
    out[k] = Array.isArray(v) ? v.join(',') : String(v);
  });
  return out;
}

async function handleWebhook(raw, headers) {
  const mod = await import('../functions/_lib/didit-webhook.js');
  const req = new Request('https://quickbite-2ao.pages.dev/webhooks/didit', {
    method: 'POST',
    headers: nodeHeaders(headers),
    body: raw == null ? '' : String(raw),
  });
  const res = await mod.handleDiditWebhook(process.env, req);
  let body = {};
  try { body = await res.json(); } catch (_) { body = { received: true, provider: 'didit' }; }
  return { status: res.status, body };
}

module.exports = { verifyIdDocument, verifyLiveness, configured, handleWebhook };
