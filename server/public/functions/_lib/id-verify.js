import {
  diditAmlForId,
  diditCreateSession,
  diditCreateWorkflow,
  diditErrorMessage,
  diditIdVerification,
  diditKey,
  diditListWorkflows,
  diditLooksRetryableWorkflow,
  diditPassiveLiveness,
  diditPublishWorkflow,
  diditSessionDecision,
} from './didit.js';

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
  return diditKey(env);
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

export async function verifyIdDocument(env, body) {
  return {
    status: 400,
    body: {
      ok: false,
      useSession: true,
      message: 'Use Start free ID & face check. Photo ID API is paid and has no free credits.',
    },
  };
}

async function verifyIdDocumentPaid(env, body) {
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
  const vendorData = String((body && body.riderId) || 'rider').slice(0, 64);
  let sent;
  try {
    sent = await diditIdVerification(env, {
      front: partBlob(front),
      back: partBlob(back),
      vendorData: vendorData,
      liveness: true,
      save: true,
    });
  } catch (_) {
    return { status: 502, body: { ok: false, message: 'ID check is unavailable. Try again.' } };
  }
  if (!sent.ok) {
    const code = sent.status === 400 ? 400 : (sent.status === 403 ? 403 : 502);
    return { status: code, body: { ok: false, message: diditErrorMessage(sent.status, sent.data) } };
  }
  const data = sent.data || {};
  const iv = data.id_verification || data.idVerification || data;
  const out = publicResult(kind, iv, data.request_id || data.requestId || (iv && iv.request_id));
  if (out.approved) {
    try {
      const aml = await diditAmlForId(env, iv, vendorData);
      const row = aml && aml.data && (aml.data.aml || aml.data);
      if (row && typeof row === 'object') {
        out.amlStatus = String(row.status || '').toLowerCase();
        out.amlHits = Number(row.total_hits || 0);
        out.amlRequestId = String((aml.data && aml.data.request_id) || '');
      }
    } catch (_) {}
  }
  return { status: 200, body: out };
}

function warningCodes(list) {
  return (Array.isArray(list) ? list : []).map(function (w) {
    if (!w) return '';
    if (typeof w === 'string') return w.toUpperCase();
    return String(w.risk || w.code || w.log_type || w.message || '').toUpperCase();
  }).join(' ');
}

function livenessMessage(status, warnings) {
  const codes = warningCodes(warnings);
  if (/NO_FACE_DETECTED/.test(codes)) return 'No face found. Take a selfie with your face in the centre.';
  if (/MULTIPLE_FACES/.test(codes)) return 'More than one face. Take a selfie of only you.';
  if (/LIVENESS_FACE_ATTACK|LOW_LIVENESS_SCORE/.test(codes)) return 'This does not look like a live selfie. Hold the phone in front of your face and try again.';
  if (/FACE_IN_BLOCKLIST|DUPLICATED_FACE/.test(codes)) return 'This face cannot be used. Contact support.';
  if (status === 'Approved') return 'Face check passed  ✓';
  if (status === 'Declined') return 'Face check was not accepted. Take a clearer selfie.';
  if (status === 'In Review') return 'Face check is reviewing. Try Save again in a minute.';
  return 'Take a clear selfie of your face.';
}

export async function verifyLiveness(env, body) {
  return {
    status: 400,
    body: {
      ok: false,
      useSession: true,
      message: 'Use Start free ID & face check. Selfie API is paid and has no free credits.',
    },
  };
}

async function verifyLivenessPaid(env, body) {
  const key = apiKeyFromEnv(env);
  if (!key) {
    return { status: 503, body: { ok: false, configured: false, message: 'ID verification is not set up yet.' } };
  }
  let face;
  try {
    face = await imagePart(body && (body.face || body.user_image || body.image));
  } catch (e) {
    return { status: 400, body: { ok: false, message: (e && e.message) || 'Take a selfie of your face.' } };
  }
  if (face.bytes && face.bytes.length > 5 * 1024 * 1024) {
    return { status: 400, body: { ok: false, message: 'Selfie is too large. Try a smaller photo.' } };
  }
  const vendorData = String((body && body.riderId) || 'rider').slice(0, 64);
  let sent;
  try {
    sent = await diditPassiveLiveness(env, {
      userImage: partBlob(face),
      vendorData: vendorData,
      save: true,
    });
  } catch (_) {
    return { status: 502, body: { ok: false, message: 'Face check is unavailable. Try again.' } };
  }
  if (!sent.ok) {
    const code = sent.status === 400 ? 400 : (sent.status === 403 ? 403 : 502);
    return { status: code, body: { ok: false, message: diditErrorMessage(sent.status, sent.data) } };
  }
  const data = sent.data || {};
  const live = data.liveness || data.passive_liveness || data;
  const status = String((live && live.status) || '');
  const warnings = (live && live.warnings) || [];
  const codes = warningCodes(warnings);
  let approved = status === 'Approved';
  if (/LIVENESS_FACE_ATTACK|LOW_LIVENESS_SCORE|FACE_IN_BLOCKLIST|DUPLICATED_FACE/.test(codes)) approved = false;
  return {
    status: 200,
    body: {
      ok: true,
      approved: approved,
      status: status,
      method: String((live && live.method) || 'PASSIVE'),
      score: live && live.score != null ? Number(live.score) : null,
      requestId: String(data.request_id || live.request_id || ''),
      message: livenessMessage(approved ? 'Approved' : status, warnings),
    },
  };
}

