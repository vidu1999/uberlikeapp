const DIDIT_URL = 'https://verification.didit.me/v3/id-verification/';
const MAX_DATA_CHARS = 1800000;

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

export function apiKeyFromEnv(env) {
  return String((env && (env.DIDIT_API_KEY || env.ID_VERIFY_API_KEY)) || '')
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
  const b64 = m[2].replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1] || 'image/jpeg', bytes: bytes };
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
    if (!d || !d.bytes || !d.bytes.length) throw new Error('Could not read this photo.');
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
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 80) throw new Error('Could not open this photo.');
  if (buf.byteLength > 6 * 1024 * 1024) throw new Error('Photo is too large. Try a smaller photo.');
  const type = String(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return { type: type.indexOf('image/') === 0 ? type : 'image/jpeg', bytes: new Uint8Array(buf) };
}

function partBlob(part) {
  return new Blob([part.bytes], { type: part.type || 'image/jpeg' });
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
    .map(function (v) { return String(v || ''); }).join(' ');
  const blob = [docNo, personal, extraBits, iv && iv.full_name].join(' ');
  const nic = nicFromText(personal) || nicFromText(docNo) || nicFromText(blob);
  const licenseId = licenseFromText(docNo, nic) || licenseFromText(personal, nic) || licenseFromText(blob, nic);
  return { nic: nic, licenseId: licenseId, documentNumber: docNo, personalNumber: personal };
}

function warningText(iv) {
  const warns = iv && Array.isArray(iv.warnings) ? iv.warnings : [];
  return warns.map(function (w) {
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
    approved: approved,
    status: status,
    kind: kind,
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

export async function verifyIdDocument(env, body) {
  const key = apiKeyFromEnv(env);
  if (!key) {
    return {
      status: 503,
      body: { ok: false, configured: false, message: 'ID verification is not set up yet.' },
    };
  }
  const kind = String((body && body.kind) || '').toLowerCase();
  if (kind !== 'nic' && kind !== 'license') {
    return { status: 400, body: { ok: false, message: 'Choose NIC or driving licence.' } };
  }
  let front;
  let back;
  try {
    front = await imagePart(body.front);
    back = await imagePart(body.back);
  } catch (e) {
    return { status: 400, body: { ok: false, message: (e && e.message) || 'Upload front and back photos.' } };
  }
  async function postDidit(liveness) {
    const fd = new FormData();
    fd.append('front_image', partBlob(front), 'front.jpg');
    fd.append('back_image', partBlob(back), 'back.jpg');
    fd.append('perform_document_liveness', liveness ? 'true' : 'false');
    fd.append('save_api_request', 'true');
    fd.append('vendor_data', String((body && body.riderId) || 'rider').slice(0, 64));
    return fetch(DIDIT_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, Accept: 'application/json' },
      body: fd,
    });
  }
  let res;
  try {
    res = await postDidit(true);
    if (res.status === 403) {
      const retry = await postDidit(false);
      if (retry && retry.status !== 403) res = retry;
    }
  } catch (_) {
    return { status: 502, body: { ok: false, message: 'ID check is unavailable. Try again.' } };
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) {
    const code = res.status === 400 ? 400 : (res.status === 403 ? 403 : 502);
    return { status: code, body: { ok: false, message: diditErrorMessage(res.status, data) } };
  }
  const iv = data.id_verification || data.idVerification || data;
  const out = publicResult(kind, iv, data.request_id || data.requestId || (iv && iv.request_id));
  return { status: 200, body: out };
}
