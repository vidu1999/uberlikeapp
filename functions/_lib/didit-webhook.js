const SESSION_DECISION = 'https://verification.didit.me/v3/session/';
const RIDER_DOCS_MARK = 'QBDOCS:';
const seenEvents = new Map();

export function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Signature-V2, X-Signature-Simple, X-Timestamp, X-Signature-Previous, X-Signature-V2-Previous, X-Signature-Simple-Previous',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: headers() });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: headers() });
}

export function secretsFromEnv(env) {
  const cur = String((env && (env.DIDIT_WEBHOOK_SECRET || env.DIDIT_WHSEC)) || '').trim();
  const prev = String((env && (env.DIDIT_WEBHOOK_SECRET_PREVIOUS || env.DIDIT_WHSEC_PREVIOUS)) || '').trim();
  const out = [];
  if (cur) out.push(cur);
  if (prev && prev !== cur) out.push(prev);
  return out;
}

export function apiKeyFromEnv(env) {
  return String((env && (env.DIDIT_API_KEY || env.ID_VERIFY_API_KEY)) || '').trim();
}

function hexEqual(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (x.length !== y.length || !x.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}

function headerVal(request, name) {
  if (!request || !request.headers) return '';
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || '';
}

function headerList(request, name) {
  return [headerVal(request, name), headerVal(request, name + '-Previous')].filter(Boolean);
}

function canon(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) return 'null';
    if (Math.floor(value) === value) return String(value);
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canon(value[k]); }).join(',') + '}';
  }
  return 'null';
}

async function hmacHex(sec, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
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

function numbersFromIv(iv) {
  const docNo = String((iv && (iv.document_number || iv.documentNumber)) || '');
  const personal = String((iv && (iv.personal_number || iv.personalNumber)) || '');
  const nic = nicFromText(personal) || nicFromText(docNo);
  const licenseId = licenseFromText(docNo, nic) || licenseFromText(personal, nic);
  return { nic: nic, licenseId: licenseId };
}

function rememberEvent(id) {
  const key = String(id || '');
  if (!key) return false;
  const now = Date.now();
  if (seenEvents.has(key)) return true;
  seenEvents.set(key, now);
  if (seenEvents.size > 400) {
    seenEvents.forEach(function (ts, k) {
      if (now - ts > 60 * 60 * 1000) seenEvents.delete(k);
    });
  }
  return false;
}

export async function verifyDiditSignature(raw, request, secrets) {
  const body = String(raw || '');
  if (!secrets || !secrets.length) {
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch (_) { parsed = {}; }
    return { ok: true, mode: 'unsigned', event: parsed };
  }
  const ts = Number(headerVal(request, 'X-Timestamp'));
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, mode: 'timestamp' };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return { ok: false, mode: 'timestamp' };

  const v2s = headerList(request, 'X-Signature-V2');
  const v1s = headerList(request, 'X-Signature');
  const simples = headerList(request, 'X-Signature-Simple');

  let parsed = null;
  try { parsed = body ? JSON.parse(body) : {}; } catch (_) { parsed = null; }
  const canonical = parsed ? canon(parsed) : '';
  const simpleLine = parsed
    ? [parsed.timestamp || ts, parsed.session_id || '', parsed.status || '', parsed.webhook_type || ''].join(':')
    : '';

  for (let i = 0; i < secrets.length; i++) {
    const sec = secrets[i];
    if (v2s.length) {
      const hCanon = canonical ? await hmacHex(sec, canonical) : '';
      const hRaw = await hmacHex(sec, body);
      for (let j = 0; j < v2s.length; j++) {
        if ((hCanon && hexEqual(v2s[j], hCanon)) || hexEqual(v2s[j], hRaw)) return { ok: true, mode: 'v2', event: parsed };
      }
    }
    if (v1s.length) {
      const hRaw = await hmacHex(sec, body);
      for (let j = 0; j < v1s.length; j++) {
        if (hexEqual(v1s[j], hRaw)) return { ok: true, mode: 'v1', event: parsed };
      }
    }
    if (simples.length && simpleLine) {
      const hSimple = await hmacHex(sec, simpleLine);
      for (let j = 0; j < simples.length; j++) {
        if (hexEqual(simples[j], hSimple)) return { ok: true, mode: 'simple', event: parsed };
      }
    }
  }
  return { ok: false, mode: 'signature', event: parsed };
}