let cachedWorkflowId = '';

function workflowIdFromEnv(env) {
  let fromProc = '';
  try {
    if (typeof process !== 'undefined' && process.env) fromProc = process.env.DIDIT_WORKFLOW_ID || '';
  } catch (_) {}
  return String((env && env.DIDIT_WORKFLOW_ID) || fromProc || '').trim();
}

function workflowIdOf(w) {
  return String((w && (w.workflow_id || w.id || w.uuid || w.settings_uuid)) || '').trim();
}

function workflowIsPaid(w) {
  if (!w || typeof w !== 'object') return false;
  if (w.is_aml_enabled === true || w.is_nfc_enabled === true) return true;
  if (w.is_phone_verification_enabled === true || w.is_email_verification_enabled === true) return true;
  const feats = String(w.features || '');
  const blob = feats + ' ' + JSON.stringify(w.workflow_graph || w.nodes || []).slice(0, 2000);
  return /AML|NFC|PROOF_OF_ADDRESS|PHONE_VERIFICATION|EMAIL_VERIFICATION|DATABASE_VALIDATION|WHITE_LABEL|ACTIVE_3D/.test(blob.toUpperCase());
}

function workflowIsFreeKyc(w) {
  if (!w || w.is_archived === true) return false;
  if (workflowIsPaid(w)) return false;
  const label = String(w.workflow_label || w.label || w.name || '');
  if (/free|quickbite|rider/i.test(label)) return true;
  if (w.is_aml_enabled === false && w.is_liveness_enabled === true) return true;
  const feats = String(w.features || '').toUpperCase();
  if (feats && /AML|NFC|PHONE|EMAIL|POA/.test(feats)) return false;
  if (feats && /OCR|LIVENESS|ID_VERIFICATION/.test(feats)) return true;
  return false;
}

function listedWorkflows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.workflows || data.results || data.items || data.data || [];
}

async function createFreeWorkflow(env) {
  const bodies = [
    {
      workflow_label: 'QuickBite Free KYC',
      workflow_type: 'kyc',
      features: [
        { feature: 'OCR' },
        { feature: 'LIVENESS' },
        { feature: 'FACE_MATCH' },
      ],
    },
    {
      workflow_label: 'QuickBite Free KYC',
      workflow_type: 'kyc',
      features: [
        { feature: 'OCR' },
        { feature: 'LIVENESS' },
        { feature: 'FACE_MATCH' },
        { feature: 'IP' },
      ],
    },
    {
      workflow_label: 'QuickBite Free KYC',
      workflow_type: 'kyc',
      features: [
        { feature: 'OCR' },
        { feature: 'LIVENESS' },
      ],
    },
  ];
  let last = { ok: false, status: 502, data: {} };
  for (let i = 0; i < bodies.length; i++) {
    last = await diditCreateWorkflow(env, bodies[i]);
    const id = workflowIdOf(last.data);
    if (last.ok && id) {
      try { await diditPublishWorkflow(env, id); } catch (_) {}
      return id;
    }
  }
  throw new Error(diditErrorMessage(last.status, last.data) || 'Could not create a free Didit workflow.');
}

async function ensureWorkflowId(env) {
  const fromEnv = workflowIdFromEnv(env);
  if (fromEnv) return fromEnv;
  if (cachedWorkflowId) return cachedWorkflowId;
  const listed = await diditListWorkflows(env);
  const rows = listedWorkflows(listed && listed.data);
  let found = '';
  for (let i = 0; i < rows.length; i++) {
    const w = rows[i] || {};
    const id = workflowIdOf(w);
    if (id && workflowIsFreeKyc(w)) {
      found = id;
      break;
    }
  }
  if (found) {
    cachedWorkflowId = found;
    return found;
  }
  const created = await createFreeWorkflow(env);
  cachedWorkflowId = created;
  return created;
}

