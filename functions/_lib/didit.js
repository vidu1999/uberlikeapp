const DIDIT_BASE = 'https://verification.didit.me/v3';

export const DIDIT_STANDALONE = {
  idVerification: 'POST /v3/id-verification/',
  poa: 'POST /v3/poa/',
  databaseValidation: 'POST /v3/database-validation/',
  documentAi: 'POST /v3/document-ai/',
  passiveLiveness: 'POST /v3/passive-liveness/',
  faceMatch: 'POST /v3/face-match/',
  faceSearch: 'POST /v3/face-search/',
  ageEstimation: 'POST /v3/age-estimation/',
  aml: 'POST /v3/aml/',
  kybSearch: 'POST /v3/kyb/search/',
  kybSelect: 'POST /v3/kyb/select/',
  kybShareholders: 'POST /v3/kyb/shareholders/',
  kybUbo: 'POST /v3/kyb/ubo/',
  emailSend: 'POST /v3/email/send/',
  emailCheck: 'POST /v3/email/check/',
  phoneSend: 'POST /v3/phone/send/',
  phoneCheck: 'POST /v3/phone/check/',
};

export function diditKey(env) {
  let fromProc = '';
  try {
    if (typeof process !== 'undefined' && process.env) {
      fromProc = process.env.DIDIT_API_KEY || process.env.ID_VERIFY_API_KEY || '';
    }
  } catch (_) {}
  return String((env && (env.DIDIT_API_KEY || env.ID_VERIFY_API_KEY)) || fromProc || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, '');
}

export function diditConfigured(env) {
  return !!diditKey(env);
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

export function diditErrorMessage(httpStatus, data) {
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

export async function diditRequest(env, path, opts) {
  const key = diditKey(env);
  if (!key) return { ok: false, status: 503, data: { detail: 'ID verification is not set up yet.' } };
  const options = opts || {};
  const headers = Object.assign({ 'x-api-key': key, Accept: 'application/json' }, options.headers || {});
  let body = options.body;
  if (options.json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const url = path.indexOf('http') === 0 ? path : DIDIT_BASE + path;
  let res;
  try {
    res = await fetch(url, { method: options.method || 'POST', headers: headers, body: body });
  } catch (_) {
    return { ok: false, status: 502, data: { detail: 'ID check is unavailable. Try again.' } };
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, status: res.status, data: data };
}

function filePart(blob, name) {
  if (!blob) return null;
  if (typeof File === 'function' && blob instanceof File) return blob;
  return blob;
}

export async function diditIdVerification(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('front_image', filePart(o.front), o.frontName || 'front.jpg');
  if (o.back) fd.append('back_image', filePart(o.back), o.backName || 'back.jpg');
  fd.append('perform_document_liveness', o.liveness === false ? 'false' : 'true');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  let out = await diditRequest(env, '/id-verification/', { body: fd });
  if (out.status === 403 && o.liveness !== false) {
    const fd2 = new FormData();
    fd2.append('front_image', filePart(o.front), o.frontName || 'front.jpg');
    if (o.back) fd2.append('back_image', filePart(o.back), o.backName || 'back.jpg');
    fd2.append('perform_document_liveness', 'false');
    fd2.append('save_api_request', 'true');
    if (o.vendorData) fd2.append('vendor_data', String(o.vendorData).slice(0, 64));
    const retry = await diditRequest(env, '/id-verification/', { body: fd2 });
    if (retry.status !== 403) out = retry;
  }
  return out;
}

export async function diditPoa(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('document', filePart(o.document), o.fileName || 'document.jpg');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/poa/', { body: fd });
}

export async function diditDatabaseValidation(env, payload) {
  return diditRequest(env, '/database-validation/', { json: payload || {} });
}

export async function diditDocumentAi(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('document', filePart(o.document), o.fileName || 'document.jpg');
  fd.append('fields', typeof o.fields === 'string' ? o.fields : JSON.stringify(o.fields || []));
  if (o.expectedFirstName) fd.append('expected_first_name', o.expectedFirstName);
  if (o.expectedLastName) fd.append('expected_last_name', o.expectedLastName);
  if (o.expectedCompanyName) fd.append('expected_company_name', o.expectedCompanyName);
  if (o.expectedCompanyCountry) fd.append('expected_company_country', o.expectedCompanyCountry);
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/document-ai/', { body: fd });
}

export async function diditPassiveLiveness(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('user_image', filePart(o.userImage), o.fileName || 'face.jpg');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/passive-liveness/', { body: fd });
}

export async function diditFaceMatch(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('user_image', filePart(o.userImage), 'face.jpg');
  fd.append('ref_image', filePart(o.refImage), 'ref.jpg');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/face-match/', { body: fd });
}

export async function diditFaceSearch(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('user_image', filePart(o.userImage), 'face.jpg');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/face-search/', { body: fd });
}

export async function diditAgeEstimation(env, opts) {
  const o = opts || {};
  const fd = new FormData();
  fd.append('user_image', filePart(o.userImage), 'face.jpg');
  fd.append('save_api_request', o.save === false ? 'false' : 'true');
  if (o.vendorData) fd.append('vendor_data', String(o.vendorData).slice(0, 64));
  return diditRequest(env, '/age-estimation/', { body: fd });
}

export async function diditAml(env, payload) {
  const p = Object.assign({ entity_type: 'person', save_api_request: true }, payload || {});
  return diditRequest(env, '/aml/', { json: p });
}

export async function diditKybSearch(env, payload) {
  return diditRequest(env, '/kyb/search/', { json: payload || {} });
}

export async function diditKybSelect(env, payload) {
  return diditRequest(env, '/kyb/select/', { json: payload || {} });
}

export async function diditKybShareholders(env, payload) {
  return diditRequest(env, '/kyb/shareholders/', { json: payload || {} });
}

export async function diditKybUbo(env, payload) {
  return diditRequest(env, '/kyb/ubo/', { json: payload || {} });
}

export async function diditEmailSend(env, payload) {
  return diditRequest(env, '/email/send/', { json: payload || {} });
}

export async function diditEmailCheck(env, payload) {
  return diditRequest(env, '/email/check/', { json: payload || {} });
}

export async function diditPhoneSend(env, payload) {
  return diditRequest(env, '/phone/send/', { json: payload || {} });
}

export async function diditPhoneCheck(env, payload) {
  return diditRequest(env, '/phone/check/', { json: payload || {} });
}

export async function diditAmlForId(env, iv, vendorData) {
  const name = String((iv && (iv.full_name || iv.fullName)) || [iv && iv.first_name, iv && iv.last_name].filter(Boolean).join(' ')).trim();
  if (!name) return null;
  const payload = {
    full_name: name.slice(0, 120),
    entity_type: 'person',
    include_adverse_media: false,
    include_ongoing_monitoring: false,
    save_api_request: true,
    vendor_data: String(vendorData || '').slice(0, 64),
  };
  if (iv && iv.date_of_birth) payload.date_of_birth = String(iv.date_of_birth).slice(0, 10);
  if (iv && (iv.nationality || iv.issuing_state)) payload.nationality = String(iv.nationality || iv.issuing_state).slice(0, 8);
  if (iv && (iv.document_number || iv.personal_number)) {
    payload.document_number = String(iv.personal_number || iv.document_number).slice(0, 32);
  }
  try {
    return await diditAml(env, payload);
  } catch (_) {
    return null;
  }
}