async function refetchDecision(env, sessionId) {
  const key = apiKeyFromEnv(env);
  const id = String(sessionId || '').trim();
  if (!key || !id) return null;
  try {
    const res = await fetch(SESSION_DECISION + encodeURIComponent(id) + '/decision/', {
      headers: { 'x-api-key': key, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function parseDocs(address) {
  const addr = String(address || '');
  const out = {
    nic: '', licenseId: '', nicPhoto: '', nicPhotoBack: '',
    licensePhoto: '', licensePhotoBack: '', facePhoto: '',
    plate: '', vehicleType: 'Motorcycle', regPhoto: '', registered: false,
    nicKyc: '', licenseKyc: '', nicKycId: '', licenseKycId: '', nicName: '', licenseName: '',
    amlKyc: '', amlHits: 0, amlRequestId: '',
    livenessKyc: '', livenessScore: null, livenessRequestId: '',
    kycSession: '', kycEvent: '', avatar: '',
  };
  if (addr.indexOf(RIDER_DOCS_MARK) !== 0) return out;
  try {
    const j = JSON.parse(addr.slice(RIDER_DOCS_MARK.length));
    if (!j || typeof j !== 'object') return out;
    Object.keys(out).forEach(function (k) {
      if (j[k] != null) out[k] = j[k];
    });
    out.registered = j.registered === true || j.registered === '1';
  } catch (_) {}
  return out;
}

function applyEventToDocs(docs, event) {
  const status = String((event && event.status) || '');
  const decision = (event && event.decision && typeof event.decision === 'object') ? event.decision : {};
  const ivs = Array.isArray(decision.id_verifications) ? decision.id_verifications : [];
  docs.kycSession = String((event && event.session_id) || docs.kycSession || '');
  docs.kycEvent = String((event && event.event_id) || docs.kycEvent || '');

  function setNic(iv, st) {
    const n = numbersFromIv(iv || {});
    if (n.nic) docs.nic = n.nic;
    if (iv && iv.full_name) docs.nicName = String(iv.full_name).slice(0, 80);
    if (st === 'Approved') docs.nicKyc = 'approved';
    else if (st === 'Declined') docs.nicKyc = 'declined';
    else if (st === 'In Review') docs.nicKyc = 'pending_review';
    else if (st === 'In Progress' || st === 'Resubmitted') docs.nicKyc = 'in_progress';
  }
  function setLic(iv, st) {
    const n = numbersFromIv(iv || {});
    if (n.licenseId || n.nic) docs.licenseId = n.licenseId || n.nic;
    if (iv && iv.full_name) docs.licenseName = String(iv.full_name).slice(0, 80);
    if (st === 'Approved') docs.licenseKyc = 'approved';
    else if (st === 'Declined') docs.licenseKyc = 'declined';
    else if (st === 'In Review') docs.licenseKyc = 'pending_review';
    else if (st === 'In Progress' || st === 'Resubmitted') docs.licenseKyc = 'in_progress';
  }

  for (let i = 0; i < ivs.length; i++) {
    const iv = ivs[i] || {};
    const t = String(iv.document_type || '').toLowerCase();
    const st = String(iv.status || status);
    if (/identity|id card|national/.test(t)) setNic(iv, st);
    else if (/driver|licence|license/.test(t)) setLic(iv, st);
    else {
      const n = numbersFromIv(iv);
      if (n.nic) setNic(iv, st);
      if (n.licenseId) setLic(iv, st);
    }
  }

  const lives = Array.isArray(decision.liveness_checks) ? decision.liveness_checks
    : (decision.liveness ? [decision.liveness] : []);
  for (let i = 0; i < lives.length; i++) {
    const st = String((lives[i] && lives[i].status) || status);
    if (st === 'Approved') docs.livenessKyc = 'approved';
    else if (st === 'Declined' && docs.livenessKyc !== 'approved') docs.livenessKyc = 'declined';
  }
  if (status === 'Approved') {
    docs.nicKyc = 'approved';
    docs.licenseKyc = 'approved';
    docs.livenessKyc = 'approved';
    docs.nicPhoto = '';
    docs.nicPhotoBack = '';
    docs.licensePhoto = '';
    docs.licensePhotoBack = '';
    docs.facePhoto = '';
  }

  if (!ivs.length) {
    if (status === 'Approved') {
      docs.nicKyc = 'approved';
      docs.licenseKyc = 'approved';
    } else if (status === 'Declined') {
      if (docs.nicKyc !== 'approved') docs.nicKyc = 'declined';
      if (docs.licenseKyc !== 'approved') docs.licenseKyc = 'declined';
    } else if (status === 'In Review') {
      if (docs.nicKyc !== 'approved') docs.nicKyc = 'pending_review';
      if (docs.licenseKyc !== 'approved') docs.licenseKyc = 'pending_review';
    } else if (status === 'Expired' || status === 'Kyc Expired') {
      if (docs.nicKyc !== 'approved') docs.nicKyc = 'expired';
      if (docs.licenseKyc !== 'approved') docs.licenseKyc = 'expired';
    } else if (status === 'Resubmitted') {
      if (docs.nicKyc !== 'approved') docs.nicKyc = 'in_progress';
      if (docs.licenseKyc !== 'approved') docs.licenseKyc = 'in_progress';
    }
  }
  return docs;
}

function firstHttpUrl(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (let i = 0; i < keys.length; i++) {
    const v = String(obj[keys[i]] || '').trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  return '';
}

const FACE_KEYS = [
  'reference_image', 'referenceImage', 'face_image', 'faceImage',
  'selfie', 'image_url', 'imageUrl', 'portrait', 'photo', 'image',
];

function faceUrlFromDecision(decision) {
  if (!decision || typeof decision !== 'object') return '';
  const lives = Array.isArray(decision.liveness_checks) ? decision.liveness_checks
    : (decision.liveness ? [decision.liveness] : []);
  for (let i = 0; i < lives.length; i++) {
    const u = firstHttpUrl(lives[i], FACE_KEYS);
    if (u) return u;
  }
  const faces = Array.isArray(decision.face_matches) ? decision.face_matches : [];
  for (let i = 0; i < faces.length; i++) {
    const u = firstHttpUrl(faces[i], FACE_KEYS);
    if (u) return u;
  }
  const ivs = Array.isArray(decision.id_verifications) ? decision.id_verifications : [];
  for (let i = 0; i < ivs.length; i++) {
    const u = firstHttpUrl(ivs[i], FACE_KEYS);
    if (u) return u;
  }
  return firstHttpUrl(decision, FACE_KEYS);
}

async function persistRiderAvatar(env, riderId, url) {
  const src = String(url || '').trim();
  if (!/^https?:\/\//i.test(src)) return '';
  const base = String((env && env.SUPABASE_URL) || '').replace(/\/$/, '');
  const key = String((env && (env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY)) || '').trim();
  if (!base || !key) return src;
  try {
    const img = await fetch(src);
    if (!img.ok) return src;
    const buf = await img.arrayBuffer();
    if (!buf || buf.byteLength < 80 || buf.byteLength > 6 * 1024 * 1024) return src;
    const id = String(riderId || 'rider').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 72) || 'rider';
    const path = 'rider/' + id + '-face.jpg';
    const headers = {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    };
    try {
      await fetch(base + '/storage/v1/bucket', {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: 'qb-images', name: 'qb-images', public: true, fileSizeLimit: 2097152 }),
      });
    } catch (_) {}
    let res = await fetch(base + '/storage/v1/object/qb-images/' + path, { method: 'POST', headers: headers, body: buf });
    if (!res.ok) {
      res = await fetch(base + '/storage/v1/object/qb-images/' + path, { method: 'PUT', headers: headers, body: buf });
    }
    if (!res.ok) return src;
    return base + '/storage/v1/object/public/qb-images/' + path;
  } catch (_) {
    return src;
  }
}

async function sb(env, path, method, body) {
  const base = String((env && env.SUPABASE_URL) || '').replace(/\/$/, '');
  const key = String((env && (env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY)) || '').trim();
  if (!base || !key) return null;
  const res = await fetch(base + '/rest/v1/' + path, {
    method: method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  if (method === 'GET') {
    try { return await res.json(); } catch (_) { return null; }
  }
  return true;
}

export async function applyDiditEvent(env, event) {
  if (!event || typeof event !== 'object') return { applied: false };
  const type = String(event.webhook_type || event.type || '');
  if (type && type !== 'status.updated' && type !== 'data.updated') return { applied: false, webhook_type: type };
  const riderId = String(event.vendor_data || '').trim();
  if (!riderId || riderId === 'rider') return { applied: false };
  const rows = await sb(env, 'accounts?id=eq.' + encodeURIComponent(riderId) + '&select=id,role,address,vehicle', 'GET');
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return { applied: false };
  const role = String(row.role || '').toLowerCase();
  if (role && role !== 'rider' && role !== 'driver') return { applied: false };
  const docs = applyEventToDocs(parseDocs(row.address), event);
  const faceSrc = faceUrlFromDecision((event && event.decision) || event);
  if (faceSrc && String(event.status || '') === 'Approved') {
    const stored = await persistRiderAvatar(env, row.id, faceSrc);
    if (stored) docs.avatar = stored;
  }
  const patch = { address: RIDER_DOCS_MARK + JSON.stringify(docs) };
  if (docs.plate) patch.vehicle = (docs.vehicleType || 'Motorcycle') + ' · ' + docs.plate;
  const ok = await sb(env, 'accounts?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch);
  return { applied: !!ok, riderId: row.id, nicKyc: docs.nicKyc, licenseKyc: docs.licenseKyc };
}

export async function handleDiditWebhook(env, request, waitUntil) {
  const raw = await request.text();
  const secrets = secretsFromEnv(env);
  const verified = await verifyDiditSignature(raw, request, secrets);
  if (!verified.ok) {
    return json(401, { ok: false, received: false, error: verified.mode || 'signature' });
  }
  let event = verified.event;
  if (!event || typeof event !== 'object') {
    try { event = raw ? JSON.parse(raw) : {}; } catch (_) { event = {}; }
  }
  if (verified.mode === 'simple' && event.session_id) {
    const live = await refetchDecision(env, event.session_id);
    if (live && typeof live === 'object') {
      event.decision = live.decision || live;
      if (live.status) event.status = live.status;
    } else {
      return json(200, { received: true, provider: 'didit', warning: 'refetch' });
    }
  }
  const eventId = String(event.event_id || [event.session_id, event.status, event.webhook_type].join(':'));
  const dup = rememberEvent(eventId);
  const type = String(event.webhook_type || event.type || 'status.updated');
  const status = String(event.status || '');
  if (!dup && secrets.length && verified.mode !== 'unsigned' && (type === 'status.updated' || type === 'data.updated')) {
    const job = applyDiditEvent(env, event);
    if (typeof waitUntil === 'function') waitUntil(job);
    else await job;
  }
  return json(200, {
    received: true,
    provider: 'didit',
    webhook_type: type,
    status: status || null,
    session_id: event.session_id || null,
    event_id: event.event_id || null,
  });
}