function publicSessionDecision(data) {
  const row = data || {};
  const decision = row.decision && typeof row.decision === 'object' ? row.decision : row;
  const status = String(row.status || decision.status || '');
  const ivs = Array.isArray(decision.id_verifications) ? decision.id_verifications : [];
  const lives = Array.isArray(decision.liveness_checks) ? decision.liveness_checks
    : (decision.liveness ? [decision.liveness] : []);
  let nic = '';
  let licenseId = '';
  let name = '';
  let nicKyc = '';
  let licenseKyc = '';
  for (let i = 0; i < ivs.length; i++) {
    const iv = ivs[i] || {};
    const nums = pickNumbers(iv);
    const t = docTypeOf(iv);
    const st = String(iv.status || status);
    const kyc = st === 'Approved' ? 'approved' : (st === 'Declined' ? 'declined' : String(st || '').toLowerCase());
    if (isIdCard(t) || nums.nic) {
      nic = nums.nic || nic;
      nicKyc = kyc || nicKyc;
      if (iv.full_name) name = String(iv.full_name);
    }
    if (isDriverLicense(t) || nums.licenseId) {
      licenseId = nums.licenseId || licenseId;
      licenseKyc = kyc || licenseKyc;
      if (iv.full_name) name = name || String(iv.full_name);
    }
  }
  let livenessKyc = '';
  for (let i = 0; i < lives.length; i++) {
    const st = String((lives[i] && lives[i].status) || status);
    if (st === 'Approved') livenessKyc = 'approved';
    else if (st === 'Declined' && livenessKyc !== 'approved') livenessKyc = 'declined';
  }
  if (status === 'Approved') {
    nicKyc = 'approved';
    licenseKyc = 'approved';
    livenessKyc = 'approved';
  }
  const face = lives[0] || {};
  const facePhoto = String(
    face.reference_image || face.referenceImage || face.face_image || face.faceImage
    || face.selfie || face.portrait || face.image_url || face.imageUrl || face.photo || face.image || ''
  );
  let message = 'Finish the ID check on Didit, then you come back here.';
  if (status === 'Approved') message = 'NIC, licence, and selfie verified  ✓';
  else if (status === 'Declined') message = 'ID check was not accepted. Try again with the real card.';
  else if (status === 'In Review') message = 'ID check is reviewing. Try Save again in a minute.';
  return {
    ok: true,
    approved: status === 'Approved',
    status: status,
    nic: nic,
    licenseId: licenseId,
    name: name,
    nicKyc: nicKyc,
    licenseKyc: licenseKyc,
    livenessKyc: livenessKyc,
    facePhoto: facePhoto,
    sessionId: String(row.session_id || decision.session_id || ''),
    message: message,
  };
}

export async function startRiderKycSession(env, body, origin) {
  if (!apiKeyFromEnv(env)) {
    return { status: 503, body: { ok: false, configured: false, message: 'ID verification is not set up yet.' } };
  }
  const riderId = String((body && body.riderId) || '').slice(0, 64);
  if (!riderId) return { status: 400, body: { ok: false, message: 'Sign in first.' } };
  let workflowId;
  try {
    workflowId = await ensureWorkflowId(env);
  } catch (e) {
    return { status: 502, body: { ok: false, message: (e && e.message) || 'Could not start free ID check.' } };
  }
  const callback = 'https://quickbite-2ao.pages.dev/rider.html?didit=done';
  async function openSession(wf) {
    const attempts = [
      { workflow_id: wf, vendor_data: riderId, callback: callback },
      { workflow_id: wf, vendor_data: riderId },
    ];
    let last = { ok: false, status: 502, data: {} };
    for (let i = 0; i < attempts.length; i++) {
      last = await diditCreateSession(env, attempts[i]);
      if (last.ok) return last;
    }
    return last;
  }
  let sent = await openSession(workflowId);
  const blob = JSON.stringify((sent && sent.data) || {}).toLowerCase();
  const needFree = !sent.ok && (
    /credit|balance|billing|not-enough|insufficient/.test(blob) ||
    diditLooksRetryableWorkflow(sent.data)
  );
  if (needFree) {
    try {
      const freeId = await createFreeWorkflow(env);
      cachedWorkflowId = freeId;
      sent = await openSession(freeId);
    } catch (e) {
      return { status: sent.status || 400, body: { ok: false, message: (e && e.message) || diditErrorMessage(sent.status, sent.data) } };
    }
  }
  if (!sent.ok) {
    const code = sent.status === 400 ? 400 : (sent.status === 403 ? 403 : 502);
    return { status: code, body: { ok: false, message: diditErrorMessage(sent.status, sent.data) } };
  }
  const data = sent.data || {};
  return {
    status: 200,
    body: {
      ok: true,
      free: true,
      sessionId: String(data.session_id || data.sessionId || ''),
      url: String(data.url || data.verification_url || ''),
      status: String(data.status || 'Not Started'),
    },
  };
}

export async function riderKycDecision(env, sessionId) {
  if (!apiKeyFromEnv(env)) {
    return { status: 503, body: { ok: false, message: 'ID verification is not set up yet.' } };
  }
  const id = String(sessionId || '').trim();
  if (!id) return { status: 400, body: { ok: false, message: 'Missing session.' } };
  const sent = await diditSessionDecision(env, id);
  if (!sent.ok) {
    const code = sent.status === 403 ? 403 : 502;
    return { status: code, body: { ok: false, message: diditErrorMessage(sent.status, sent.data) } };
  }
  const out = publicSessionDecision(sent.data || {});
  out.sessionId = out.sessionId || id;
  return { status: 200, body: out };
}
