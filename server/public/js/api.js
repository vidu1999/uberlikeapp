(function (global) {
  const API = {
    shops: [],
    items: [],
    orders: [],
    messages: {},
    listeners: [],
    user: null,
    token: null,
    base: (typeof window !== 'undefined' && window.QB_API) ? String(window.QB_API).replace(/\/$/, '') : '',
    roleHint: document.documentElement.getAttribute('data-role') || '',
  };
  const persistedShopNames = {};

  function finiteNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const STATUS_RANK = {
    cancelled: 0,
    pending: 1,
    preparing: 2,
    ready: 3,
    accepted: 4,
    picked_up: 5,
    on_the_way: 5,
    delivered: 6,
  };
  function statusRank(s) {
    return STATUS_RANK[s] || 0;
  }
  function mergeStatus(a, b) {
    if (a === 'delivered' || b === 'delivered') return 'delivered';
    if (a === 'cancelled' && statusRank(b) < 1) return 'cancelled';
    if (b === 'cancelled' && statusRank(a) < 1) return 'cancelled';
    if (a === 'cancelled') return b || a;
    if (b === 'cancelled') return a || b;
    if (statusRank(b) > statusRank(a)) return b || a || 'pending';
    return a || b || 'pending';
  }
  function locOnlyBody(body) {
    if (!body || typeof body !== 'object') return false;
    const keys = Object.keys(body).filter((k) => body[k] != null);
    return keys.length > 0 && keys.every((k) => k === 'riderLat' || k === 'riderLng');
  }
  function shopOf(id) {
    const hit = API.shops.find((s) => s.id === id);
    if (hit) return hit;
    return { id: id || '', name: 'Shop', emoji: '🏪', eta: '20 min' };
  }

  let _fp = null;
  function fingerprint() {
    const orders = (API.orders || []).map((o) =>
      [o.id, o.status, o.riderName || '', o.riderLat, o.riderLng, o.paymentStatus || '', o.paid ? '1' : '0'].join(':')
    ).join('|');
    const items = (API.items || []).map((i) => i.id + ':' + i.name + ':' + i.price + ':' + (i.image || '') + ':' + (i.isAvailable === false ? '0' : '1') + ':' + (i.stockUnlimited ? 'U' : String(i.stock != null ? i.stock : '')) + ':' + offerToken(i.offer) + ':' + (i.rating || '') + ':' + (i.reviews || '')).join('|');
    const msgs = Object.keys(API.messages || {}).sort().map((k) => k + ':' + ((API.messages[k] || []).length)).join('|');
    const shops = (API.shops || []).map((s) => (s && s.id) + ':' + (s && s.name || '') + ':' + (s && s.rating) + ':' + (s && s.reviews)).join('|');
    return [(API.user && API.user.id) || '', shops, items, orders, msgs].join('~');
  }
  function notify(force) {
    const fp = fingerprint();
    if (!force && _fp === fp) return;
    _fp = fp;
    API.listeners.forEach((fn) => {
      try { fn(API); } catch (e) { console.error(e); }
    });
  }

  function url(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return (API.base || '') + path;
  }

  function sbConfigured() {
    return Boolean(window.QB_SUPABASE_URL && window.QB_SUPABASE_ANON);
  }

  function mapShop(r) {
    const id = r.id;
    let name = String((id && persistedShopNames[id]) || r.name || '').trim();
    return {
      id,
      name,
      category: r.category,
      rating: Number(r.rating || 0),
      reviews: Number(r.reviews || 0),
      isOpen: r.is_open !== false && r.isOpen !== false,
      lat: finiteNum(r.lat) != null ? finiteNum(r.lat) : undefined,
      lng: finiteNum(r.lng) != null ? finiteNum(r.lng) : undefined,
      km: r.km != null ? Number(r.km) : undefined,
      emoji: r.emoji,
      eta: r.eta,
      fee: r.fee != null ? Number(r.fee) : 0,
      hours: r.hours,
      address: r.address,
      image: r.image,
      promo: r.promo,
    };
  }
  function parseOfferToken(tok) {
    tok = String(tok || '').trim();
    if (!tok || tok === 'none') return null;
    if (tok === 'bogo' || tok === 'b1g1') return { type: 'bogo' };
    if (tok.indexOf('pct:') === 0) {
      const n = Math.max(1, Math.min(90, parseInt(tok.slice(4), 10) || 0));
      return n ? { type: 'pct', pct: n } : null;
    }
    if (tok.indexOf('get:') === 0) {
      const id = tok.slice(4).replace(/[^A-Za-z0-9_.-]/g, '');
      return id ? { type: 'get', getId: id } : null;
    }
    return null;
  }
  function offerToken(offer) {
    if (!offer || !offer.type || offer.type === 'none') return '';
    if (offer.type === 'bogo') return 'bogo';
    if (offer.type === 'pct') {
      const n = Math.max(1, Math.min(90, Math.round(Number(offer.pct) || 0)));
      return n ? ('pct:' + n) : '';
    }
    if (offer.type === 'get' && offer.getId) return 'get:' + String(offer.getId).replace(/[^A-Za-z0-9_.-]/g, '');
    return '';
  }
  function stripItemMeta(desc) {
    return String(desc || '')
      .replace(/^\[\[QB\|(U|\d+)\]\]\n?/, '')
      .replace(/^\[\[QB\|OFF\|[^\]]+\]\]\n?/, '');
  }
  function unpackDesc(raw) {
    let text = String(raw || '');
    let unlimited = true;
    let stock = null;
    let offer = null;
    const stockM = text.match(/^\[\[QB\|(U|\d+)\]\]\n?/);
    if (stockM) {
      if (stockM[1] === 'U') { unlimited = true; stock = null; }
      else { unlimited = false; stock = Math.max(0, parseInt(stockM[1], 10) || 0); }
      text = text.slice(stockM[0].length);
    }
    const offM = text.match(/^\[\[QB\|OFF\|([^\]]+)\]\]\n?/);
    if (offM) {
      offer = parseOfferToken(offM[1]);
      text = text.slice(offM[0].length);
    }
    return { unlimited: unlimited, stock: stock, desc: text, offer: offer };
  }
  function packDesc(desc, unlimited, stock, offer) {
    const text = stripItemMeta(desc);
    let head = unlimited ? '[[QB|U]]' : ('[[QB|' + Math.max(0, Math.round(Number(stock) || 0)) + ']]');
    const tok = offerToken(offer);
    if (tok) head += '[[QB|OFF|' + tok + ']]';
    return head + (text ? '\n' + text : '');
  }
  function offerCaption(offer, items) {
    if (!offer || !offer.type) return '';
    if (offer.type === 'bogo') return 'Buy 1, Get 1 Free';
    if (offer.type === 'pct') return Math.round(Number(offer.pct) || 0) + '% Off';
    if (offer.type === 'get') {
      const g = (items || API.items || []).find(function (x) { return x && x.id === offer.getId; });
      const n = String((g && g.name) || '').trim() || '1 item';
      return 'Buy 1, Get ' + (n.length > 18 ? n.slice(0, 16) + '…' : n) + ' Free';
    }
    return '';
  }
  API.offerCaption = function (it) {
    return offerCaption(it && it.offer, API.items);
  };
  API.shopOfferCaption = function (shopId) {
    const list = (API.items || []).filter(function (it) {
      return it && it.shopId === shopId && itemOnSale(it) && it.offer && it.offer.type;
    });
    if (!list.length) return '';
    list.sort(function (a, b) {
      function rank(o) { return o.type === 'pct' ? 0 : o.type === 'bogo' ? 1 : 2; }
      return rank(a.offer) - rank(b.offer);
    });
    return offerCaption(list[0].offer, API.items);
  };
  API.cartPayTotal = function (cart) {
    cart = cart || [];
    const gift = {};
    cart.forEach(function (line) {
      const src = (API.items || []).find(function (x) { return x && x.id === line.id; }) || line;
      const o = src && src.offer;
      if (o && o.type === 'get' && o.getId) gift[o.getId] = (gift[o.getId] || 0) + Number(line.qty || 0);
    });
    let sum = 0;
    cart.forEach(function (line) {
      const src = (API.items || []).find(function (x) { return x && x.id === line.id; }) || line;
      const o = src && src.offer;
      const price = Number(line.price != null ? line.price : src.price) || 0;
      const qty = Number(line.qty) || 0;
      let charged = Math.max(0, qty - Math.min(qty, gift[line.id] || 0));
      if (charged <= 0) return;
      if (o && o.type === 'bogo') charged = Math.ceil(charged / 2);
      let unit = price;
      if (o && o.type === 'pct') unit = price * (1 - Math.min(90, Number(o.pct) || 0) / 100);
      sum += charged * unit;
    });
    return Math.round(sum);
  };
  function itemStockOf(it) {
    if (!it) return { unlimited: true, stock: 0 };
    if (it.stockUnlimited === false) return { unlimited: false, stock: Math.max(0, Math.round(Number(it.stock) || 0)) };
    return { unlimited: true, stock: 0 };
  }
  function itemOnSale(it) {
    if (!it) return false;
    const st = itemStockOf(it);
    if (!st.unlimited && st.stock <= 0) return false;
    return it.isAvailable !== false;
  }
  API.itemStock = itemStockOf;
  API.itemOnSale = itemOnSale;

  function mapItem(r) {
    const packed = unpackDesc(r.description || r.desc || '');
    const soldOut = !packed.unlimited && packed.stock <= 0;
    return {
      id: r.id,
      shopId: r.shop_id || r.shopId,
      name: r.name,
      category: r.category,
      price: Number(r.price || 0),
      isAvailable: soldOut ? false : (r.is_available !== false && r.isAvailable !== false),
      desc: packed.desc,
      description: packed.desc,
      image: r.image,
      stockUnlimited: packed.unlimited,
      stock: packed.unlimited ? null : packed.stock,
      offer: packed.offer || null,
    };
  }

  function sbHeaders(extra) {
    return Object.assign({
      apikey: window.QB_SUPABASE_ANON,
      Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    }, extra || {});
  }

  function abortAfter(ms) {
    const c = new AbortController();
    setTimeout(function () { c.abort(); }, ms);
    return c.signal;
  }

  function e164(phone) {
    const list = waNumberCandidates(phone);
    return list[0] || '';
  }

  function waNumberCandidates(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.startsWith('940') && d.length === 12) d = '94' + d.slice(3);
    if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
    if (d.startsWith('7') && d.length === 9) d = '94' + d;
    const out = [];
    function add(v) {
      v = String(v || '').replace(/\D/g, '');
      if (!v || v.length < 9 || v.length > 15) return;
      if (v.charAt(0) === '0') return;
      if (out.indexOf(v) >= 0) return;
      out.push(v);
    }
    add(d);
    if (d.startsWith('94') && d.length === 11) add(d);
    return out;
  }

  function waPhoneValue(to) {
    const n = Number(to);
    if (Number.isSafeInteger(n) && n > 0) return n;
    return to;
  }

  function friendlyWaError(msg) {
    const s = String(msg || '').slice(0, 240);
    if (/existsWhatsapp|not on WhatsApp|not registered on WhatsApp/i.test(s)) {
      return 'This number is not on WhatsApp. Use the number that opens WhatsApp on the phone.';
    }
    if (/466|not authorized|unauthorized|stateInstance/i.test(s)) {
      return 'WhatsApp sender is offline. Try again in a minute.';
    }
    if (/field|validation|chatId|message/i.test(s)) {
      return 'WhatsApp did not accept this number. Check the digits and tap Continue.';
    }
    if (!s || /failed|error|send/i.test(s)) {
      return 'WhatsApp did not send the code. Check the number and tap Continue.';
    }
    return s;
  }

  async function greenPost(host, id, token, method, payload, ms) {
    const res = await fetch(String(host).replace(/\/$/, '') + '/waInstance' + id + '/' + method + '/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortAfter(ms || 12000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data || {} };
  }

  async function sendViaGreenApi(phone, text, wa) {
    const message = String(text || '').trim();
    if (!message) throw new Error('WhatsApp message is empty.');
    const id = String(wa.greenId || '');
    const token = String(wa.greenToken || '');
    const hosts = [];
    function addHost(h) {
      const v = String(h || '').replace(/\/$/, '');
      if (v && hosts.indexOf(v) === -1) hosts.push(v);
    }
    addHost(wa.apiUrl);
    if (id.length >= 4) addHost('https://' + id.slice(0, 4) + '.api.green-api.com');
    addHost('https://api.green-api.com');
    const numbers = waNumberCandidates(phone);
    let last = 'WhatsApp did not send the code. Check the number and tap Continue.';
    let anyOnWa = false;
    for (let h = 0; h < hosts.length; h++) {
      for (let n = 0; n < numbers.length; n++) {
        const to = numbers[n];
        try {
          const chk = await greenPost(hosts[h], id, token, 'checkWhatsapp', { phone: waPhoneValue(to) });
          if (chk.data && chk.data.existsWhatsapp === false) {
            last = 'This number is not on WhatsApp. Use the number that opens WhatsApp on the phone.';
            continue;
          }
          if (chk.data && chk.data.existsWhatsapp === true) anyOnWa = true;
          if (chk.status === 466) {
            last = 'WhatsApp sender is offline. Try again in a minute.';
            continue;
          }
          const sent = await greenPost(hosts[h], id, token, 'sendMessage', {
            chatId: to + '@c.us',
            message: message,
          });
          if (sent.ok && sent.data && sent.data.idMessage) return true;
          if (sent.ok && !sent.data.error && sent.status < 300) return true;
          const err = sent.data.message || sent.data.error || sent.data.reason || '';
          last = friendlyWaError(typeof err === 'string' ? err : JSON.stringify(err || sent.status));
        } catch (e) {
          last = friendlyWaError(e && e.message);
        }
      }
    }
    if (!anyOnWa && /not on WhatsApp/i.test(last)) throw new Error(last);
    throw new Error(last);
  }

  async function sendWhatsApp(phone, body) {
    const wa = window.QB_WA || {};
    const to = e164(phone);
    const text = String(body || '').trim();
    if (!to || !text) throw new Error('Enter a valid WhatsApp number.');
    const payload = JSON.stringify({ phone: to, body: text });
    try {
      const res = await fetch('/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: abortAfter(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return true;
      if (data && data.error && res.status && res.status !== 404 && res.status !== 405) {
        const msg = typeof data.error === 'string' ? data.error : '';
        if (msg && /not on WhatsApp|offline|accept this number/i.test(msg)) throw new Error(friendlyWaError(msg));
      }
    } catch (e) {
      if (e && e.message && /not on WhatsApp|offline|accept this number|Enter a valid/i.test(e.message)) throw e;
    }
    const sb = String(window.QB_SUPABASE_URL || '').replace(/\/$/, '');
    if (sb && window.QB_SUPABASE_ANON) {
      try {
        const res = await fetch(sb + '/functions/v1/send-otp', {
          method: 'POST',
          headers: {
            apikey: window.QB_SUPABASE_ANON,
            Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: to, body: text }),
          signal: abortAfter(20000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) return true;
      } catch (_) {}
    }
    if (!(wa.greenId && wa.greenToken)) {
      try {
        const cfg = await fetch('/js/wa.json', { cache: 'no-store' }).then((r) => r.json());
        if (cfg) Object.assign(wa, cfg);
      } catch (_) {}
    }
    if (wa.greenId && wa.greenToken) {
      return sendViaGreenApi(to, text, wa);
    }
    if (wa.metaToken && wa.metaPhoneId) {
      const res = await fetch('https://graph.facebook.com/v21.0/' + wa.metaPhoneId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + wa.metaToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text },
        }),
      });
      if (!res.ok) throw new Error('WhatsApp Cloud send failed (' + res.status + ')');
      return true;
    }
    throw new Error('WhatsApp sender is not connected. Paste your Green-API idInstance and apiTokenInstance.');
  }

  function asRows(v) {
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== 'object') return [];
    if (Array.isArray(v.data)) return v.data;
    if (Array.isArray(v.accounts)) return v.accounts;
    if (Array.isArray(v.shops)) return v.shops;
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.orders)) return v.orders;
    if (Array.isArray(v.messages)) return v.messages;
    return [];
  }

  async function sbGet(table) {
    const base = String(window.QB_SUPABASE_URL).replace(/\/$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 8000);
    let res;
    try {
      res = await fetch(base + '/rest/v1/' + table, { headers: sbHeaders(), signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + table.split('?')[0] + ' ' + res.status);
    let parsed = [];
    try { parsed = text ? JSON.parse(text) : []; } catch (_) { parsed = []; }
    return asRows(parsed);
  }

  async function sbSend(path, method, body) {
    const base = String(window.QB_SUPABASE_URL).replace(/\/$/, '');
    const res = await fetch(base + '/rest/v1/' + path, {
      method: method,
      headers: sbHeaders(method === 'DELETE' ? { Prefer: 'return=minimal' } : null),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + path.split('?')[0] + ' ' + res.status + ' ' + String(text).slice(0, 160));
    return text ? JSON.parse(text) : null;
  }

  async function sbUpsert(table, rows) {
    return sbSend(table + '?on_conflict=id', 'POST', rows);
  }

  async function sbPutRow(table, row) {
    if (!row || !row.id) throw new Error('Missing id');
    try {
      await sbSend(table + '?on_conflict=id', 'POST', [row]);
    } catch (_) {
      try {
        await sbSend(table + '?id=eq.' + encodeURIComponent(row.id), 'PATCH', row);
      } catch (e2) {
        await sbSend(table, 'POST', [row]);
      }
    }
  }

  function isHttpUrl(v) {
    return /^https?:\/\//i.test(String(v || ''));
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read image')); };
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(dataUrl) {
    try {
      const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return null;
      const bin = atob(m[2]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: m[1] || 'image/jpeg' });
    } catch (_) { return null; }
  }
  function canvasFromImage(src) {
    let w = src.naturalWidth || src.width || 1;
    let h = src.naturalHeight || src.height || 1;
    const scale = Math.min(1, 720 / Math.max(w, h, 1));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    return c;
  }
  function canvasToJpeg(c, resolve, reject) {
    let q = 0.74;
    function asUrl() {
      try {
        let dataUrl = c.toDataURL('image/jpeg', q);
        while (dataUrl.length > 140000 && q > 0.4) {
          q -= 0.12;
          dataUrl = c.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      } catch (e) { reject(e); }
    }
    if (!c.toBlob) return asUrl();
    const tryBlob = function () {
      c.toBlob(function (blob) {
        if (!blob) return asUrl();
        if (blob.size > 110000 && q > 0.4) {
          q -= 0.12;
          tryBlob();
          return;
        }
        resolve(blob);
      }, 'image/jpeg', q);
    };
    tryBlob();
  }
  function compressImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Choose an image'));
      let url = '';
      try { url = URL.createObjectURL(file); } catch (_) {}
      const img = new Image();
      const failRead = function () {
        if (url) try { URL.revokeObjectURL(url); } catch (_) {}
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(file).then(function (bmp) {
            const c = canvasFromImage(bmp);
            try { bmp.close && bmp.close(); } catch (_) {}
            if (!c) return blobToDataUrl(file).then(resolve).catch(reject);
            canvasToJpeg(c, resolve, reject);
          }).catch(function () {
            blobToDataUrl(file).then(resolve).catch(reject);
          });
          return;
        }
        blobToDataUrl(file).then(resolve).catch(reject);
      };
      img.onload = function () {
        if (url) try { URL.revokeObjectURL(url); } catch (_) {}
        const c = canvasFromImage(img);
        if (!c) return failRead();
        canvasToJpeg(c, resolve, reject);
      };
      img.onerror = failRead;
      img.src = url || (typeof file === 'string' ? file : '');
    });
  }
  async function uploadPublicImage(blob, path) {
    const base = String(window.QB_SUPABASE_URL || '').replace(/\/$/, '');
    if (!base || !blob) throw new Error('no storage');
    const headers = {
      apikey: window.QB_SUPABASE_ANON,
      Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
      'x-upsert': 'true',
    };
    if (!API._imgBucketTried) {
      API._imgBucketTried = true;
      try {
        await fetch(base + '/storage/v1/bucket', {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id: 'qb-images', name: 'qb-images', public: true, fileSizeLimit: 2097152 }),
        });
      } catch (_) {}
    }
    let res = await fetch(base + '/storage/v1/object/qb-images/' + path, {
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Type': 'image/jpeg' }),
      body: blob,
    });
    if (!res.ok) {
      res = await fetch(base + '/storage/v1/object/qb-images/' + path, {
        method: 'PUT',
        headers: Object.assign({}, headers, { 'Content-Type': 'image/jpeg' }),
        body: blob,
      });
    }
    if (!res.ok) throw new Error('upload ' + res.status);
    return base + '/storage/v1/object/public/qb-images/' + path;
  }
  API.storeRiderAvatar = async function (src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (/\/storage\/v1\/object\/public\/qb-images\//.test(s) && /^https?:\/\//i.test(s)) return s;
    let file = s;
    if (/^https?:\/\//i.test(s)) {
      try {
        const r = await fetch(s);
        if (!r.ok) return s;
        file = await r.blob();
      } catch (_) {
        return s;
      }
    }
    try {
      return await API.storeImage(file, 'riderface');
    } catch (_) {
      return /^https?:\/\//i.test(s) ? s : '';
    }
  };
  API.storeImage = async function (file, kind) {
    if (!file) throw new Error('Choose an image');
    const t = String(file.type || '').toLowerCase();
    if (t && t.indexOf('image/') !== 0 && t !== 'application/octet-stream') {
      throw new Error('Choose a photo file.');
    }
    const compressed = await compressImageFile(file);
    const path = String(kind || 'img').replace(/[^a-z]/gi, '').slice(0, 12) + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
    let blob = null;
    let dataUrl = '';
    if (typeof compressed === 'string') {
      dataUrl = compressed;
      blob = dataUrlToBlob(compressed);
    } else blob = compressed;
    if (sbConfigured() && blob) {
      try {
        const pub = await uploadPublicImage(blob, path);
        if (pub) return pub;
      } catch (_) {}
    }
    if (dataUrl) {
      if (dataUrl.length > 220000) throw new Error('Image is too large. Try a smaller photo.');
      return dataUrl;
    }
    if (blob) {
      const url = await blobToDataUrl(blob);
      if (url.length > 220000) throw new Error('Image is too large. Try a smaller photo.');
      return url;
    }
    throw new Error('Could not save image');
  };
  const catState = {
    origin: null,
    radiusKm: 14,
    offset: 0,
    pageSize: 12,
    hasMore: true,
    loading: false,
    ids: {},
    itemIds: {},
  };
  function viewOrigin() {
    if (API._viewOrigin && Number.isFinite(Number(API._viewOrigin.lat))) {
      return { lat: Number(API._viewOrigin.lat), lng: Number(API._viewOrigin.lng) };
    }
    try {
      const g = JSON.parse(localStorage.getItem('qb_live_gps') || 'null');
      if (g && typeof g.lat === 'number' && typeof g.lng === 'number') return { lat: g.lat, lng: g.lng };
    } catch (_) {}
    if (typeof window !== 'undefined' && window.QB_LIVE && Number.isFinite(Number(window.QB_LIVE.lat))) {
      return { lat: Number(window.QB_LIVE.lat), lng: Number(window.QB_LIVE.lng) };
    }
    return null;
  }
  function bboxOf(origin, km) {
    const dLat = km / 111.32;
    const cos = Math.cos((origin.lat * Math.PI) / 180) || 0.5;
    const dLng = km / (111.32 * Math.max(0.2, Math.abs(cos)));
    return {
      minLat: origin.lat - dLat,
      maxLat: origin.lat + dLat,
      minLng: origin.lng - dLng,
      maxLng: origin.lng + dLng,
    };
  }
  function pgIn(ids) {
    return (ids || []).map(function (id) {
      return '"' + String(id).replace(/"/g, '') + '"';
    }).join(',');
  }
  function mergeById(list, rows, mapFn) {
    const by = {};
    (list || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
    (rows || []).forEach(function (r) {
      const m = mapFn(r);
      if (!m || !m.id) return;
      by[m.id] = Object.assign({}, by[m.id] || {}, m);
    });
    const out = [];
    Object.keys(by).forEach(function (k) { out.push(by[k]); });
    return out;
  }
  async function fetchItemsForShops(shopIds) {
    const need = (shopIds || []).filter(function (id) { return id && !catState.itemIds[id]; });
    if (!need.length) return;
    for (let i = 0; i < need.length; i += 16) {
      const chunk = need.slice(i, i + 16);
      const rows = asRows(await sbGet('menu_items?shop_id=in.(' + pgIn(chunk) + ')&select=*&order=id.asc'));
      API.items = mergeById(API.items, rows, mapItem);
      chunk.forEach(function (id) { catState.itemIds[id] = 1; });
    }
  }
  async function pullNearbyCatalog(opts) {
    if (!sbConfigured()) return;
    if (catState.loading) return;
    catState.loading = true;
    try {
      const more = !!(opts && opts.more);
      const page = catState.pageSize;
      const origin = viewOrigin();
      const first = !API._shopCatalogReady;
      if (!more && first) {
        catState.offset = 0;
        catState.radiusKm = 14;
        catState.hasMore = true;
      }
      let rows = [];
      if (origin) {
        let radius = catState.radiusKm || 14;
        let loops = 0;
        while (loops < 3) {
          const box = bboxOf(origin, radius);
          const off = more && loops === 0 ? catState.offset : 0;
          const q = 'shops?select=*&lat=gte.' + box.minLat + '&lat=lte.' + box.maxLat
            + '&lng=gte.' + box.minLng + '&lng=lte.' + box.maxLng
            + '&order=id.asc&limit=' + page + '&offset=' + off;
          rows = asRows(await sbGet(q));
          catState.radiusKm = radius;
          if (rows.length || radius >= 56) break;
          radius = Math.min(56, radius * 2);
          loops += 1;
        }
        catState.origin = origin;
        if (more) catState.offset += rows.length;
        else if (first) catState.offset = rows.length;
      } else {
        const off = more ? catState.offset : 0;
        rows = asRows(await sbGet('shops?select=*&order=id.asc&limit=' + page + '&offset=' + off));
        catState.offset = off + rows.length;
      }
      catState.hasMore = rows.length >= page;
      API.shops = mergeById(API.shops, rows, mapShop);
      const ids = [];
      rows.forEach(function (r) {
        if (r && r.id) { catState.ids[r.id] = 1; ids.push(r.id); }
      });
      await fetchItemsForShops(ids);
    } finally {
      catState.loading = false;
    }
  }
  API.hasMoreNearby = function () { return !!catState.hasMore; };
  API.loadMoreNearby = async function () {
    if (!catState.hasMore || catState.loading) return false;
    await pullNearbyCatalog({ more: true });
    notify(true);
    return !!catState.hasMore;
  };
  API.setViewOrigin = function (lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const prev = API._viewOrigin;
    API._viewOrigin = { lat: lat, lng: lng };
    if (prev) {
      const dlat = prev.lat - lat;
      const dlng = prev.lng - lng;
      if ((dlat * dlat) + (dlng * dlng) < 0.00005) return;
    }
    if (sbConfigured() && !(API.user && sameRole(API.user.role, 'shop'))) {
      API.refresh({ catalog: true }).catch(function () {});
    }
  };
  API.ensureShops = async function (ids) {
    const need = [];
    const seen = {};
    (ids || []).forEach(function (id) {
      if (!id || seen[id] || catState.ids[id]) return;
      seen[id] = 1;
      need.push(id);
    });
    if (!need.length || !sbConfigured()) return;
    const rows = asRows(await sbGet('shops?id=in.(' + pgIn(need) + ')&select=*'));
    API.shops = mergeById(API.shops, rows, mapShop);
    rows.forEach(function (r) { if (r && r.id) catState.ids[r.id] = 1; });
    await fetchItemsForShops(need);
    notify();
  };
  API.ensureShopItems = async function (shopId) {
    if (!shopId) return;
    await API.ensureShops([shopId]);
    await fetchItemsForShops([shopId]);
    notify();
  };
  function accountPhoto(r) {
    if (!r) return '';
    const cands = [r.photo, r.picture, r.image, r.avatar];
    if (isHttpUrl(r.vehicle) && sameRole(r.role, 'customer')) cands.push(r.vehicle);
    for (let i = 0; i < cands.length; i++) {
      if (isHttpUrl(cands[i])) return String(cands[i]);
    }
    return '';
  }
  function mapAccount(r) {
    const a = { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, address: r.address };
    if (r.pin != null) a.pin = r.pin;
    if (r.shop_id || r.shopId) a.shopId = r.shop_id || r.shopId;
    if (r.shopName || r.shop_name) a.shopName = r.shopName || r.shop_name;
    const photo = accountPhoto(r);
    if (photo) a.photo = photo;
    if (r.vehicle && !isHttpUrl(r.vehicle)) a.vehicle = r.vehicle;
    if (r.rating != null) a.rating = Number(r.rating);
    return a;
  }

  function orderRow(o) {
    return {
      id: o.id,
      user_id: o.userId || null,
      shop_id: o.shopId || null,
      shop_name: o.shopName || null,
      customer_name: o.customerName || null,
      customer_phone: o.customerPhone || null,
      address: o.address || null,
      status: o.status || null,
      total_amount: o.totalAmount,
      data: o,
      updated_at: o.updatedAt || new Date().toISOString(),
    };
  }

  function mapOrder(r) {
    if (!r) return r;
    let d = r.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { d = null; }
    }
    if (!d || typeof d !== 'object') d = {};
    const o = Object.assign({}, r, d);
    o.id = d.id || r.id;
    o.userId = d.userId || r.user_id || r.userId || '';
    o.shopId = d.shopId || r.shop_id || r.shopId || '';
    o.shopName = liveShopTitle(o.shopId, d.shopName || r.shop_name || r.shopName || '');
    o.customerName = d.customerName || r.customer_name || r.customerName || '';
    o.customerPhone = d.customerPhone || r.customer_phone || r.customerPhone || '';
    o.customerEmail = String(d.customerEmail || d.email || r.customer_email || '').trim().toLowerCase();
    o.address = d.address || r.address || '';
    o.status = mergeStatus(r.status, d.status);
    o.items = d.items || o.items || [];
    o.totalAmount = Number(d.totalAmount != null ? d.totalAmount : r.total_amount) || 0;
    o.deliveryLat = Number(d.deliveryLat != null ? d.deliveryLat : o.deliveryLat);
    o.deliveryLng = Number(d.deliveryLng != null ? d.deliveryLng : o.deliveryLng);
    o.riderId = d.riderId || o.riderId || null;
    o.riderName = d.riderName || o.riderName || null;
    o.riderPhone = d.riderPhone || o.riderPhone || null;
    o.riderPhoto = d.riderPhoto || o.riderPhoto || '';
    o.riderLat = d.riderLat != null ? d.riderLat : o.riderLat;
    o.riderLng = d.riderLng != null ? d.riderLng : o.riderLng;
    o.shopLat = finiteNum(d.shopLat != null ? d.shopLat : o.shopLat);
    o.shopLng = finiteNum(d.shopLng != null ? d.shopLng : o.shopLng);
    o.shopAddress = d.shopAddress || o.shopAddress || o.shop_address || '';
    o.pickedUpAt = d.pickedUpAt || o.pickedUpAt || r.picked_up_at || null;
    o.ratings = d.ratings || o.ratings || null;
    o.stockApplied = !!(d.stockApplied || o.stockApplied);
    return o;
  }

  function clampStar(n) {
    n = Math.round(Number(n) || 0);
    if (n < 1 || n > 5) return 0;
    return n;
  }
  function itemRateKey(it) {
    const id = String((it && (it.id || it.itemId)) || '').trim();
    if (id) return id;
    return String((it && it.name) || '').trim();
  }
  function uniqueOrderItems(o) {
    const seen = {};
    const out = [];
    ((o && o.items) || []).forEach(function (it) {
      const k = itemRateKey(it);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ key: k, name: String(it.name || k), id: it.id || '' });
    });
    return out;
  }
  function bagAvg(rec) {
    if (!rec || !rec.n) return null;
    return Math.round((Number(rec.sum) / Number(rec.n)) * 10) / 10;
  }
  function applyRatingOverlay() {
    const bag = API.ratings;
    if (!bag) return;
    (API.shops || []).forEach(function (s) {
      const rec = bag.shops && bag.shops[s.id];
      if (rec && rec.n) {
        s.rating = bagAvg(rec);
        s.reviews = rec.n;
      }
    });
    (API.items || []).forEach(function (it) {
      const rec = (bag.items && (bag.items[it.id] || bag.items[it.name])) || null;
      if (rec && rec.n) {
        it.rating = bagAvg(rec);
        it.reviews = rec.n;
      }
    });
  }
  async function loadRatingsBag() {
    API.ratings = API.ratings || { shops: {}, riders: {}, items: {} };
    try {
      const rows = asRows(await sbGet('app_state?id=eq.qb_ratings&select=*'));
      let p = rows[0] && rows[0].payload;
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch (_) { p = null; }
      }
      if (p && typeof p === 'object') {
        API.ratings = {
          shops: p.shops && typeof p.shops === 'object' ? p.shops : {},
          riders: p.riders && typeof p.riders === 'object' ? p.riders : {},
          items: p.items && typeof p.items === 'object' ? p.items : {},
        };
      }
    } catch (_) {}
    applyRatingOverlay();
    return API.ratings;
  }
  function bumpBag(group, key, stars) {
    if (!key || !stars) return;
    const bag = API.ratings[group] || (API.ratings[group] = {});
    const cur = bag[key] || { sum: 0, n: 0 };
    bag[key] = { sum: (Number(cur.sum) || 0) + stars, n: (Number(cur.n) || 0) + 1 };
  }
  async function saveRatingsBag() {
    const payload = API.ratings || { shops: {}, riders: {}, items: {} };
    try {
      await sbPutRow('app_state', { id: 'qb_ratings', payload: payload });
    } catch (_) {
      try { await sbSend('app_state?id=eq.qb_ratings', 'PATCH', { payload: payload }); } catch (_) {}
    }
  }
  API.orderRated = function (o) {
    return !!(o && o.ratings && clampStar(o.ratings.shop));
  };
  API.rateLabel = function (rating, reviews) {
    const n = Number(reviews) || 0;
    const r = Number(rating) || 0;
    if (n <= 0) return 'New';
    return '★ ' + r.toFixed(1) + ' (' + n + ')';
  };
  API.itemRateOf = function (id) {
    const rec = API.ratings && API.ratings.items && (API.ratings.items[id]);
    if (!rec || !rec.n) return null;
    return { rating: bagAvg(rec), reviews: rec.n };
  };
  API.uniqueOrderItems = uniqueOrderItems;
  API.clampStar = clampStar;

  const DEMO_SHOP_IDS = ['SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11'];
  const DEMO_ACCOUNT_IDS = ['USER_1','USER_2','SHOP_STAFF','RIDER_77'];
  const DEMO_PHONES = ['0771234567','0771112222','0772223333','0775556666'];
  const DEMO_ORDER_IDS = ['ORD-1001','ORD-1002','ORD-1003','ORD-1004','ORD-NONE'];
  const DEMO_ITEM_IDS = [];
  for (let i = 1; i <= 33; i++) DEMO_ITEM_IDS.push('I' + i);
  const DEMO_SHOP_NAMES = ['Kandy Bakers', 'Kandy Baker', 'Kandy Bakery', 'Demo Shop'];

  function isDemoShop(id) {
    return DEMO_SHOP_IDS.indexOf(String(id || '')) >= 0;
  }
  function isDemoPhone(phone) {
    return DEMO_PHONES.indexOf(normalizePhone(phone || '')) >= 0;
  }
  function isDemoAccount(a) {
    if (!a) return false;
    return DEMO_ACCOUNT_IDS.indexOf(String(a.id || '')) >= 0 || isDemoPhone(a.phone);
  }
  function isDemoOrder(o) {
    const id = String((o && o.id) || '');
    if (/^ORD-100[1-4]$/.test(id) || id === 'ORD-NONE') return true;
    if (isDemoShop(o && (o.shopId || o.shop_id))) return true;
    if (DEMO_ACCOUNT_IDS.indexOf(String((o && (o.userId || o.user_id)) || '')) >= 0) return true;
    if (isDemoPhone((o && (o.customerPhone || o.customer_phone)) || '')) return true;
    return false;
  }
  function roleLabel(role) {
    if (role === 'shop') return 'Shop';
    if (role === 'rider') return 'Rider';
    return 'User';
  }
  function sameRole(a, b) {
    const x = a === 'user' ? 'customer' : a;
    const y = b === 'user' ? 'customer' : b;
    return x === y;
  }
  function roleTag(role) {
    if (role === 'shop') return 'shop';
    if (role === 'rider') return 'rider';
    return 'customer';
  }
  function phoneKey(raw) {
    const d = normalizePhone(raw);
    return d.length >= 9 ? d.slice(-9) : d;
  }
  function accountIdFor(phone, role) {
    return 'ACC_' + roleTag(role) + '_' + phoneKey(phone);
  }
  function shopIdFor(phone) {
    return 'SHOP_' + phoneKey(phone);
  }
  function alreadyThisRoleError(role) {
    const have = roleLabel(role);
    return new Error('This number already has a ' + have + ' account. Login instead — you cannot create another ' + have + ' with the same number. You can still use this number for the other apps.');
  }
  function alreadyEmailError(role) {
    const have = roleLabel(role);
    return new Error('This email already has a ' + have + ' account. Sign in with that email instead — one email and one WhatsApp number per ' + have + ' account.');
  }
  function emailsEqual(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    return !!(x && y && x === y && x.indexOf('@') >= 0);
  }
  function clearAccCache() {
    API._accs = null;
    API._accsAt = 0;
  }
  async function allAccounts() {
    if (API._accs && Date.now() - API._accsAt < 4000) return API._accs;
    let rows = [];
    if (sbConfigured()) {
      try { rows = await sbGet('accounts?select=*'); } catch (_) { rows = []; }
    } else {
      try { rows = asRows(await getJSON('/api/accounts')); } catch (_) { rows = []; }
    }
    API._accs = asRows(rows).map(function (r) { return mapAccount(r); }).filter(function (a) { return a && a.id && !isDemoAccount(a); });
    API._accsAt = Date.now();
    return API._accs;
  }
  function isPlaceholderPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return true;
    if (/^07\d{8}$/.test(p)) return false;
    return /^99\d{8}$/.test(p) || /^98\d{8}$/.test(p);
  }
  function mineOrder(o, me) {
    if (!o || !me) return false;
    if (sameRole(me.role, 'customer')) {
      const email = String(me.email || '').trim().toLowerCase();
      const oEmail = String(o.customerEmail || o.customer_email || '').trim().toLowerCase();
      const wa = typeof API.isWhatsAppVerified === 'function' ? API.isWhatsAppVerified(me) : /^07\d{8}$/.test(normalizePhone(me.phone));
      if (!wa) {
        if (email && oEmail && email === oEmail) return true;
        if (o.userId && me.id && String(o.userId) === String(me.id)) return true;
        if (o.user_id && me.id && String(o.user_id) === String(me.id)) return true;
        return false;
      }
      if (o.userId && me.id && String(o.userId) === String(me.id)) return true;
      if (o.user_id && me.id && String(o.user_id) === String(me.id)) return true;
      const p = normalizePhone(o.customerPhone || o.customer_phone || '');
      const mine = normalizePhone(me.phone);
      if (p && mine && !isPlaceholderPhone(mine) && (p === mine || phoneKey(p) === phoneKey(mine))) return true;
      return false;
    }
    if (sameRole(me.role, 'shop')) {
      const sid = linkedShopId(me);
      return !!(sid && String(o.shopId || o.shop_id || '') === String(sid));
    }
    if (sameRole(me.role, 'rider')) {
      if (me.id && (o.riderId === me.id || o.rider_id === me.id)) return true;
      const rp = normalizePhone(o.riderPhone || o.rider_phone || '');
      const mine = normalizePhone(me.phone);
      if (rp && mine && (rp === mine || phoneKey(rp) === phoneKey(mine))) return true;
      if (o.status === 'ready' && !o.riderId && !o.rider_id) return true;
      return false;
    }
    return false;
  }
  function scopeData() {
    API.shops = (API.shops || []).filter((s) => !isDemoShop(s.id) && !isDemoShopName(s.name));
    API.items = (API.items || []).filter((it) => !isDemoShop(it.shopId) && DEMO_ITEM_IDS.indexOf(String(it.id || '')) < 0);
    API.orders = (API.orders || []).filter((o) => !isDemoOrder(o));
    const u = API.user;
    if (u && isDemoAccount(u)) {
      API.user = null;
      API.token = null;
      try {
        localStorage.removeItem(sessionKey(u.role));
        sessionStorage.removeItem(sessionKey(u.role));
      } catch (_) {}
    }
    const me = API.user;
    if (!me) {
      API.orders = [];
      API.messages = {};
      return;
    }
    if (sameRole(me.role, 'shop')) {
      const sid = linkedShopId(me);
      if (sid) {
        API.shops = API.shops.filter((s) => s.id === sid);
        API.items = API.items.filter((it) => it.shopId === sid);
      }
    }
    API.orders = API.orders.filter((o) => mineOrder(o, me));
    mergeKept();
    const allow = {};
    (API.orders || []).forEach(function (o) { if (o && o.id) allow[o.id] = 1; });
    const msgs = API.messages || {};
    const nextMsgs = {};
    Object.keys(msgs).forEach(function (k) { if (allow[k]) nextMsgs[k] = msgs[k]; });
    API.messages = nextMsgs;
  }
  const keptOrders = [];
  function keptStorageKey() {
    const u = API.user || {};
    const email = String(u.email || '').trim().toLowerCase();
    if (email) return 'qb_kept_orders_e_' + email;
    if (u.id) return 'qb_kept_orders_' + u.id;
    return 'qb_kept_orders_' + phoneKey(u.phone || '');
  }
  function resetKept() {
    keptOrders.length = 0;
  }
  function persistKept() {
    try { localStorage.setItem(keptStorageKey(), JSON.stringify(keptOrders.slice(0, 40))); } catch (_) {}
  }
  function keepOrder(o) {
    if (!o || !o.id) return o;
    if (API.user && !mineOrder(o, API.user)) return o;
    const i = keptOrders.findIndex((x) => x.id === o.id);
    if (i >= 0) {
      const prev = keptOrders[i];
      const next = Object.assign({}, prev, o);
      next.status = mergeStatus(prev.status, o.status);
      keptOrders[i] = next;
    } else keptOrders.unshift(o);
    persistKept();
    return o;
  }
  function applyLocalOrder(id, body) {
    if (!id || !body) return null;
    const i = API.orders.findIndex((o) => o.id === id);
    if (i < 0) {
      if (!body.status && !body.riderId) return null;
      const next = Object.assign({ id: id }, body);
      next.status = mergeStatus(null, body.status);
      next.updatedAt = new Date().toISOString();
      API.orders.unshift(next);
      keepOrder(next);
      return next;
    }
    const prev = API.orders[i];
    const next = Object.assign({}, prev, body);
    next.id = id;
    next.status = body.status ? mergeStatus(prev.status, body.status) : prev.status;
    if (prev.status === 'delivered' && body.status !== 'cancelled') next.status = 'delivered';
    if (body.status === 'picked_up' || body.status === 'on_the_way') next.pickedUpAt = next.pickedUpAt || new Date().toISOString();
    if (body.status === 'delivered') {
      next.deliveredAt = next.deliveredAt || new Date().toISOString();
      if (next.paid && next.paymentStatus === 'captured' && !next.riderPaidAt) next.riderPaidAt = next.deliveredAt;
    }
    next.updatedAt = new Date().toISOString();
    if (next.status === 'cancelled' && next.paid && next.paymentStatus === 'captured') {
      next.paymentStatus = 'refunded';
      next.refundedAt = next.updatedAt;
    }
    API.orders[i] = next;
    keepOrder(next);
    return next;
  }
  function loadKept() {
    resetKept();
    try {
      const arr = JSON.parse(localStorage.getItem(keptStorageKey()) || '[]');
      if (!Array.isArray(arr)) return;
      arr.forEach((o) => {
        if (!o || !o.id) return;
        if (API.user && !mineOrder(o, API.user)) return;
        const i = keptOrders.findIndex((x) => x.id === o.id);
        if (i < 0) keptOrders.push(o);
        else {
          const status = mergeStatus(keptOrders[i].status, o.status);
          keptOrders[i] = Object.assign({}, keptOrders[i], o, { status: status });
        }
      });
    } catch (_) {}
  }
  function mergeKept() {
    if (!API.user) return;
    loadKept();
    keptOrders.forEach((o, idx) => {
      if (!o || !o.id) return;
      if (!mineOrder(o, API.user)) return;
      const i = API.orders.findIndex((x) => x.id === o.id);
      if (i < 0) {
        API.orders.unshift(o);
        return;
      }
      const cur = API.orders[i];
      const status = mergeStatus(cur.status, o.status);
      if (status !== cur.status) API.orders[i] = Object.assign({}, cur, { status: status });
      if (statusRank(API.orders[i].status) >= statusRank(o.status)) keptOrders[idx] = Object.assign({}, o, API.orders[i]);
    });
    persistKept();
  }

  function phoneVariants(phone) {
    const key = phoneKey(phone);
    const n = normalizePhone(phone);
    return [n, key, '0' + key, '94' + key, '+94' + key].filter(function (v, i, a) {
      return v && a.indexOf(v) === i;
    });
  }

  function dropLocalShop(raw) {
    const key = phoneKey(raw);
    if (!key) return;
    try {
      [localStorage, sessionStorage].forEach(function (store) {
        try {
          const raws = store.getItem('sd_user_shop');
          if (!raws) return;
          const data = JSON.parse(raws);
          const p = (data && data.user && data.user.phone) || (data && data.phone);
          if (!p || phoneKey(p) === key) store.removeItem('sd_user_shop');
        } catch (_) {}
      });
      localStorage.removeItem(shopProfileKey(normalizePhone(raw)));
      sessionStorage.removeItem('sd_pending_shop');
    } catch (_) {}
    if (API.user && sameRole(API.user.role, 'shop') && phoneKey(API.user.phone) === key) {
      API.user = null;
      API.token = null;
    }
  }

  async function wipeShopRole(raw) {
    if (!sbConfigured()) return;
    const key = phoneKey(raw);
    if (!key) return;
    const n = normalizePhone(raw);
    const variants = phoneVariants(raw);
    const shopIds = [shopIdFor(n)];
    const accIds = [accountIdFor(n, 'shop')];
    let accList = [];
    try { accList = await sbGet('accounts?select=id,phone,role,shop_id') || []; } catch (_) {}
    accList.forEach(function (a) {
      if (!a || !sameRole(a.role, 'shop')) return;
      if (phoneKey(a.phone) !== key && accIds.indexOf(a.id) < 0) return;
      if (accIds.indexOf(a.id) < 0) accIds.push(a.id);
      if (a.shop_id && shopIds.indexOf(a.shop_id) < 0) shopIds.push(a.shop_id);
    });
    let orderList = [];
    try { orderList = await sbGet('orders?select=*') || []; } catch (_) {}
    const orderIds = [];
    orderList.forEach(function (o) {
      const d = o.data || {};
      if (shopIds.indexOf(o.shop_id) >= 0 || shopIds.indexOf(d.shopId) >= 0) orderIds.push(o.id);
    });
    for (let i = 0; i < orderIds.length; i++) {
      const id = orderIds[i];
      try { await sbSend('messages?order_id=eq.' + encodeURIComponent(id), 'DELETE'); } catch (_) {}
      try { await sbSend('orders?id=eq.' + encodeURIComponent(id), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < shopIds.length; i++) {
      const sid = shopIds[i];
      try { await sbSend('menu_items?shop_id=eq.' + encodeURIComponent(sid), 'DELETE'); } catch (_) {}
      try { await sbSend('shops?id=eq.' + encodeURIComponent(sid), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < accIds.length; i++) {
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(accIds[i]), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < variants.length; i++) {
      try {
        await sbSend('accounts?phone=eq.' + encodeURIComponent(variants[i]) + '&role=eq.shop', 'DELETE');
      } catch (_) {}
      try {
        await sbSend('otp_codes?phone=eq.' + encodeURIComponent(variants[i]) + '&role=eq.shop', 'DELETE');
      } catch (_) {}
    }
    dropLocalShop(raw);
    clearAccCache();
  }

  function linkedShopId(user) {
    if (!user || !sameRole(user.role, 'shop')) return '';
    let sid = String(user.shopId || user.shop_id || '').trim();
    if (sid === 'null' || isDemoShop(sid)) sid = '';
    const phone = user.phone;
    if (sid && isPlaceholderPhone(phone) && sid === shopIdFor(phone)) sid = '';
    if (!sid && phone && !isPlaceholderPhone(phone)) sid = shopIdFor(phone);
    return sid || '';
  }

  function attachShopIdentity(user) {
    if (!user || !sameRole(user.role, 'shop')) return user;
    const sid = linkedShopId(user);
    if (sid) {
      user.shopId = sid;
      user.shop_id = sid;
    } else {
      user.shopId = '';
      user.shop_id = '';
    }
    return user;
  }

  function isPlaceholderName(name) {
    const n = String(name || '').trim().toLowerCase();
    return !n || n === 'rider' || n === 'guest' || n === 'user' || n === 'shop owner' || n === 'delivery partner';
  }

  function isPlaceholderShopName(name) {
    const n = String(name || '').trim().toLowerCase();
    return !n || n === 'shop' || n === 'my shop' || n === 'new shop' || n === 'shop owner';
  }
  function isDemoShopName(name) {
    const n = String(name || '').trim().toLowerCase();
    return n === 'kandy bakers' || n === 'kandy baker' || n === 'kandy bakery' || n === 'demo shop';
  }

  function liveShopTitle(shopId, fallback) {
    if (shopId && persistedShopNames[shopId]) return persistedShopNames[shopId];
    const s = (API.shops || []).find(function (x) { return x && x.id === shopId; });
    const fromShop = String((s && s.name) || '').trim();
    if (fromShop && !isDemoShopName(fromShop) && !isPlaceholderShopName(fromShop)) return fromShop;
    const f = String(fallback || '').trim();
    if (f && !isDemoShopName(f) && !isPlaceholderShopName(f)) return f;
    return fromShop || 'Shop';
  }

  function purgeLocalDemoStores() {
    const keys = [];
    function collect(store) {
      try {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && keys.indexOf(k) < 0) keys.push(k);
        }
      } catch (_) {}
    }
    try { collect(localStorage); } catch (_) {}
    try { collect(sessionStorage); } catch (_) {}
    keys.forEach(function (k) {
      if (!k) return;
      if (k === 'sd_shop_public_names' || k === 'qb_shop_public_names') { storeDel(k); return; }
      if (k.indexOf('sd_shop_title_') === 0 || k.indexOf('qb_shop_title_') === 0) { storeDel(k); return; }
      if (k.indexOf('sd_shop_profile_') === 0 || k.indexOf('qb_shop_profile_') === 0) {
        try {
          const p = JSON.parse(storeGet(k) || 'null');
          if (p && isDemoShopName(p.shopName)) {
            p.shopName = '';
            storeSet(k, JSON.stringify(p));
          }
        } catch (_) {}
        return;
      }
      if (/^(sd_|qb_)/.test(k)) {
        try {
          const raw = storeGet(k);
          if (!raw) return;
          const data = JSON.parse(raw);
          const u = data && data.user ? data.user : data;
          if (u && typeof u === 'object' && isDemoShopName(u.shopName)) {
            u.shopName = '';
            storeSet(k, JSON.stringify(data && data.user ? data : u));
          }
        } catch (_) {}
      }
    });
    if (API.user && isDemoShopName(API.user.shopName)) API.user.shopName = '';
    try {
      const p = pendingShop();
      if (p && isDemoShopName(p.shopName)) {
        p.shopName = '';
        API.setPendingShop(p);
      }
    } catch (_) {}
  }

  function ownerNameList(user) {
    const out = [];
    function add(n) {
      const t = String(n || '').trim().toLowerCase();
      if (t && out.indexOf(t) < 0) out.push(t);
    }
    if (user) add(user.name);
    try {
      const rec = user && user.phone && API.recallShopProfile ? API.recallShopProfile(user.phone) : null;
      if (rec) add(rec.ownerName);
    } catch (_) {}
    return out;
  }

  function isOwnerLikeShopName(name, user, shopId) {
    const n = String(name || '').trim();
    if (isPlaceholderShopName(n)) return true;
    const low = n.toLowerCase();
    if (user && sameRole(user.role, 'shop') && ownerNameList(user).indexOf(low) >= 0) return true;
    const owners = API._shopOwners || {};
    if (shopId) {
      const o = String(owners[shopId] || '').trim().toLowerCase();
      if (o && o === low) return true;
    }
    return false;
  }

  function titleForShop(shop) {
    if (!shop) return 'Shop';
    return liveShopTitle(shop.id, shop.name);
  }

  function publicNameCandidate(name, user, shopId) {
    const t = String(name || '').trim();
    if (!t || isDemoShopName(t) || isPlaceholderShopName(t) || isOwnerLikeShopName(t, user, shopId)) return '';
    return t;
  }

  async function repairShopPublicName(user) {
    if (!user || !sameRole(user.role, 'shop')) return user;
    const sid = linkedShopId(user);
    if (!sid) return user;
    const shop = API.shops.find((s) => s.id === sid);
    const n = liveShopTitle(sid, shop && shop.name);
    if (n && n !== 'Shop') user.shopName = n;
    return user;
  }

  API.publicShopName = function (shop) {
    return titleForShop(shop || {});
  };
  API.shopTitle = function (shop) {
    return titleForShop(shop || {});
  };
  API.lockShopTitle = function () {
    return '';
  };

  async function syncPublicShopNames() {}

  API.isShopRegistered = function () {
    const u = API.user;
    if (!u || !sameRole(u.role, 'shop')) return false;
    const sid = linkedShopId(u);
    if (!sid || isDemoShop(sid)) return false;
    const shop = (API.shops || []).find((s) => s.id === sid);
    if (shop && shop.id) return true;
    if (!API._shopCatalogReady) return true;
    return false;
  };

  API.isRiderRegistered = function () {
    const u = API.user;
    if (!u || !sameRole(u.role, 'rider') || !u.id) return false;
    return !isPlaceholderName(u.name);
  };

  API.parkForRegister = function (role) {
    const u = API.user;
    if (!u) return;
    if (sameRole(role, 'shop') || sameRole(u.role, 'shop')) {
      const prev = pendingShop() || {};
      API.setPendingShop(Object.assign({}, prev, {
        ownerName: prev.ownerName || u.name || '',
        email: u.email || prev.email || '',
        photo: u.photo || prev.photo || '',
      }));
    }
    if (sameRole(role, 'rider') || sameRole(u.role, 'rider')) {
      const prev = pendingRider() || {};
      API.setPendingRider(Object.assign({}, prev, {
        name: prev.name || u.name || '',
        email: u.email || prev.email || '',
      }));
    }
  };
  API.isPlaceholderPhone = isPlaceholderPhone;

  async function ensureShopRow(user, opts) {
    user = attachShopIdentity(user);
    if (!user || !sameRole(user.role, 'shop')) return user;
    const sid = linkedShopId(user);
    if (!sid) {
      if (opts && opts.required) throw new Error('Shop is not linked to this account.');
      return user;
    }
    user.shopId = sid;
    user.shop_id = sid;
    if (user.id && sbConfigured() && !(isPlaceholderPhone(user.phone) && sid === shopIdFor(user.phone))) {
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(user.id), 'PATCH', { shop_id: sid }); } catch (_) {}
    }
    let shop = null;
    let shopLookupOk = !sbConfigured();
    if (sbConfigured()) {
      try {
        const rows = await sbGet('shops?id=eq.' + encodeURIComponent(sid) + '&select=*');
        shopLookupOk = true;
        if (rows && rows[0]) shop = rows[0];
      } catch (_) {}
    }
    const rec = (user.phone && API.recallShopProfile(user.phone)) || {};
    const p = pendingShop() || {};
    const pinLat = finiteNum(p.lat != null ? p.lat : rec.lat);
    const pinLng = finiteNum(p.lng != null ? p.lng : rec.lng);
    const pinAddr = String(p.address || rec.address || '').trim();
    if (!shop) {
      const local = API.shops.find((s) => s.id === sid);
      if (!(opts && opts.required)) {
        if (local) shop = { id: sid, name: local.name, category: local.category, rating: local.rating, reviews: local.reviews, is_open: local.isOpen !== false, lat: local.lat, lng: local.lng, hours: local.hours, address: local.address, image: local.image, promo: local.promo };
        else return user;
      } else if (sbConfigured() && !shopLookupOk) {
        if (local) shop = { id: sid, name: local.name, category: local.category, rating: local.rating, reviews: local.reviews, is_open: local.isOpen !== false, lat: local.lat, lng: local.lng, hours: local.hours, address: local.address, image: local.image, promo: local.promo };
        else return user;
      } else {
        let name = String(p.shopName || '').trim();
        if (!name || isDemoShopName(name) || isPlaceholderShopName(name)) {
          throw new Error('Register your shop first.');
        }
        if (pinLat == null || pinLng == null) {
          throw new Error('Pin your shop on the map.');
        }
        shop = {
          id: sid,
          name: name,
          category: 'Bakery',
          rating: 5,
          reviews: 0,
          is_open: true,
          lat: pinLat,
          lng: pinLng,
          km: 0,
          eta: '20–35 min',
          fee: 200,
          hours: '08:00 AM – 10:00 PM',
          address: pinAddr,
          image: '/img/shop-bakery.jpg',
          promo: rec.promo || '',
        };
        if (sbConfigured()) await sbUpsert('shops', [shop]);
      }
    } else {
      const patch = {};
      if (finiteNum(shop.lat) == null && pinLat != null) { shop.lat = pinLat; patch.lat = pinLat; }
      if (finiteNum(shop.lng) == null && pinLng != null) { shop.lng = pinLng; patch.lng = pinLng; }
      if (!String(shop.address || '').trim() && pinAddr) { shop.address = pinAddr; patch.address = pinAddr; }
      if (Object.keys(patch).length && sbConfigured()) {
        try { await sbSend('shops?id=eq.' + encodeURIComponent(sid), 'PATCH', patch); } catch (_) {}
      }
      try { API.setPendingShop(null); } catch (_) {}
    }
    const mapped = mapShop(shop);
    const i = API.shops.findIndex((s) => s.id === sid);
    if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
    else API.shops.push(mapped);
    if (mapped.name && !isDemoShopName(mapped.name) && !isPlaceholderShopName(mapped.name)) user.shopName = mapped.name;
    return user;
  }

  function clearAllLocalAuth() {
    API.user = null;
    API.token = null;
    API._verified = null;
    API._pendingShop = null;
    API._pendingRider = null;
    API.shops = [];
    API.items = [];
    API.orders = [];
    API.messages = {};
    try { if (typeof keptOrders !== 'undefined') keptOrders.length = 0; } catch (_) {}
    ['customer', 'user', 'shop', 'rider'].forEach(function (role) {
      try { sessionKeys(role).forEach(storeDel); } catch (_) {}
      try { cookieClear(role); } catch (_) {}
      try { storeDel(verifiedKey(role)); } catch (_) {}
    });
    try { storeDel('sd_pending_shop'); storeDel('sd_pending_rider'); } catch (_) {}
    try {
      const dump = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k !== 'qb_gen' && /^(sd_|qb_)/.test(k)) dump.push(k);
      }
      dump.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (_) {}
        try { sessionStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
    clearAccCache();
  }

  function clearShopLocal() {
    API.shops = [];
    API.items = [];
    API.orders = [];
    API.messages = {};
    try { if (typeof keptOrders !== 'undefined') keptOrders.length = 0; } catch (_) {}
    try { sessionKeys('shop').forEach(storeDel); } catch (_) {}
    try { cookieClear('shop'); } catch (_) {}
    try { storeDel(verifiedKey('shop')); } catch (_) {}
    try { storeDel('sd_pending_shop'); } catch (_) {}
    try {
      const dump = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (/^(sd_|qb_).*shop/i.test(k) || k.indexOf('sd_shop_') === 0 || k.indexOf('qb_shop_') === 0 || k.indexOf('sd_pending_shop') === 0)) dump.push(k);
      }
      dump.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (_) {}
        try { sessionStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
    if (API.user && sameRole(API.user.role, 'shop')) {
      API.user = null;
      API.token = null;
    }
    clearAccCache();
  }

  async function wipeShopData() {
    if (API._wipedShops) return true;
    let failed = 0;
    if (sbConfigured()) {
      const paths = [
        'messages?order_id=not.is.null',
        'orders?id=not.is.null',
        'menu_items?id=not.is.null',
        'shops?id=not.is.null',
        'accounts?role=eq.shop',
        'otp_codes?role=eq.shop',
      ];
      for (let i = 0; i < paths.length; i++) {
        try { await sbSend(paths[i], 'DELETE'); } catch (_) { failed++; }
      }
    } else {
      failed = 1;
    }
    if (failed) return false;
    API._wipedShops = true;
    clearShopLocal();
    notify(true);
    return true;
  }

  async function wipeTableAll(table) {
    const missing = /404|PGRST205|does not exist/i;
    const bulk = table === 'messages' ? ['order_id=not.is.null', 'id=not.is.null', 'id=neq._'] : ['id=not.is.null', 'id=neq._'];
    if (table === 'accounts') {
      bulk.push(
        'phone=not.is.null',
        'email=not.is.null',
        'pin=eq.google',
        'pin=like.google*',
        'pin=like.p:*',
        'role=eq.shop',
        'role=eq.customer',
        'role=eq.rider',
        'role=eq.user',
      );
    }
    if (table === 'otp_codes') bulk.push('phone=not.is.null', 'role=eq.shop', 'role=eq.customer', 'role=eq.rider', 'role=eq.user');
    if (table === 'shops') bulk.push('name=not.is.null');
    if (table === 'menu_items') bulk.push('shop_id=not.is.null', 'name=not.is.null');
    for (let i = 0; i < bulk.length; i++) {
      try { await sbSend(table + '?' + bulk[i], 'DELETE'); } catch (e) {
        if (missing.test(String(e && e.message))) return true;
      }
    }
    for (let round = 0; round < 8; round++) {
      let rows = [];
      try { rows = asRows(await sbGet(table + '?select=*&limit=1000')); } catch (e) {
        if (missing.test(String(e && e.message))) return true;
        break;
      }
      if (!rows.length) return true;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          if (table === 'messages' && r.order_id != null) {
            await sbSend('messages?order_id=eq.' + encodeURIComponent(r.order_id) + '&id=eq.' + encodeURIComponent(r.id), 'DELETE');
          } else if (r.id != null) {
            await sbSend(table + '?id=eq.' + encodeURIComponent(r.id), 'DELETE');
            if (r.email) {
              try { await sbSend(table + '?email=eq.' + encodeURIComponent(r.email), 'DELETE'); } catch (_) {}
            }
            if (r.phone) {
              try { await sbSend(table + '?phone=eq.' + encodeURIComponent(r.phone), 'DELETE'); } catch (_) {}
            }
          } else if (r.phone) {
            await sbSend(table + '?phone=eq.' + encodeURIComponent(r.phone), 'DELETE');
          } else if (r.email) {
            await sbSend(table + '?email=eq.' + encodeURIComponent(r.email), 'DELETE');
          }
        } catch (_) {}
      }
    }
    try {
      const left = asRows(await sbGet(table + '?select=id&limit=1'));
      return !left.length;
    } catch (_) { return true; }
  }

  async function countTable(table) {
    try { return asRows(await sbGet(table + '?select=id&limit=50')).length; } catch (_) { return 0; }
  }

  async function wipeAllData() {
    if (API._wipedAll) return true;
    if (!sbConfigured()) return false;
    const tables = ['messages', 'orders', 'menu_items', 'shops', 'accounts', 'otp_codes', 'app_state'];
    for (let attempt = 0; attempt < 6; attempt++) {
      for (let i = 0; i < tables.length; i++) {
        try { await wipeTableAll(tables[i]); } catch (_) {}
      }
      const shopsLeft = await countTable('shops');
      const itemsLeft = await countTable('menu_items');
      const accLeft = await countTable('accounts');
      const ordLeft = await countTable('orders');
      if (!shopsLeft && !itemsLeft && !accLeft && !ordLeft) {
        API._wipedAll = true;
        clearAllLocalAuth();
        notify(true);
        return true;
      }
    }
    return false;
  }

  async function oneShotEmptyDb() {
    if (!sbConfigured()) return;
    if (API.user) return;
    const GEN = '19y';
    try {
      const rows = asRows(await sbGet('app_state?id=eq.qb_empty&select=*'));
      const p = rows && rows[0] && rows[0].payload;
      if (p && String(p.v || '') === GEN) return;
    } catch (_) {}
    let accLeft = 0;
    try { accLeft = await countTable('accounts'); } catch (_) { accLeft = 1; }
    if (accLeft) {
      try { await sbSend('app_state', 'POST', [{ id: 'qb_empty', payload: { v: GEN, at: Date.now() } }]); } catch (_) {}
      return;
    }
    API._wipedAll = false;
    const ok = await wipeAllData();
    if (!ok) return;
    try {
      await sbSend('app_state', 'POST', [{ id: 'qb_empty', payload: { v: GEN, at: Date.now() } }]);
    } catch (_) {
      try { await sbSend('app_state?id=eq.qb_empty', 'PATCH', { payload: { v: GEN, at: Date.now() } }); } catch (_) {}
    }
  }

  async function wipeTestNumber() {
    let force = '';
    try { force = new URLSearchParams(location.search || '').get('wipe') || ''; } catch (_) {}
    if (!force) return;
    const f = String(force).trim().toLowerCase();
    if (f === 'shops' || f === 'shop') {
      const ok = await wipeShopData();
      try {
        alert(ok
          ? 'All Shop data was deleted. User and Rider accounts were kept. Register a shop again.'
          : 'Could not fully wipe shop data. Refresh this wipe link.');
        if (ok) {
          API._phoneWiped = true;
          const u = new URL(location.href);
          u.searchParams.delete('wipe');
          history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
        }
      } catch (_) {}
      return;
    }
    if (f === 'all' || f === '*' || f === 'reset') {
      API._wipedAll = false;
      try { clearAllLocalAuth(); } catch (_) {}
      const ok = await wipeAllData();
      try {
        alert(ok
          ? 'All User, Shop, and Rider data was deleted. Start again from WhatsApp OTP.'
          : 'Could not fully wipe the database. Refresh this wipe link.');
        if (ok) {
          API._phoneWiped = true;
          const u = new URL(location.href);
          u.searchParams.delete('wipe');
          history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
        }
      } catch (_) {}
      return;
    }
    if (API._phoneWiped || !sbConfigured()) return;
    API._phoneWiped = true;
    await wipeShopRole(force);
  }

  async function wipeDemo() {
    purgeLocalDemoStores();
    if (!sbConfigured()) return;
    const shopsIn = DEMO_SHOP_IDS.map((id) => '"' + id + '"').join(',');
    const itemsIn = DEMO_ITEM_IDS.map((id) => '"' + id + '"').join(',');
    const accIn = DEMO_ACCOUNT_IDS.map((id) => '"' + id + '"').join(',');
    const phonesIn = DEMO_PHONES.map((p) => '"' + p + '"').join(',');
    const ordersIn = DEMO_ORDER_IDS.map((id) => '"' + id + '"').join(',');
    const paths = [
      'messages?order_id=in.(' + ordersIn + ')',
      'orders?id=in.(' + ordersIn + ')',
      'orders?shop_id=in.(' + shopsIn + ')',
      'orders?user_id=in.("USER_1","USER_2")',
      'orders?customer_phone=in.(' + phonesIn + ')',
      'menu_items?shop_id=in.(' + shopsIn + ')',
      'menu_items?id=in.(' + itemsIn + ')',
      'shops?id=in.(' + shopsIn + ')',
      'accounts?id=in.(' + accIn + ')',
      'accounts?phone=in.(' + phonesIn + ')',
      'otp_codes?phone=in.(' + phonesIn + ')',
    ];
    for (let i = 0; i < paths.length; i++) {
      try { await sbSend(paths[i], 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < DEMO_SHOP_NAMES.length; i++) {
      const n = DEMO_SHOP_NAMES[i];
      try { await sbSend('shops?name=eq.' + encodeURIComponent(n), 'DELETE'); } catch (_) {}
      try { await sbSend('orders?shop_name=eq.' + encodeURIComponent(n), 'PATCH', { shop_name: '' }); } catch (_) {}
    }
    clearAccCache();
  }
  async function lookupPhone(phone, role) {
    const key = phoneKey(phone);
    if (!key) return null;
    const want = roleTag(role || 'customer');
    const id = accountIdFor(phone, want);
    const n = normalizePhone(phone);
    const variants = [n, key, '0' + key, '94' + key];
    const byId = {};
    function add(raw) {
      if (!raw) return;
      const a = mapAccount(raw);
      if (!a || !a.id || isDemoAccount(a)) return;
      if (phoneKey(a.phone) !== key && a.id !== id) return;
      if (!sameRole(a.role, want)) return;
      if (/^07\d{8}$/.test(n) && isPlaceholderPhone(a.phone) && a.id !== id) return;
      byId[a.id] = a;
    }
    if (sbConfigured()) {
      try {
        asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(id) + '&select=*')).forEach(add);
      } catch (_) {}
      for (let i = 0; i < variants.length; i++) {
        try {
          asRows(await sbGet('accounts?phone=eq.' + encodeURIComponent(variants[i]) + '&select=*')).forEach(add);
        } catch (_) {}
      }
    }
    (await allAccounts()).forEach(add);
    const list = Object.keys(byId).map(function (k) { return byId[k]; });
    if (!list.length) return null;
    const keep = byId[id] || list.find(function (a) { return !isPlaceholderPhone(a.phone); }) || list[0];
    return keep;
  }

  async function saveAccount(row) {
    const orig = normalizePhone(row.phone);
    row.phone = orig;
    const em = String(row.email || '').trim().toLowerCase();
    if (em.indexOf('@') >= 0) {
      const byE = await lookupEmail(em, row.role);
      if (byE && byE.id !== row.id) {
        if (emailsEqual(byE.email, em) && isPlaceholderPhone(byE.phone) && !isPlaceholderPhone(orig)) {
          return byE;
        }
        if (emailsEqual(byE.email, em) && (isPlaceholderPhone(orig) || normalizePhone(byE.phone) === orig)) {
          return byE;
        }
        throw alreadyEmailError(row.role);
      }
      if (byE && byE.id === row.id) return Object.assign({}, byE, row, { id: byE.id, phone: byE.phone || orig, email: em });
    }
    if (orig && !isPlaceholderPhone(orig)) {
      const byP = await lookupPhone(orig, row.role);
      if (byP && byP.id !== row.id) {
        if (emailsEqual(byP.email, em)) return byP;
        throw alreadyThisRoleError(row.role);
      }
    }
    try {
      await sbSend('accounts', 'POST', [row]);
      clearAccCache();
      return row;
    } catch (_) {}
    try {
      const existing = asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(row.id) + '&select=*'));
      if (existing[0] && !isDemoAccount(existing[0]) && sameRole(existing[0].role, row.role)) {
        const got = mapAccount(existing[0]);
        if (em && got.email && !emailsEqual(got.email, em)) throw alreadyEmailError(row.role);
        return Object.assign({}, got, { email: em || got.email });
      }
    } catch (e) {
      if (e && /already has a/.test(String(e.message || ''))) throw e;
    }
    if (orig && !isPlaceholderPhone(orig)) {
      const again = await lookupPhone(orig, row.role);
      if (again) {
        if (!em || !again.email || emailsEqual(again.email, em) || again.id === row.id) return again;
        throw alreadyThisRoleError(row.role);
      }
    }
    clearAccCache();
    throw new Error('Could not save this account. Try again.');
  }

  API.saveProfile = async function (fields) {
    const u = API.user;
    if (!u || !u.id) throw new Error('Sign in first');
    const patch = {};
    if (fields && fields.name != null) {
      const name = String(fields.name).trim();
      if (!name) throw new Error('Enter your name.');
      patch.name = name;
    }
    if (fields && fields.email != null) {
      const email = String(fields.email).trim().toLowerCase();
      patch.email = email || null;
    }
    if (fields && fields.vehicle != null) {
      const v = String(fields.vehicle).trim();
      if (v && !/^https?:/i.test(v)) patch.vehicle = v;
    }
    if (!Object.keys(patch).length) return u;
    try { await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', patch); } catch (_) {}
    Object.assign(u, patch);
    if (patch.email === null) u.email = '';
    API.user = u;
    saveSession();
    notify(true);
    return u;
  };

  var RIDER_DOCS_MARK = 'QBDOCS:';
  function parseSriNic(raw) {
    const s = String(raw || '').toUpperCase().replace(/[\s-]/g, '');
    if (/^\d{9}[VX]$/.test(s) || /^\d{12}$/.test(s)) return s;
    return '';
  }
  function parseLkPlate(raw) {
    const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/^(?:(?:WP|SP|CP|NP|EP|NW|SG|UP|NC)[-\s]+)?(?:[A-Z]{2,3}|[0-9]{2,3})[-\s]?\d{4}$/.test(s)) return s;
    return '';
  }
  function parseLicenseId(raw) {
    const s = String(raw || '').toUpperCase().replace(/[\s\-/]/g, '');
    if (s.length >= 5 && s.length <= 20 && /^[A-Z0-9]+$/.test(s)) return s;
    return '';
  }
  API.parseSriNic = parseSriNic;
  API.parseLicenseId = parseLicenseId;
  API.parseLkPlate = parseLkPlate;
  function compressIdImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Choose a photo.'));
      if (typeof file === 'string') return resolve(file);
      let url = '';
      try { url = URL.createObjectURL(file); } catch (_) {}
      const img = new Image();
      const fail = function () {
        if (url) try { URL.revokeObjectURL(url); } catch (_) {}
        blobToDataUrl(file).then(resolve).catch(reject);
      };
      img.onload = function () {
        if (url) try { URL.revokeObjectURL(url); } catch (_) {}
        let w = img.naturalWidth || img.width || 1;
        let h = img.naturalHeight || img.height || 1;
        const scale = Math.min(1, 1400 / Math.max(w, h, 1));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return fail();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.82;
        function asUrl() {
          try { resolve(c.toDataURL('image/jpeg', q)); } catch (e) { reject(e); }
        }
        if (!c.toBlob) return asUrl();
        const tryBlob = function () {
          c.toBlob(function (blob) {
            if (!blob) return asUrl();
            if (blob.size > 750000 && q > 0.5) {
              q -= 0.1;
              tryBlob();
              return;
            }
            resolve(blob);
          }, 'image/jpeg', q);
        };
        tryBlob();
      };
      img.onerror = fail;
      img.src = url || '';
    });
  }
  function looksLikePhoto(src) {
    const s = String(src || '');
    return /^https?:|^data:image\//i.test(s);
  }
  function riderDocCacheKey(user) {
    const u = user || API.user || {};
    const id = String(u.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
    return id ? 'qb_rdoc_' + id : '';
  }
  function readCachedDocPhotos(user) {
    try {
      const k = riderDocCacheKey(user);
      if (!k) return {};
      const j = JSON.parse(localStorage.getItem(k) || '{}');
      return j && typeof j === 'object' ? j : {};
    } catch (_) { return {}; }
  }
  function writeCachedDocPhotos(user, fields) {
    const k = riderDocCacheKey(user);
    if (!k || !fields) return;
    const cur = readCachedDocPhotos(user);
    ['nicPhoto', 'nicPhotoBack', 'licensePhoto', 'licensePhotoBack', 'facePhoto'].forEach(function (key) {
      delete cur[key];
    });
    ['regPhoto', 'avatar'].forEach(function (key) {
      const v = String(fields[key] || '');
      if (looksLikePhoto(v)) cur[key] = v;
    });
    try { localStorage.setItem(k, JSON.stringify(cur)); } catch (_) {}
  }
  API.verifyIdDocument = async function (kind, frontSrc, backSrc) {
    async function pack(src) {
      if (!src) throw new Error('Upload front and back photos.');
      if (typeof src !== 'string' && (src instanceof Blob || src.size)) {
        const c = await compressIdImage(src);
        return typeof c === 'string' ? c : await blobToDataUrl(c);
      }
      const s = String(src);
      if (!looksLikePhoto(s)) throw new Error('Upload this photo again.');
      return s;
    }
    const front = await pack(frontSrc);
    const back = await pack(backSrc);
    const res = await fetch((API.base || '') + '/api/verify-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: kind,
        front: front,
        back: back,
        riderId: (API.user && API.user.id) || '',
      }),
    });
    let j = {};
    try { j = await res.json(); } catch (_) { j = {}; }
    if (!res.ok || j.ok === false) throw new Error(j.message || 'Could not verify this document.');
    return j;
  };
  API.verifyLiveness = async function (faceSrc) {
    async function pack(src) {
      if (!src) throw new Error('Take a selfie of your face.');
      if (typeof src !== 'string' && (src instanceof Blob || src.size)) {
        const c = await compressIdImage(src);
        return typeof c === 'string' ? c : await blobToDataUrl(c);
      }
      const s = String(src);
      if (!looksLikePhoto(s)) throw new Error('Take a selfie of your face.');
      return s;
    }
    const face = await pack(faceSrc);
    const res = await fetch((API.base || '') + '/api/verify-liveness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        face: face,
        riderId: (API.user && API.user.id) || '',
      }),
    });
    let j = {};
    try { j = await res.json(); } catch (_) { j = {}; }
    if (!res.ok || j.ok === false) throw new Error(j.message || 'Could not check this selfie.');
    return j;
  };
  API.startRiderKyc = async function () {
    const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const res = await fetch((API.base || '') + '/api/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riderId: (API.user && API.user.id) || '',
        callback: origin ? origin + '/rider.html?didit=done' : '',
      }),
    });
    let j = {};
    try { j = await res.json(); } catch (_) { j = {}; }
    if (!res.ok || j.ok === false) throw new Error(j.message || 'Could not start free ID check.');
    return j;
  };
  API.riderKycDecision = async function (sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) throw new Error('Missing session.');
    const res = await fetch((API.base || '') + '/api/verify-session?id=' + encodeURIComponent(id));
    let j = {};
    try { j = await res.json(); } catch (_) { j = {}; }
    if (!res.ok || j.ok === false) throw new Error(j.message || 'Could not read this ID check.');
    return j;
  };
  function riderDocsFromUser(user) {
    const u = user || API.user || {};
    const out = {
      nic: '', licenseId: '', nicPhoto: '', nicPhotoBack: '',
      licensePhoto: '', licensePhotoBack: '', facePhoto: '',
      plate: '', vehicleType: 'Motorcycle', regPhoto: '', registered: false,
      nicKyc: '', licenseKyc: '', nicKycId: '', licenseKycId: '', nicName: '', licenseName: '',
      amlKyc: '', amlHits: 0, amlRequestId: '',
      livenessKyc: '', livenessScore: null, livenessRequestId: '',
      kycSession: '', kycEvent: '', avatar: '',
    };
    const addr = String(u.address || '');
    if (addr.indexOf(RIDER_DOCS_MARK) === 0) {
      try {
        const j = JSON.parse(addr.slice(RIDER_DOCS_MARK.length));
        if (j && typeof j === 'object') {
          out.nic = String(j.nic || '');
          out.licenseId = String(j.licenseId || '');
          out.nicPhoto = '';
          out.nicPhotoBack = '';
          out.licensePhoto = '';
          out.licensePhotoBack = '';
          out.plate = String(j.plate || '');
          out.vehicleType = String(j.vehicleType || 'Motorcycle') || 'Motorcycle';
          out.regPhoto = String(j.regPhoto || '');
          out.registered = j.registered === true || j.registered === '1';
          out.nicKyc = String(j.nicKyc || '').toLowerCase();
          out.licenseKyc = String(j.licenseKyc || '').toLowerCase();
          out.nicKycId = String(j.nicKycId || '');
          out.licenseKycId = String(j.licenseKycId || '');
          out.nicName = String(j.nicName || '');
          out.licenseName = String(j.licenseName || '');
          out.amlKyc = String(j.amlKyc || '').toLowerCase();
          out.amlHits = Math.max(0, Math.round(Number(j.amlHits) || 0));
          out.amlRequestId = String(j.amlRequestId || '');
          out.facePhoto = '';
          out.livenessKyc = String(j.livenessKyc || '').toLowerCase();
          out.livenessScore = j.livenessScore == null || j.livenessScore === '' ? null : Number(j.livenessScore);
          out.livenessRequestId = String(j.livenessRequestId || '');
          out.kycSession = String(j.kycSession || '');
          out.kycEvent = String(j.kycEvent || '');
          out.avatar = /^https?:\/\//i.test(String(j.avatar || '')) ? String(j.avatar) : '';
        }
      } catch (_) {}
    }
    const cached = readCachedDocPhotos(u);
    ['regPhoto', 'avatar'].forEach(function (k) {
      const cur = String(out[k] || '');
      if ((!cur || cur === 'uploaded') && looksLikePhoto(cached[k])) out[k] = cached[k];
    });
    const veh = String(u.vehicle || '').trim();
    if (veh && !/^https?:/i.test(veh)) {
      const bits = veh.split(/\s*[·|,]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (bits.length >= 2) {
        out.vehicleType = bits[0] || out.vehicleType;
        out.plate = bits[1] || out.plate;
      } else if (parseLkPlate(veh) && !out.plate) out.plate = parseLkPlate(veh);
    }
    return out;
  }
  API.riderDocs = function (user) { return riderDocsFromUser(user); };
  API.isRiderVerified = function (user) {
    const d = riderDocsFromUser(user);
    if (d.nicKyc !== 'approved' || d.licenseKyc !== 'approved' || d.livenessKyc !== 'approved') return false;
    if (!parseLkPlate(d.plate) || !d.registered) return false;
    return true;
  };
  API.saveRiderDocs = async function (fields) {
    const u = API.user;
    if (!u || !u.id) throw new Error('Sign in first');
    if (!sameRole(u.role, 'rider')) throw new Error('Open the Rider app.');
    const cur = riderDocsFromUser(u);
    const next = Object.assign({}, cur, fields || {});
    const nicIn = String(next.nic || '').trim();
    const nic = parseSriNic(nicIn);
    if (nicIn && !nic) throw new Error('Enter a valid NIC (9 digits + V or X, or 12 digits).');
    const plateIn = String(next.plate || '').trim();
    const plate = parseLkPlate(plateIn);
    if (plateIn && !plate) throw new Error('Enter a valid Sri Lanka vehicle number.');
    const licIn = String(next.licenseId || '').trim();
    const licenseId = parseLicenseId(licIn);
    if (licIn && !licenseId) throw new Error('Enter a valid driving licence number.');
    const pack = {
      nic: nic || '',
      licenseId: licenseId || '',
      nicPhoto: '',
      nicPhotoBack: '',
      licensePhoto: '',
      licensePhotoBack: '',
      plate: plate || '',
      vehicleType: String(next.vehicleType || 'Motorcycle').trim() || 'Motorcycle',
      regPhoto: String(next.regPhoto || ''),
      registered: next.registered === true,
      nicKyc: String(next.nicKyc || '').toLowerCase() === 'approved' ? 'approved' : String(next.nicKyc || ''),
      licenseKyc: String(next.licenseKyc || '').toLowerCase() === 'approved' ? 'approved' : String(next.licenseKyc || ''),
      nicKycId: String(next.nicKycId || '').slice(0, 80),
      licenseKycId: String(next.licenseKycId || '').slice(0, 80),
      nicName: String(next.nicName || '').slice(0, 80),
      licenseName: String(next.licenseName || '').slice(0, 80),
      amlKyc: String(next.amlKyc || '').slice(0, 24),
      amlHits: Math.max(0, Math.round(Number(next.amlHits) || 0)),
      amlRequestId: String(next.amlRequestId || '').slice(0, 80),
      facePhoto: '',
      livenessKyc: String(next.livenessKyc || '').toLowerCase() === 'approved' ? 'approved' : String(next.livenessKyc || ''),
      livenessScore: next.livenessScore == null || next.livenessScore === '' ? null : Number(next.livenessScore),
      livenessRequestId: String(next.livenessRequestId || '').slice(0, 80),
      kycSession: String(next.kycSession || '').slice(0, 80),
      kycEvent: String(next.kycEvent || '').slice(0, 80),
      avatar: /^https?:\/\//i.test(String(next.avatar || '')) ? String(next.avatar) : '',
    };
    function docsPatch(body) {
      const patch = { address: RIDER_DOCS_MARK + JSON.stringify(body) };
      if (body.plate) patch.vehicle = body.vehicleType + ' · ' + body.plate;
      return patch;
    }
    writeCachedDocPhotos(u, pack);
    let patch = docsPatch(pack);
    if (sbConfigured()) {
      try {
        await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', patch);
      } catch (_) {
        const slim = Object.assign({}, pack);
        ['regPhoto'].forEach(function (k) {
          if (String(slim[k] || '').indexOf('data:') === 0) slim[k] = 'uploaded';
        });
        patch = docsPatch(slim);
        try {
          await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', patch);
        } catch (e2) {
          throw new Error('Could not save verification. Try a smaller photo.');
        }
      }
    }
    Object.assign(u, patch);
    API.user = u;
    saveSession();
    notify(true);
    return u;
  };

  function emptyWallet() {
    return {
      bank: { bankName: '', accountName: '', accountNo: '', branch: '' },
      requests: [],
    };
  }
  function walletKey(user) {
    const u = user || API.user;
    if (!u || !u.id) return '';
    const role = roleTag(u.role || 'rider');
    const id = String(u.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
    return 'qb_wallet_' + role + '_' + id;
  }
  function normalizeWallet(raw) {
    const w = emptyWallet();
    let p = raw;
    if (typeof p === 'string') {
      try { p = JSON.parse(p); } catch (_) { p = null; }
    }
    if (!p || typeof p !== 'object') return w;
    const b = p.bank || {};
    w.bank.bankName = String(b.bankName || b.name || '').trim();
    w.bank.accountName = String(b.accountName || b.holder || '').trim();
    w.bank.accountNo = String(b.accountNo || b.number || '').replace(/\s+/g, '');
    w.bank.branch = String(b.branch || '').trim();
    w.requests = (Array.isArray(p.requests) ? p.requests : []).map(function (r) {
      if (!r) return null;
      const amount = Math.max(0, Math.round(Number(r.amount) || 0));
      if (!amount) return null;
      const st = String(r.status || 'pending');
      const status = st === 'transferred' ? 'transferred'
        : (st === 'rejected' || st === 'cancelled' ? st : 'pending');
      return {
        id: String(r.id || ('WD-' + Date.now().toString(36))),
        amount: amount,
        ts: Number(r.ts) || Date.now(),
        status: status,
        transferredAt: Number(r.transferredAt) || 0,
        rejectedAt: Number(r.rejectedAt) || 0,
        bankName: String(r.bankName || '').trim(),
        accountNo: String(r.accountNo || '').trim(),
        paymentRef: String(r.paymentRef || '').trim(),
        reason: String(r.reason || '').trim(),
        decidedBy: String(r.decidedBy || '').trim(),
        note: String(r.note || ''),
      };
    }).filter(Boolean);
    return w;
  }
  API.wallet = emptyWallet();
  API.sriLankaBanks = [
    'Amana Bank PLC',
    'Bank of Ceylon',
    'Bank of China Ltd.',
    'Cargills Bank PLC',
    'Citibank N.A.',
    'Commercial Bank of Ceylon PLC',
    'Deutsche Bank AG',
    'DFCC Bank PLC',
    'Habib Bank Ltd.',
    'Hatton National Bank PLC',
    'HDFC Bank of Sri Lanka',
    'HSBC',
    'Indian Bank',
    'Indian Overseas Bank',
    'MCB Bank Ltd.',
    'National Development Bank PLC',
    'National Savings Bank',
    'Nations Trust Bank PLC',
    'Pan Asia Banking Corporation PLC',
    "People's Bank",
    'Pradeshiya Sanwardhana Bank',
    'Public Bank Berhad',
    'Sampath Bank PLC',
    'SANASA Development Bank PLC',
    'Seylan Bank PLC',
    'Sri Lanka Savings Bank Ltd.',
    'Standard Chartered Bank',
    'State Bank of India',
    'State Mortgage and Investment Bank',
    'Union Bank of Colombo PLC',
  ];
  API.bankReady = function () {
    const b = (API.wallet && API.wallet.bank) || {};
    return !!(b.bankName && b.accountName && b.accountNo && b.branch);
  };
  API.walletHeld = function () {
    return (API.wallet && API.wallet.requests || []).reduce(function (n, r) {
      if (!r || r.status === 'cancelled' || r.status === 'rejected') return n;
      return n + Math.max(0, Number(r.amount) || 0);
    }, 0);
  };
  API.walletAvailable = function (gross) {
    return Math.max(0, Math.round(Number(gross) || 0) - API.walletHeld());
  };
  async function persistWallet() {
    const key = walletKey();
    if (!key) throw new Error('Sign in first');
    const payload = API.wallet || emptyWallet();
    if (sbConfigured()) {
      await sbPutRow('app_state', { id: key, payload: payload });
      return;
    }
    try { storeSet(key, JSON.stringify(payload)); } catch (_) {}
  }
  API.loadWallet = async function () {
    const key = walletKey();
    if (!key) {
      API.wallet = emptyWallet();
      return API.wallet;
    }
    if (sbConfigured()) {
      try {
        const rows = asRows(await sbGet('app_state?id=eq.' + encodeURIComponent(key) + '&select=*'));
        API.wallet = normalizeWallet(rows[0] && rows[0].payload);
        return API.wallet;
      } catch (_) {}
    }
    try {
      const raw = storeGet(key);
      if (raw) API.wallet = normalizeWallet(JSON.parse(raw));
      else API.wallet = emptyWallet();
    } catch (_) {
      API.wallet = emptyWallet();
    }
    return API.wallet;
  };
  API.saveBankDetails = async function (fields) {
    const u = API.user;
    if (!u || !u.id) throw new Error('Sign in first');
    const bankName = String(fields && fields.bankName || '').trim();
    const accountName = String(fields && fields.accountName || '').trim();
    const accountNo = String(fields && fields.accountNo || '').replace(/\s+/g, '');
    const branch = String(fields && fields.branch || '').trim();
    const allowed = API.sriLankaBanks || [];
    if (!bankName || allowed.indexOf(bankName) < 0) throw new Error('Choose your bank from the list.');
    if (accountName.length < 2) throw new Error('Enter the account holder name.');
    if (!/^\d{6,20}$/.test(accountNo)) throw new Error('Enter a valid account number.');
    if (branch.length < 2) throw new Error('Enter the branch.');
    if (!API.wallet) API.wallet = emptyWallet();
    API.wallet.bank = { bankName: bankName, accountName: accountName, accountNo: accountNo, branch: branch };
    await persistWallet();
    notify(true);
    return API.wallet.bank;
  };
  API.applyWithdraw = async function (amount, gross) {
    const u = API.user;
    if (!u || !u.id) throw new Error('Sign in first');
    if (!API.bankReady()) throw new Error('Add bank details first.');
    const n = Math.round(Number(amount) || 0);
    if (n < 1) throw new Error('Enter an amount to withdraw.');
    const avail = API.walletAvailable(gross);
    if (n > avail) throw new Error('Not enough available balance.');
    const b = API.wallet.bank;
    const req = {
      id: 'WD-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      amount: n,
      ts: Date.now(),
      status: 'pending',
      transferredAt: 0,
      bankName: b.bankName,
      accountNo: b.accountNo,
    };
    API.wallet.requests = [req].concat(API.wallet.requests || []);
    await persistWallet();
    notify(true);
    return req;
  };

  function supportKey(user) {
    const u = user || API.user;
    if (!u || !u.id) return '';
    const id = String(u.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
    return 'qb_support_customer_' + id;
  }
  function emptySupport() {
    return {
      mode: 'ai', ticket: '', status: 'open', messages: [], escalatedAt: 0, reason: '', queuedNote: false,
      awaitingRating: false, rating: 0, ratings: [], sessions: [], agentClosedAt: 0, closeReason: '', ratedAt: 0, chatGen: 0,
    };
  }
  var AGENT_IDLE_MS = 3 * 60 * 1000;
  function supportLastTs(messages, roles) {
    let t = 0;
    (messages || []).forEach(function (m) {
      if (!m) return;
      if (roles && roles.indexOf(m.role) < 0) return;
      t = Math.max(t, Number(m.ts) || 0);
    });
    return t;
  }
  function shouldIdleCloseSupport(s, now) {
    if (!s || s.mode !== 'agent') return false;
    const nowMs = Number(now) || Date.now();
    const lastUser = supportLastTs(s.messages, ['user']);
    const lastAgent = Math.max(Number(s.escalatedAt) || 0, supportLastTs(s.messages, ['agent', 'assistant', 'system']));
    if (lastUser > lastAgent) return false;
    const anchor = lastAgent || Number(s.escalatedAt) || 0;
    if (!anchor) return false;
    return (nowMs - anchor) >= AGENT_IDLE_MS;
  }
  function closeAgentSessionLocal(s, reason, now) {
    const t = s || emptySupport();
    const ts = Number(now) || Date.now();
    const why = String(reason || 'closed');
    t.mode = 'ai';
    t.status = 'closed';
    t.queuedNote = false;
    t.awaitingRating = true;
    t.agentClosedAt = ts;
    t.closeReason = why;
    t.escalatedAt = 0;
    const gen = Math.max(0, Math.round(Number(t.chatGen) || 0));
    t.sessions = (t.sessions || []).concat([{ closedAt: ts, reason: why, rating: 0, gen: gen }]);
    t.messages = (t.messages || []).concat([{
      role: 'system',
      text: why === 'idle'
        ? 'The agent session closed after 3 minutes with no reply. Rate this agent, then AI Help continues.'
        : 'The agent closed this chat. Rate this agent session. AI Help continues after you rate.',
      ts: ts,
      gen: gen,
    }]);
    t.chatGen = gen + 1;
    return t;
  }
  function normalizeSupport(raw) {
    const s = emptySupport();
    let p = raw;
    if (typeof p === 'string') {
      try { p = JSON.parse(p); } catch (_) { p = null; }
    }
    if (!p || typeof p !== 'object') return s;
    s.mode = p.mode === 'agent' ? 'agent' : 'ai';
    s.status = p.status === 'closed' || p.status === 'resolved' || p.status === 'in_progress' || p.status === 'waiting' || p.status === 'new' || p.status === 'open'
      ? String(p.status)
      : (s.mode === 'agent' ? 'in_progress' : 'open');
    s.ticket = String(p.ticket || '').trim();
    s.escalatedAt = Number(p.escalatedAt) || 0;
    s.reason = String(p.reason || '');
    s.queuedNote = !!p.queuedNote;
    s.awaitingRating = p.awaitingRating === true;
    s.rating = Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0)));
    s.agentClosedAt = Number(p.agentClosedAt) || 0;
    s.closeReason = String(p.closeReason || '');
    s.ratedAt = Number(p.ratedAt) || 0;
    s.chatGen = Math.max(0, Math.round(Number(p.chatGen) || 0));
    s.ratings = Array.isArray(p.ratings) ? p.ratings : [];
    s.sessions = Array.isArray(p.sessions) ? p.sessions : [];
    s.messages = (Array.isArray(p.messages) ? p.messages : []).map(function (m) {
      if (!m) return null;
      const role = m.role === 'assistant' || m.role === 'agent' || m.role === 'system' ? m.role : 'user';
      const text = String(m.text || m.content || '').trim();
      if (!text) return null;
      return { role: role, text: text, ts: Number(m.ts) || Date.now(), gen: Math.max(0, Math.round(Number(m.gen) || 0)) };
    }).filter(Boolean).slice(-80);
    return s;
  }
  API.support = emptySupport();
  function supportMsgKey(m) {
    return String(m.role || '') + '|' + String(m.text || '').slice(0, 120) + '|' + String(Math.round((Number(m.ts) || 0) / 1500));
  }
  function mergeSupportMessages(a, b) {
    const seen = {};
    const out = [];
    (a || []).concat(b || []).forEach(function (m) {
      if (!m || !String(m.text || '').trim()) return;
      const k = supportMsgKey(m);
      if (seen[k]) return;
      seen[k] = true;
      out.push(m);
    });
    out.sort(function (x, y) { return (Number(x.ts) || 0) - (Number(y.ts) || 0); });
    return out.slice(-80);
  }
  function mergeSupportState(remote, local) {
    const r = remote || emptySupport();
    const l = local || emptySupport();
    const rLast = supportLastTs(r.messages);
    const lLast = supportLastTs(l.messages);
    const src = rLast >= lLast ? r : l;
    const next = Object.assign(emptySupport(), src);
    next.messages = mergeSupportMessages(r.messages, l.messages);
    next.chatGen = Math.max(Number(r.chatGen) || 0, Number(l.chatGen) || 0);
    next.ticket = r.ticket || l.ticket || next.ticket;
    next.rating = Math.max(Number(r.rating) || 0, Number(l.rating) || 0);
    next.ratedAt = Math.max(Number(r.ratedAt) || 0, Number(l.ratedAt) || 0);
    if ((l.sessions || []).length > (r.sessions || []).length) next.sessions = l.sessions;
    else if ((r.sessions || []).length) next.sessions = r.sessions;
    const localLive = l.mode === 'agent' && l.status !== 'closed' && l.status !== 'resolved' && !l.awaitingRating;
    const remoteLive = r.mode === 'agent' && r.status !== 'closed' && r.status !== 'resolved' && !r.awaitingRating;
    const rated = (!l.awaitingRating && (Number(l.ratedAt) > 0 || Number(l.rating) > 0))
      || (!r.awaitingRating && (Number(r.ratedAt) > 0 || Number(r.rating) > 0));
    const localClosedAt = Math.max(Number(l.agentClosedAt) || 0, Number(l.ratedAt) || 0);
    const remoteEscalated = Number(r.escalatedAt) || 0;
    if (localLive) {
      next.mode = 'agent';
      next.status = l.status || 'open';
      next.awaitingRating = false;
      next.escalatedAt = Number(l.escalatedAt) || Date.now();
    } else if (remoteLive && localClosedAt < remoteEscalated) {
      next.mode = 'agent';
      next.status = r.status || 'in_progress';
      next.awaitingRating = false;
      next.escalatedAt = remoteEscalated;
    } else if (rated) {
      next.awaitingRating = false;
      next.mode = 'ai';
    } else if ((r.awaitingRating || l.awaitingRating) && !remoteLive) {
      next.awaitingRating = true;
      next.mode = 'ai';
    }
    return next;
  }
  async function persistSupport() {
    const key = supportKey();
    if (!key) return;
    if (sbConfigured()) {
      try {
        const rows = asRows(await sbGet('app_state?id=eq.' + encodeURIComponent(key) + '&select=*'));
        const remote = normalizeSupport(rows[0] && rows[0].payload);
        API.support = mergeSupportState(remote, API.support || emptySupport());
      } catch (_) {}
      await sbPutRow('app_state', { id: key, payload: API.support || emptySupport() });
      return;
    }
    try { storeSet(key, JSON.stringify(API.support || emptySupport())); } catch (_) {}
  }
  API.loadSupport = async function () {
    const key = supportKey();
    if (!key) {
      API.support = emptySupport();
      return API.support;
    }
    if (sbConfigured()) {
      try {
        const rows = asRows(await sbGet('app_state?id=eq.' + encodeURIComponent(key) + '&select=*'));
        const remote = normalizeSupport(rows[0] && rows[0].payload);
        API.support = mergeSupportState(remote, API.support || emptySupport());
      } catch (_) {}
    }
    if (!API.support || !API.support.messages || !API.support.messages.length) {
      try {
        const raw = storeGet(key);
        if (raw) API.support = mergeSupportState(normalizeSupport(JSON.parse(raw)), API.support || emptySupport());
        else if (!API.support) API.support = emptySupport();
      } catch (_) {
        if (!API.support) API.support = emptySupport();
      }
    }
    if (shouldIdleCloseSupport(API.support)) {
      API.support = closeAgentSessionLocal(API.support, 'idle');
      await persistSupport();
      notify(true);
    }
    return API.support;
  };
  API.closeAgentIfIdle = async function () {
    if (!API.support) return API.support;
    if (shouldIdleCloseSupport(API.support)) {
      API.support = closeAgentSessionLocal(API.support, 'idle');
      await persistSupport();
      notify(true);
    }
    return API.support;
  };
  API.rateSupportAgent = async function (stars) {
    const n = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
    if (!n) throw new Error('Pick 1 to 5 stars.');
    if (!API.support) API.support = emptySupport();
    if (!API.support.awaitingRating) return API.support;
    const ts = Date.now();
    API.support.awaitingRating = false;
    API.support.rating = n;
    API.support.ratedAt = ts;
    API.support.mode = 'ai';
    API.support.status = 'closed';
    const sessions = (API.support.sessions || []).slice();
    if (sessions.length) sessions[sessions.length - 1] = Object.assign({}, sessions[sessions.length - 1], { rating: n, ratedAt: ts });
    API.support.sessions = sessions;
    API.support.ratings = (API.support.ratings || []).concat([{ stars: n, ts: ts }]);
    API.support.messages = (API.support.messages || []).concat([{
      role: 'system',
      text: 'Thanks. You rated this agent ' + n + ' star' + (n === 1 ? '' : 's') + '. AI Help is ready.',
      ts: ts,
      gen: Math.max(0, Math.round(Number(API.support.chatGen) || 1) - 1),
    }]);
    await persistSupport();
    if (API.support) {
      API.support.awaitingRating = false;
      API.support.mode = 'ai';
    }
    notify(true);
    return API.support;
  };
  API.askSupport = async function (text) {
    const u = API.user;
    if (!u || !u.id) throw new Error('Sign in first');
    const body = String(text || '').trim();
    if (!body) throw new Error('Type a message.');
    if (!API.support) API.support = emptySupport();
    if (shouldIdleCloseSupport(API.support)) {
      API.support = closeAgentSessionLocal(API.support, 'idle');
    }
    if (API.support.awaitingRating) throw new Error('Rate the agent first.');
    if (!API.support.ticket) API.support.ticket = 'HS-' + Date.now().toString(36).toUpperCase().slice(-7);
    const gen = Math.max(0, Math.round(Number(API.support.chatGen) || 0));
    const liveAgent = API.support.mode === 'agent' && API.support.status !== 'closed' && API.support.status !== 'resolved';
    API.support.messages = (API.support.messages || []).concat([{ role: 'user', text: body, ts: Date.now(), gen: gen }]);
    const aiMsgs = (API.support.messages || []).filter(function (m) {
      if (!m) return false;
      if ((Number(m.gen) || 0) !== gen) return false;
      return m.role === 'user' || m.role === 'assistant';
    });
    const payload = {
      mode: liveAgent ? 'agent' : 'ai',
      text: body,
      messages: liveAgent ? [] : aiMsgs.map(function (m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
      }),
    };
    let data = {};
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(function () { return {}; });
      if (!res.ok && !data.reply && !data.escalate) throw new Error(data.message || 'Could not reach support');
    } catch (e) {
      data = { escalate: false, reason: 'offline', reply: 'I could not reach Help just now. Try again — you are still with AI Help.' };
    }
    const handoff = /connect(ing)? you to a real|real QuickBite agent now|you are in real agent mode|queued for the agent/i.test(String(data.reply || ''));
    const wantAgent = !!(data.escalate || handoff);
    if (data.reply) {
      API.support.messages.push({
        role: wantAgent ? 'system' : 'assistant',
        text: String(data.reply),
        ts: Date.now(),
        gen: gen,
      });
    }
    if (wantAgent) {
      API.support.status = 'open';
      API.support.mode = 'agent';
      API.support.awaitingRating = false;
      API.support.reason = String(data.reason || (handoff ? 'ai_handoff' : 'escalate'));
      API.support.escalatedAt = Date.now();
      if (!data.reply) {
        const note = API.support.queuedNote
          ? ('Queued for the agent. Ticket ' + API.support.ticket + '.')
          : ('You are in real agent mode. Ticket ' + API.support.ticket + '. An agent will reply in this chat.');
        API.support.queuedNote = true;
        API.support.messages.push({ role: 'system', text: note, ts: Date.now(), gen: gen });
      } else {
        API.support.queuedNote = true;
      }
    }
    await persistSupport();
    if (wantAgent && API.support) {
      API.support.mode = 'agent';
      API.support.status = (API.support.status === 'closed' || API.support.status === 'resolved') ? 'open' : (API.support.status === 'in_progress' ? 'in_progress' : 'open');
      API.support.awaitingRating = false;
    }
    notify(true);
    return API.support;
  };

  function nextOrderId() {
    return 'ORD-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function hydrateUser() {
    const u = API.user;
    if (!u || !u.id || !sbConfigured()) return;
    await refreshAdminMeta();
    if (adminStatusOf(u.id) === 'suspended') {
      API.logout();
      return;
    }
    if (API.user) API.user.adminStatus = adminStatusOf(u.id);
    try {
      let rows = asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(u.id) + '&select=*'));
      if (!rows[0] && u.email) {
        try {
          const byEmail = await lookupEmail(u.email, u.role);
          if (byEmail) rows = [byEmail];
        } catch (_) {}
      }
      if (rows[0] && !isDemoAccount(rows[0])) {
        const mapped = mapAccount(rows[0]);
        const photo = mapped.photo || u.photo || '';
        const name = mapped.name || u.name || '';
        const email = mapped.email || u.email || '';
        const prevShopId = u.shopId || u.shop_id || mapped.shopId || '';
        const prevShopName = String(u.shopName || mapped.shopName || '').trim();
        API.user = Object.assign({}, u, mapped);
        if (photo) API.user.photo = photo;
        if (name) API.user.name = name;
        if (email) API.user.email = email;
        if (sameRole(API.user.role, 'shop')) {
          if (prevShopId && !API.user.shopId) API.user.shopId = prevShopId;
          API.user = attachShopIdentity(API.user);
          const keep = publicNameCandidate(prevShopName, API.user, API.user.shopId)
            || publicNameCandidate(mapped.shopName, API.user, API.user.shopId)
            || prevShopName;
          if (keep && !isDemoShopName(keep) && String(keep).toLowerCase() !== 'my shop') API.user.shopName = keep;
        }
      }
    } catch (_) {}
  }

  async function fetchMyOrderRows() {
    const me = API.user;
    if (!me) return [];
    const tries = [];
    if (sameRole(me.role, 'customer')) {
      const wa = API.isWhatsAppVerified(me);
      if (me.id) tries.push('orders?user_id=eq.' + encodeURIComponent(me.id) + '&select=*');
      if (!wa && me.email) {
        tries.push('orders?data->>customerEmail=eq.' + encodeURIComponent(String(me.email).toLowerCase()) + '&select=*');
      }
      if (wa) {
        const parts = [];
        if (me.id) parts.push('user_id.eq.' + me.id);
        phoneVariants(me.phone).forEach(function (p) {
          if (!isPlaceholderPhone(p)) parts.push('customer_phone.eq.' + p);
        });
        if (parts.length) tries.push('orders?or=(' + parts.join(',') + ')&select=*');
      }
    } else if (sameRole(me.role, 'shop')) {
      const sid = linkedShopId(me);
      if (sid) tries.push('orders?shop_id=eq.' + encodeURIComponent(sid) + '&select=*');
    } else if (sameRole(me.role, 'rider')) {
      const parts = ['and(status.eq.ready,rider_id.is.null)', 'status.eq.ready'];
      if (me.id) {
        parts.push('rider_id.eq.' + me.id);
        parts.push('data->>riderId.eq.' + me.id);
      }
      phoneVariants(me.phone).forEach(function (p) {
        parts.push('rider_phone.eq.' + p);
        parts.push('data->>riderPhone.eq.' + p);
      });
      tries.push('orders?or=(' + parts.join(',') + ')&select=*');
    }
    const seen = {};
    const out = [];
    let ok = false;
    for (let i = 0; i < tries.length; i++) {
      try {
        asRows(await sbGet(tries[i])).forEach(function (r) {
          if (r && r.id && !seen[r.id]) { seen[r.id] = 1; out.push(r); }
        });
        ok = true;
      } catch (_) {}
    }
    if (ok) return out;
    try { return asRows(await sbGet('orders?select=*')); } catch (_) { return []; }
  }

  async function pullSupabase(opts) {
    purgeLocalDemoStores();
    await oneShotEmptyDb();
    await wipeTestNumber();
    await wipeDemo();
    await hydrateUser();
    if (API.user && (sameRole(API.user.role, 'rider') || sameRole(API.user.role, 'shop'))) {
      try { await API.loadWallet(); } catch (_) {}
    }
    if (API.user && sameRole(API.user.role, 'shop')) {
      try { API.user = await ensureShopRow(API.user); } catch (_) {}
    }
    if (API.user) saveSession();
    const me = API.user;
    const isShop = me && sameRole(me.role, 'shop');
    const light = !isShop && !!(opts && opts.light) && API._shopCatalogReady && !(opts && opts.catalog);
    let orderRows = [];
    if (isShop) {
      const sid = linkedShopId(me);
      if (sid) {
        const pack = await Promise.all([
          sbGet('shops?id=eq.' + encodeURIComponent(sid) + '&select=*'),
          sbGet('menu_items?shop_id=eq.' + encodeURIComponent(sid) + '&select=*'),
          fetchMyOrderRows(),
        ]);
        API.shops = asRows(pack[0]).map(mapShop);
        API.items = asRows(pack[1]).map(mapItem);
        orderRows = pack[2];
      } else {
        orderRows = await fetchMyOrderRows();
      }
    } else {
      orderRows = await fetchMyOrderRows();
      if (!light) {
        try { await pullNearbyCatalog({ more: false }); } catch (_) {}
      }
    }
    const prevById = {};
    (API.orders || []).forEach((o) => { if (o && o.id) prevById[o.id] = o; });
    API.orders = asRows(orderRows).map(mapOrder).map((o) => {
      const p = prevById[o.id];
      if (p) o.status = mergeStatus(p.status, o.status);
      if (p && p.ratings && !o.ratings) o.ratings = p.ratings;
      return o;
    });
    try { await loadRatingsBag(); } catch (_) { applyRatingOverlay(); }
    if (!isShop && sbConfigured()) {
      const oids = [];
      (API.orders || []).forEach(function (o) { if (o && o.shopId) oids.push(o.shopId); });
      if (oids.length) {
        try { await API.ensureShops(oids); } catch (_) {}
      }
    }
    scopeData();
    API._shopCatalogReady = true;
    if (API.user && sameRole(API.user.role, 'shop')) {
      try { API.user = await repairShopPublicName(API.user); } catch (_) {}
      try { saveSession(); } catch (_) {}
    }
    API.messages = {};
    const ids = (API.orders || []).map(function (o) { return o && o.id; }).filter(Boolean);
    if (ids.length) {
      try {
        const inList = ids.map(function (id) { return '"' + String(id).replace(/"/g, '') + '"'; }).join(',');
        const msgRows = asRows(await sbGet('messages?order_id=in.(' + inList + ')&select=*'));
        for (const m of msgRows) {
          const list = API.messages[m.order_id] || (API.messages[m.order_id] = []);
          list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts, thread: m.thread });
        }
      } catch (_) {}
    }
    notify();
  }

  async function getJSON(path, opts) {
    const res = await fetch(url(path), opts);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: text }; }
    if (!res.ok) throw new Error(data.error || text || res.status);
    return data;
  }

  API.on = function (fn) {
    API.listeners.push(fn);
    fn(API);
  };

  API.refresh = async function (opts) {
    if (!window.QB_SUPABASE_URL) {
      try {
        const cfg = await getJSON('/api/config');
        if (cfg.supabaseUrl) window.QB_SUPABASE_URL = cfg.supabaseUrl;
        if (cfg.supabaseAnon) window.QB_SUPABASE_ANON = cfg.supabaseAnon;
      } catch (_) {}
    }
    if (sbConfigured()) {
      await pullSupabase(opts);
      return;
    }
    const data = await getJSON('/api/state');
    API.shops = asRows(data && data.shops);
    API.items = asRows(data && data.items);
    API.orders = asRows(data && data.orders);
    API.messages = (data && data.messages && typeof data.messages === 'object' && !Array.isArray(data.messages)) ? data.messages : {};
    scopeData();
    API._shopCatalogReady = true;
    notify();
  };

  API.login = async function (role, phone, pin) {
    pin = pin || '1234';
    await refreshAdminMeta();
    if (phone) {
      const taken = await lookupPhone(phone, role);
      if (taken) {
        API.user = taken;
        API.token = 'sb_' + taken.id;
        saveSession();
        notify();
        return API.user;
      }
    }
    if (sbConfigured()) {
      try {
        let q = 'accounts?select=*&role=eq.' + encodeURIComponent(role === 'user' ? 'customer' : role);
        if (phone) q += '&phone=eq.' + encodeURIComponent(normalizePhone(phone));
        const rows = asRows(await sbGet(q));
        const picked = rows.find((a) => !isDemoAccount(a) && String(a.pin) === String(pin))
          || rows.find((a) => !isDemoAccount(a));
        if (picked) {
          const acc = mapAccount(picked);
          API.user = acc;
          API.token = 'sb_' + picked.id;
          saveSession();
          notify();
          return API.user;
        }
      } catch (_) {}
    }
    const data = await getJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone, pin: pin }),
    });
    API.user = data.user;
    API.token = data.token;
    saveSession();
    notify();
    return data.user;
  };

  API.register = async function (payload) {
    const role = payload.role === 'shop' || payload.role === 'rider' ? payload.role : 'customer';
    const phone = normalizePhone(payload.phone);
    if (phone) {
      const taken = await lookupPhone(phone, role);
      if (taken && (role === 'shop' || role === 'rider')) throw alreadyThisRoleError(role);
    }
    if (role === 'shop' || role === 'rider') {
      try {
        return await getJSON('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        if (e && String(e.message || '').indexOf('already') >= 0) throw e;
        return {
          ok: true,
          app: role,
          web: role === 'shop' ? '/shop.html' : '/rider.html',
        };
      }
    }
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (email.includes('@') && password.length >= 4) {
      return API.signUpPassword({ name: payload.name, email: email, password: password });
    }
    if (!phone) throw new Error('Enter your WhatsApp number, or sign up with email and password.');
    API.setPendingRider({
      name: payload.name || 'Guest',
      email: payload.email || '',
      phone,
    });
    const out = await API.sendOtp('customer', phone);
    return { ok: true, next: 'otp', ...out };
  };

  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('94') && d.length === 11) d = '0' + d.slice(2);
    if (d.length === 9 && d.startsWith('7')) d = '0' + d;
    return d;
  }

  function storeGet(key) {
    try {
      return localStorage.getItem(key) || sessionStorage.getItem(key);
    } catch (_) { return null; }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
    try { sessionStorage.setItem(key, val); } catch (_) {}
  }
  function storeDel(key) {
    try { localStorage.removeItem(key); } catch (_) {}
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function pendingShop() {
    if (API._pendingShop) return API._pendingShop;
    try { return JSON.parse(storeGet('sd_pending_shop') || 'null'); } catch (_) { return null; }
  }

  API.setPendingShop = function (profile) {
    API._pendingShop = profile || null;
    try {
      if (profile) storeSet('sd_pending_shop', JSON.stringify(profile));
      else storeDel('sd_pending_shop');
    } catch (_) {}
  };

  function pendingRider() {
    if (API._pendingRider) return API._pendingRider;
    try { return JSON.parse(storeGet('sd_pending_rider') || 'null'); } catch (_) { return null; }
  }
  API.setPendingRider = function (profile) {
    API._pendingRider = profile || null;
    try {
      if (profile) storeSet('sd_pending_rider', JSON.stringify(profile));
      else storeDel('sd_pending_rider');
    } catch (_) {}
  };

  function shopProfileKey(phone) {
    return 'sd_shop_profile_' + normalizePhone(phone);
  }
  API.rememberShopProfile = function (phone, profile) {
    try { localStorage.setItem(shopProfileKey(phone), JSON.stringify(profile)); } catch (_) {}
  };
  API.recallShopProfile = function (phone) {
    try { return JSON.parse(localStorage.getItem(shopProfileKey(phone)) || 'null'); } catch (_) { return null; }
  };

  API.findAccount = async function (role, id) {
    const phone = normalizePhone(id);
    const email = String(id || '').includes('@') ? String(id).trim().toLowerCase() : '';
    let hit = null;
    if (email) {
      const list = await allAccounts();
      hit = list.find(function (a) { return String(a.email || '').toLowerCase() === email && sameRole(a.role, role); }) || null;
    }
    if (!hit) hit = await lookupPhone(phone, role);
    if (hit) return hit;
    return null;
  };

  async function enterAccount(role, phone) {
    phone = normalizePhone(phone);
    const taken = await lookupPhone(phone, role);
    let row = taken || null;
    if (row && row.shopId && !row.shop_id) row.shop_id = row.shopId;
    if (row && role === 'shop') {
      const p0 = pendingShop() || {};
      if (p0.shopName || p0.ownerName) {
        const pe = String(p0.email || '').trim().toLowerCase();
        const ee = String(row.email || '').trim().toLowerCase();
        if (pe && ee && pe !== ee) throw alreadyThisRoleError('shop');
      }
    }
    if (!row) {
      try {
        const byId = await sbGet('accounts?id=eq.' + encodeURIComponent(accountIdFor(phone, role)) + '&select=*');
        if (byId && byId[0] && !isDemoAccount(byId[0]) && sameRole(byId[0].role, role)) {
          row = mapAccount(byId[0]);
        }
      } catch (_) {}
    }
    if (role === 'shop' && !(row && (row.shopId || row.shop_id))) {
      const p = pendingShop() || {};
      const rec = API.recallShopProfile(phone) || {};
      if (!p.shopName && !p.ownerName && !rec.shopName) {
        if (!row) throw new Error('Register your shop first.');
      } else {
      const shopId = shopIdFor(phone);
      const pendEmail = String(p.email || rec.email || '').trim().toLowerCase();
      const lat = finiteNum(p.lat != null ? p.lat : rec.lat);
      const lng = finiteNum(p.lng != null ? p.lng : rec.lng);
      const address = String(p.address || rec.address || '').trim();
      if (lat == null || lng == null) throw new Error('Pin your shop on the map.');
      if (!address) throw new Error('Enter the shop address.');
      let shop = null;
      try {
        const existing = await sbGet('shops?id=eq.' + encodeURIComponent(shopId) + '&select=*');
        if (existing && existing[0]) shop = existing[0];
      } catch (_) {}
      if (shop) {
        let allowed = false;
        try {
          const owners = asRows(await sbGet('accounts?shop_id=eq.' + encodeURIComponent(shopId) + '&select=*'));
          const shops = owners.filter(function (a) { return a && sameRole(a.role, 'shop') && !isDemoAccount(a); });
          if (!shops.length) allowed = false;
          else {
            allowed = shops.some(function (a) {
              const e = String(a.email || '').trim().toLowerCase();
              if (pendEmail && e && e === pendEmail) return true;
              if (normalizePhone(a.phone) === phone) return true;
              return false;
            });
          }
        } catch (_) { allowed = false; }
        if (!allowed) throw alreadyThisRoleError('shop');
      }
      const typed = String(p.shopName || rec.shopName || '').trim();
      const existingName = String((shop && shop.name) || '').trim();
      let shopTitle = typed;
      if (shop && existingName && !isDemoShopName(existingName) && !isPlaceholderShopName(existingName)) {
        shopTitle = existingName;
      }
      if (!shopTitle || isDemoShopName(shopTitle) || isPlaceholderShopName(shopTitle)) {
        throw new Error('Enter your shop name.');
      }
      if (!shop) {
        shop = {
          id: shopId,
          name: shopTitle,
          category: 'Bakery',
          rating: 5,
          reviews: 0,
          is_open: true,
          lat: lat,
          lng: lng,
          km: 0,
          eta: '20–35 min',
          fee: 200,
          hours: '08:00 AM – 10:00 PM',
          address: address,
          image: '/img/shop-bakery.jpg',
          promo: 'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.',
        };
        try { await sbUpsert('shops', [shop]); } catch (_) {
          try { await sbPutRow('shops', shop); } catch (_) {}
        }
      }
      let googleRow = (row && row.id) ? row : null;
      if (pendEmail && pendEmail.indexOf('@') >= 0) {
        if (!googleRow) {
          try { googleRow = await lookupEmail(pendEmail, 'shop'); } catch (_) {}
        }
        if (googleRow && !isPlaceholderPhone(googleRow.phone) && normalizePhone(googleRow.phone) !== phone) {
          throw alreadyEmailError('shop');
        }
      }
      if (googleRow && (isPlaceholderPhone(googleRow.phone) || normalizePhone(googleRow.phone) === phone)) {
        const patch = {
          phone: phone,
          name: p.ownerName || rec.ownerName || googleRow.name || 'Shop Owner',
          email: pendEmail || googleRow.email || '',
          pin: withWaPin(googleRow.pin || 'google'),
          shop_id: shopId,
          role: 'shop',
        };
        try { await sbSend('accounts?id=eq.' + encodeURIComponent(googleRow.id), 'PATCH', patch); } catch (_) {}
        row = Object.assign({}, googleRow, patch, { shopId: shopId });
      } else {
        row = {
          id: accountIdFor(phone, 'shop'),
          name: p.ownerName || rec.ownerName || 'Shop Owner',
          phone,
          email: pendEmail || '',
          pin: 'otp',
          role: 'shop',
          shop_id: shopId,
        };
        row = await saveAccount(row);
      }
      API.rememberShopProfile(phone, {
        shopId, shopName: shopTitle, ownerName: row.name, address: shop.address, lat: shop.lat, lng: shop.lng,
      });
      row.shopName = shopTitle;
      API.setPendingShop(null);
      try {
        const mapped = mapShop(shop);
        const i = API.shops.findIndex((s) => s.id === shopId);
        if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
        else API.shops.push(mapped);
      } catch (_) {}
      }
    }
    if (row && role === 'rider') {
      const pr = pendingRider() || {};
      const patch = {};
      if (pr.name && !isPlaceholderName(pr.name)) {
        row.name = String(pr.name).trim();
        patch.name = row.name;
      }
      if (pr.email) {
        row.email = pr.email;
        patch.email = pr.email;
      }
      const pw = String(pr.password || '').trim();
      if (pw.length >= 4) {
        patch.pin = 'p:' + pw + '|wa';
        row.pin = patch.pin;
      }
      if (Object.keys(patch).length) {
        try { await sbSend('accounts?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch); } catch (_) {}
      }
      API.setPendingRider(null);
    }
    if (!row && role === 'rider') {
      const pr = pendingRider() || {};
      if (isPlaceholderName(pr.name)) throw new Error('Register as a rider first.');
      const pw = String(pr.password || '').trim();
      const veh = String(pr.vehicle || '').trim();
      row = {
        id: accountIdFor(phone, 'rider'),
        name: String(pr.name).trim(),
        phone,
        email: pr.email || '',
        pin: pw.length >= 4 ? ('p:' + pw + '|wa') : 'otp',
        role: 'rider',
        address: 'Sri Lanka',
      };
      if (veh && !/^https?:/i.test(veh)) row.vehicle = veh;
      API.setPendingRider(null);
      row = await saveAccount(row);
    }
    if (!row) {
      const pr = pendingRider() || {};
      row = {
        id: accountIdFor(phone, role),
        name: pr.name || 'Guest',
        phone,
        email: pr.email || '',
        pin: 'otp',
        role: role || 'customer',
        address: 'Sri Lanka',
      };
      API.setPendingRider(null);
      row = await saveAccount(row);
    }
    const mapped = mapAccount(row);
    if (!API.user || API.user.id !== mapped.id) {
      resetKept();
      API.orders = [];
      API.messages = {};
    }
    API.user = mapped;
    if (row.shopName) API.user.shopName = row.shopName;
    if (role === 'shop') {
      const stillPending = pendingShop() || {};
      try {
        API.user = await ensureShopRow(API.user, { required: !!(stillPending.shopName || stillPending.ownerName) });
      } catch (_) { API.user = attachShopIdentity(API.user); }
      if (API.isShopRegistered && API.isShopRegistered()) {
        try { API.setPendingShop(null); } catch (_) {}
      }
    }
    if (API.user && API.user.shopId) {
      const s = API.shops.find((x) => x.id === API.user.shopId);
      if (s && s.name && !isOwnerLikeShopName(s.name, API.user)) API.user.shopName = s.name;
    }
    if (role === 'shop' && API.user && API.user.shopId) {
      const s = API.shops.find((x) => x.id === API.user.shopId) || {};
      const nm = publicNameCandidate(s.name, API.user, API.user.shopId)
        || publicNameCandidate(API.user.shopName, API.user, API.user.shopId)
        || '';
      if (nm) API.user.shopName = nm;
      const recKeep = API.recallShopProfile(phone) || {};
      API.rememberShopProfile(phone, {
        shopId: API.user.shopId,
        shopName: nm,
        ownerName: API.user.name || recKeep.ownerName || '',
        address: (s.address || recKeep.address || ''),
        lat: s.lat != null ? s.lat : recKeep.lat,
        lng: s.lng != null ? s.lng : recKeep.lng,
      });
    }
    API.token = 'sb_' + row.id;
    saveSession();
    notify(true);
    return API.user;
  }

  API.normalizePhone = normalizePhone;
  API.shopIdFor = shopIdFor;

  API.sendOtp = async function (role, phone) {
    phone = normalizePhone(phone);
    if (!/^07\d{8}$/.test(phone) && !/^\d{10,15}$/.test(phone)) {
      throw new Error('Enter a valid mobile number');
    }
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const smsToken = 'wa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const body = 'Your QuickBite code is ' + code + '. Don\'t share this WhatsApp message.';
    API._otp = { id: smsToken, phone, role: role || 'customer', code, body, expires: Date.now() + 300000 };
    if (sbConfigured()) {
      try {
        await sbSend('otp_codes', 'POST', [{
          id: smsToken,
          phone,
          role: role || 'customer',
          code,
          body,
          expires_at: new Date(API._otp.expires).toISOString(),
          attempts: 0,
        }]);
      } catch (_) {}
    }
    await sendWhatsApp(phone, body);
    return { ok: true, phone, smsToken, channel: 'whatsapp', expiresIn: 300 };
  };

  API.needsDeliveryPin = function (o) {
    if (!o || o.status === 'delivered' || o.status === 'cancelled') return false;
    if (o.paymentStatus === 'refunded') return false;
    if (API.isCashMethod(o.paymentMethod)) return false;
    return !!(o.paid || API.isCardMethod(o.paymentMethod));
  };
  API.sendDeliveryPin = async function (orderId) {
    const o = (API.orders || []).find(function (x) { return x && x.id === orderId; });
    if (!o) throw new Error('Order not found.');
    if (!API.needsDeliveryPin(o)) throw new Error('Delivery code is only for card orders.');
    const phone = normalizePhone(o.customerPhone);
    if (!phone) throw new Error('Customer WhatsApp number is missing.');
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const label = '#' + String(o.id || '').replace('_', '-');
    const text = 'QuickBite delivery code for order ' + label + ' is ' + code + '. Tell this 4-digit code to the rider to confirm delivery. This is not a login code.';
    API._deliverPin = { orderId: orderId, phone: phone, code: code, expires: Date.now() + 30 * 60 * 1000 };
    if (sbConfigured()) {
      const rowId = 'del_' + String(orderId);
      try { await sbSend('otp_codes?id=eq.' + encodeURIComponent(rowId), 'DELETE'); } catch (_) {}
      try {
        await sbSend('otp_codes', 'POST', [{
          id: rowId,
          phone: phone,
          role: 'deliver',
          code: code,
          body: text,
          expires_at: new Date(API._deliverPin.expires).toISOString(),
          attempts: 0,
        }]);
      } catch (_) {}
    }
    await sendWhatsApp(phone, text);
    return { ok: true, phone: phone };
  };
  API.verifyDeliveryPin = async function (orderId, code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) return false;
    const mem = API._deliverPin;
    if (mem && mem.orderId === orderId && mem.code === code && Date.now() < Number(mem.expires || 0)) return true;
    if (sbConfigured()) {
      try {
        const rows = await sbGet('otp_codes?id=eq.' + encodeURIComponent('del_' + String(orderId)) + '&select=code,role,expires_at,phone');
        const row = rows && rows[0];
        if (row && row.role === 'deliver' && String(row.code) === code) {
          const exp = Date.parse(row.expires_at || '') || 0;
          if (!exp || exp > Date.now()) return true;
        }
      } catch (_) {}
    }
    return false;
  };

  API.readSms = async function (smsToken) {
    if (API._otp && API._otp.id === smsToken) {
      return { from: 'QuickBite', body: API._otp.body, phone: API._otp.phone, channel: 'whatsapp' };
    }
    if (sbConfigured()) {
      try {
        const rows = await sbGet('otp_codes?id=eq.' + encodeURIComponent(smsToken) + '&select=body,phone');
        if (rows && rows[0]) return { from: 'QuickBite', body: rows[0].body, phone: rows[0].phone, channel: 'whatsapp' };
      } catch (_) {}
    }
    return getJSON('/api/otp/sms?token=' + encodeURIComponent(smsToken));
  };

  API.verifyOtp = async function (role, phone, code) {
    phone = normalizePhone(phone);
    code = String(code || '').replace(/\D/g, '');
    let match = false;
    if (API._otp && API._otp.phone === phone && API._otp.code === code && Date.now() < API._otp.expires) {
      match = true;
    }
    if (!match && sbConfigured()) {
      try {
        const rows = await sbGet(
          'otp_codes?phone=eq.' + encodeURIComponent(phone) +
          '&role=eq.' + encodeURIComponent(role || 'customer') +
          '&code=eq.' + encodeURIComponent(code) +
          '&select=*',
        );
        const rec = rows && rows[0];
        if (rec && new Date(rec.expires_at).getTime() > Date.now()) match = true;
      } catch (_) {}
    }
    if (!match && !sbConfigured()) {
      const data = await getJSON('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, phone, code }),
      });
      API.user = data.user;
      API.token = data.token;
      saveSession();
      notify();
      return data.user;
    }
    if (!match) throw new Error('That code does not match this phone number.');
    API._otp = null;
    const want = role || 'customer';
    if (want === 'customer' && API._pendingPassword) {
      const row = API._pendingPassword;
      API._pendingPassword = null;
      enterMapped(row);
      return API.attachWhatsApp(phone);
    }
    if (want === 'customer' && API.user && sameRole(API.user.role, 'customer')) {
      persistVerified({ role: want, phone: phone });
      return API.attachWhatsApp(phone);
    }
    if (want === 'shop' && API.user && sameRole(API.user.role, 'shop')) {
      persistVerified({ role: want, phone: phone });
      await API.attachWhatsApp(phone);
      const pShop = pendingShop() || {};
      const rec = API.recallShopProfile(phone) || {};
      if (pShop.shopName || pShop.ownerName || rec.shopName) return enterAccount(want, phone);
      if (API.isShopRegistered && API.isShopRegistered()) return API.user;
      return { needsRegister: true, phone: phone, role: want };
    }
    if (want === 'rider' && API.user && sameRole(API.user.role, 'rider')) {
      persistVerified({ role: want, phone: phone });
      await API.attachWhatsApp(phone);
      const pRide = pendingRider() || {};
      if (!isPlaceholderName(pRide.name)) return enterAccount(want, phone);
      return API.user;
    }
    if (want === 'shop' || want === 'rider') {
      const existing = await lookupPhone(phone, want);
      const pShop = pendingShop() || {};
      const pRide = pendingRider() || {};
      const rec = want === 'shop' ? (API.recallShopProfile(phone) || {}) : {};
      const registeringShop = want === 'shop' && !!(pShop.shopName || pShop.ownerName || rec.shopName);
      const registeringRider = want === 'rider' && !isPlaceholderName(pRide.name);
      function sameRegisteringEmail(pendingEmail, acc) {
        const pe = String(pendingEmail || '').trim().toLowerCase();
        const ee = String((acc && acc.email) || '').trim().toLowerCase();
        if (pe && ee && pe === ee) return true;
        if (API.user && acc && API.user.id === acc.id) return true;
        if (API.user && emailsEqual(API.user.email, acc && acc.email)) return true;
        return false;
      }
      if (existing) {
        if (registeringShop) {
          if (sameRegisteringEmail(pShop.email, existing)) {
            persistVerified({ role: want, phone: phone });
            return enterAccount(want, phone);
          }
          throw alreadyThisRoleError(want);
        }
        if (registeringRider) {
          if (sameRegisteringEmail(pRide.email, existing)) return enterAccount(want, phone);
          throw alreadyThisRoleError(want);
        }
        return enterAccount(want, phone);
      }
      persistVerified({ role: want, phone: phone });
      if (registeringShop || registeringRider) return enterAccount(want, phone);
      return { needsRegister: true, phone: phone, role: want };
    }
    return enterAccount(want, phone);
  };

  function emailKey(email) {
    const s = String(email || '').trim().toLowerCase();
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return n.toString(36);
  }
  function accountIdForEmail(email, role) {
    return 'ACC_' + roleTag(role) + '_e_' + emailKey(email);
  }
  function googlePhone(sub, email) {
    const seed = String(sub || '') + '|' + String(email || '').toLowerCase();
    let d = String(sub || '').replace(/\D/g, '');
    if (!d) {
      let n = 0;
      for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
      d = String(n);
    }
    d = (d + '00000000').slice(-8);
    return '99' + d;
  }
  function googleProfile(raw) {
    raw = raw || {};
    const email = String(raw.email || raw.emailAddress || '').trim().toLowerCase();
    const name = String(raw.name || [raw.given_name, raw.family_name].filter(Boolean).join(' ') || raw.given_name || '').trim();
    const sub = String(raw.sub || raw.id || raw.user_id || '').trim();
    const photo = String(raw.picture || raw.photo || raw.photoURL || raw.avatar || '').trim();
    return { email: email, name: name, sub: sub, photo: isHttpUrl(photo) ? photo : '' };
  }

  function pickEmailAccount(matches) {
    const list = (matches || []).filter(function (a) { return a && a.id; });
    if (!list.length) return null;
    const byId = {};
    list.forEach(function (a) { byId[a.id] = a; });
    const uniq = Object.keys(byId).map(function (k) { return byId[k]; });
    return uniq.find(function (a) { return !!(a.shopId || a.shop_id); })
      || uniq.find(function (a) { return !isPlaceholderPhone(a.phone); })
      || uniq[0];
  }

  async function lookupEmail(email, role) {
    email = String(email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return null;
    const want = roleTag(role || 'customer');
    const matches = [];
    function add(raw) {
      if (!raw) return;
      const a = mapAccount(raw);
      if (!a || !a.id || isDemoAccount(a)) return;
      if (!emailsEqual(a.email, email)) return;
      if (!sameRole(a.role, want)) return;
      matches.push(a);
    }
    if (sbConfigured()) {
      const quoted = '"' + email.replace(/"/g, '') + '"';
      const tries = [
        'accounts?email=eq.' + encodeURIComponent(email) + '&role=eq.' + encodeURIComponent(want) + '&select=*',
        'accounts?email=eq.' + quoted + '&role=eq.' + encodeURIComponent(want) + '&select=*',
        'accounts?email=ilike.' + encodeURIComponent(email) + '&role=eq.' + encodeURIComponent(want) + '&select=*',
        'accounts?id=eq.' + encodeURIComponent(accountIdForEmail(email, want)) + '&select=*',
      ];
      for (let t = 0; t < tries.length; t++) {
        try { asRows(await sbGet(tries[t])).forEach(add); } catch (_) {}
      }
    }
    try { (await allAccounts()).forEach(add); } catch (_) {}
    return pickEmailAccount(matches);
  }

  function parseJwt(tok) {
    const parts = String(tok || '').split('.');
    if (parts.length < 2) return {};
    const p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = p + '==='.slice((p.length + 3) % 4);
    try {
      return JSON.parse(atob(pad));
    } catch (_) {
      return {};
    }
  }

  API.parseGoogleJwt = parseJwt;

  API.signInGoogle = async function (profile) {
    const g = googleProfile(profile);
    const email = g.email;
    const name = g.name || (email.split('@')[0] || 'Google user');
    if (!email.includes('@')) throw new Error('Google did not share an email for this account.');
    const role = roleTag(API.roleHint || 'customer');
    let row = await lookupEmail(email, role);
    if (!row && g.sub) {
      const byPhone = await lookupPhone(googlePhone(g.sub, email), role);
      if (byPhone && emailsEqual(byPhone.email, email)) row = byPhone;
    }
    const photo = g.photo || (row && row.photo) || '';
    if (!row) {
      const stub = {
        id: accountIdForEmail(email, role),
        name: name,
        phone: googlePhone(g.sub, email),
        email: email,
        pin: 'google',
        role: role,
        address: 'Sri Lanka',
        vehicle: photo || null,
      };
      try {
        row = await saveAccount(stub);
      } catch (e) {
        if (e && /already has a/.test(String(e.message || ''))) {
          row = await lookupEmail(email, role);
          if (!row) throw e;
        } else {
          row = stub;
        }
      }
      try {
        const existing = asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(stub.id) + '&select=*'));
        if (existing[0] && !isDemoAccount(existing[0])) row = mapAccount(existing[0]);
      } catch (_) {}
      if (!row) row = stub;
      if (!row.email) row.email = email;
    } else {
      const patch = { email: email };
      if (photo) patch.vehicle = photo;
      if (sameRole(role, 'shop')) {
        if (name && isPlaceholderName(row.name)) patch.name = name;
      } else if (name) {
        patch.name = name;
      }
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch); } catch (_) {}
      Object.assign(row, patch);
    }
    row.photo = photo || row.photo;
    if (!(sameRole(role, 'shop') && row.name && !isPlaceholderName(row.name))) {
      row.name = name || row.name;
    }
    row.email = email;
    const user = enterMapped(row);
    if (sameRole(role, 'shop')) {
      API.user = attachShopIdentity(API.user);
      try { API.user = await ensureShopRow(API.user); } catch (_) {}
      try { API.user = await repairShopPublicName(API.user); } catch (_) {}
      try { saveSession(); } catch (_) {}
    }
    try { await API.refresh(); } catch (_) {}
    return API.user || user;
  };

  function withWaPin(pin) {
    const s = String(pin || 'otp');
    if (s === 'otp' || s === 'wa' || /\|wa$/.test(s)) return s;
    return s + '|wa';
  }

  function passwordPhone(email) {
    let d = String(email || '').replace(/\D/g, '');
    if (!d) {
      let n = 0;
      const s = String(email || '');
      for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
      d = String(n);
    }
    d = (d + '00000000').slice(-8);
    return '98' + d;
  }

  function pinSecret(pin) {
    let s = String(pin || '').replace(/\|wa$/, '');
    if (s.indexOf('p:') === 0) return s.slice(2);
    return s;
  }

  API.isWhatsAppVerified = function (user) {
    const u = user || API.user;
    if (!u) return false;
    const pin = String(u.pin || '');
    if (pin === 'otp' || pin === 'wa' || /\|wa$/.test(pin)) return true;
    return /^07\d{8}$/.test(normalizePhone(u.phone));
  };

  function enterMapped(row) {
    const next = mapAccount(row);
    if (row && row.pin != null) next.pin = row.pin;
    if (row && row.photo) next.photo = row.photo;
    if (row && row.email) next.email = row.email;
    if (row && row.name) next.name = row.name;
    if (row && (row.shopId || row.shop_id)) next.shopId = row.shopId || row.shop_id;
    if (row && (row.shopName || row.shop_name)) next.shopName = row.shopName || row.shop_name;
    if (!API.user || API.user.id !== next.id) {
      resetKept();
      API.orders = [];
      API.messages = {};
    }
    next.adminStatus = adminStatusOf(next.id);
    if (next.adminStatus === 'suspended') {
      const reason = adminReasonOf(next.id);
      const err = new Error('This account is suspended' + (reason ? ': ' + reason : '.'));
      err.code = 'SUSPENDED';
      throw err;
    }
    API.user = next;
    if (sameRole(next.role, 'shop')) API.user = attachShopIdentity(API.user);
    API.token = 'sb_' + row.id;
    saveSession();
    notify(true);
    return API.user;
  }

  function adminStatusOf(id) {
    const bag = API._adminAccounts || {};
    const m = bag[id];
    return (m && m.status) || 'active';
  }
  function adminReasonOf(id) {
    const bag = API._adminAccounts || {};
    return (bag[id] && bag[id].reason) || '';
  }
  async function refreshAdminMeta() {
    if (!sbConfigured()) return;
    try {
      const rows = asRows(await sbGet('app_state?id=eq.qb_admin_accounts&select=payload'));
      let p = rows[0] && rows[0].payload;
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch (_) { p = null; }
      }
      API._adminAccounts = p && typeof p === 'object' ? p : {};
    } catch (_) {
      API._adminAccounts = API._adminAccounts || {};
    }
  }

  function isPasswordOnlyUnverified(row) {
    if (!row) return false;
    if (API.isWhatsAppVerified(row)) return false;
    const secret = pinSecret(row.pin);
    if (!secret || secret === 'google' || secret === 'otp' || secret === 'wa') return false;
    return true;
  }

  API.signInPassword = async function (id, password, role) {
    const want = roleTag(role || API.roleHint || 'customer');
    const email = String(id || '').trim().toLowerCase();
    password = String(password || '');
    if (password.length < 4) throw new Error('Enter your password.');
    let row = null;
    if (email.includes('@')) {
      row = await lookupEmail(email, want);
    } else {
      const phone = normalizePhone(id);
      if (!phone) throw new Error('Enter your email or phone number.');
      row = await lookupPhone(phone, want);
    }
    const who = want === 'shop' ? 'Shop' : want === 'rider' ? 'Rider' : 'User';
    if (!row) {
      const err = new Error('This email is not registered. Create an account, then sign in with email and password.');
      err.code = 'NO_ACCOUNT';
      throw err;
    }
    const secret = pinSecret(row.pin);
    if (secret === 'google') throw new Error('This account uses Google. Tap Continue with Google.');
    if (secret === 'otp' || secret === 'wa' || !secret) {
      throw new Error('This account uses WhatsApp. Tap Continue with WhatsApp.');
    }
    if (secret !== password) throw new Error('Wrong email or password.');
    await refreshAdminMeta();
    return enterMapped(row);
  };

  API.signUpPassword = async function (payload) {
    const email = String((payload && payload.email) || '').trim().toLowerCase();
    const password = String((payload && payload.password) || '');
    const name = String((payload && payload.name) || '').trim() || (email.split('@')[0] || 'User');
    if (!email.includes('@')) throw new Error('Enter your email address.');
    if (password.length < 4) throw new Error('Create a password (at least 4 characters).');
    const existing = await lookupEmail(email, 'customer');
    if (existing) throw new Error('This email already has a User account. Sign in instead.');
    const phone = passwordPhone(email);
    const row = await saveAccount({
      id: accountIdForEmail(email, 'customer'),
      name: name,
      phone: phone,
      email: email,
      pin: 'p:' + password,
      role: 'customer',
      address: 'Sri Lanka',
    });
    API._pendingPassword = row;
    return { ok: true, next: 'login', email: email, name: name };
  };

  API.attachWhatsApp = async function (phone) {
    phone = normalizePhone(phone);
    if (!/^07\d{8}$/.test(phone)) throw new Error('Enter a valid WhatsApp number');
    const u = API.user;
    if (!u) throw new Error('Sign in first');
    const role = sameRole(u.role, 'rider') ? 'rider' : sameRole(u.role, 'shop') ? 'shop' : 'customer';
    if (!sameRole(u.role, role)) throw new Error('Sign in first');
    if (API.isWhatsAppVerified(u) && normalizePhone(u.phone) === phone) return u;
    const taken = await lookupPhone(phone, role);
    if (taken && taken.id !== u.id) {
      if (!emailsEqual(u.email, taken.email)) throw alreadyThisRoleError(role);
      const patch = { pin: withWaPin(taken.pin || u.pin || 'otp') };
      if (u.name && (!taken.name || taken.name === 'Guest')) patch.name = u.name;
      if (u.shopId && !taken.shopId) patch.shop_id = u.shopId;
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(taken.id), 'PATCH', patch); } catch (_) {}
      Object.assign(taken, patch, { email: taken.email || u.email });
      return enterMapped(taken);
    }
    const nextPin = withWaPin(u.pin || 'google');
    try {
      await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', { phone: phone, pin: nextPin });
    } catch (_) {}
    u.phone = phone;
    u.pin = nextPin;
    API.user = u;
    saveSession();
    notify(true);
    return API.user;
  };

  function inQuickBiteApp() {
    return !!(window.QuickBiteNative && typeof window.QuickBiteNative.postMessage === 'function');
  }
  function inAndroidWebView() {
    const ua = navigator.userAgent || '';
    return inQuickBiteApp() || /; wv\)|\bwv\b/i.test(ua);
  }
  function googleClientId() {
    return String(window.QB_GOOGLE_CLIENT_ID || '118084532686-6qb8plju6ed79pt32t9m9av0f4f6nad4.apps.googleusercontent.com').trim();
  }
  function friendlyGoogleError(err) {
    const s = String(err || '');
    if (/redirect_uri/i.test(s)) return 'Google is not allowed on this page yet. Use WhatsApp, or open the site in Chrome.';
    if (/popup_failed|blocked/i.test(s)) return 'Google could not open. Try again.';
    if (/cancel|closed|popup_closed|access_denied|12501/i.test(s)) {
      return 'Try Continue with Google again.';
    }
    if (/did not share an email/i.test(s)) return s;
    return 'Could not finish Google sign-in. Try again.';
  }
  function takeGoogleHash() {
    const hash = String(location.hash || '').replace(/^#/, '');
    const search = String(location.search || '').replace(/^\?/, '');
    const p = new URLSearchParams(hash);
    const q = new URLSearchParams(search);
    const access = p.get('access_token') || q.get('access_token') || '';
    const idTok = p.get('id_token') || p.get('credential') || q.get('id_token') || q.get('credential') || '';
    const err = p.get('error') || q.get('error') || '';
    if (!access && !idTok && !err) return null;
    try { history.replaceState({}, '', location.pathname); } catch (_) {}
    if (err) return { error: err };
    return { access_token: access, id_token: idTok };
  }
  function stashGoogleOAuth(hit) {
    if (!hit) return;
    try { sessionStorage.setItem('qb_g_oauth', JSON.stringify(hit)); } catch (_) {}
  }
  function readGoogleOAuth() {
    try {
      const s = sessionStorage.getItem('qb_g_oauth');
      if (s) {
        sessionStorage.removeItem('qb_g_oauth');
        return JSON.parse(s);
      }
    } catch (_) {}
    return takeGoogleHash();
  }
  (function captureGoogleOAuth() {
    const hit = takeGoogleHash();
    if (hit) stashGoogleOAuth(hit);
  })();
  function profileFromGoogleHit(hit) {
    if (!hit) return Promise.reject(new Error('Could not finish Google sign-in. Try again.'));
    if (hit.error) return Promise.reject(new Error(friendlyGoogleError(hit.error)));
    if (hit.id_token) {
      const jwt = parseJwt(hit.id_token);
      if (jwt && jwt.email) return Promise.resolve(jwt);
    }
    if (hit.access_token) {
      return fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + hit.access_token },
      }).then(function (r) { return r.json(); });
    }
    if (hit.email) return Promise.resolve(hit);
    return Promise.reject(new Error('Google did not share an email for this account.'));
  }
  API.resumeGoogle = async function () {
    const hit = readGoogleOAuth();
    if (!hit) return null;
    const profile = await profileFromGoogleHit(hit);
    return API.signInGoogle(profile);
  };
  API.googleSignIn = function () {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(profile) {
        if (settled) return;
        const g = googleProfile(profile);
        if (g.email) {
          settled = true;
          window._qbGoogleDone = null;
          resolve(Object.assign({}, profile, g));
        } else fail('Google did not share an email for this account.');
      }
      function fail(err) {
        if (settled) return;
        settled = true;
        window._qbGoogleDone = null;
        reject(new Error(friendlyGoogleError(err)));
      }
      const pending = readGoogleOAuth();
      if (pending) {
        profileFromGoogleHit(pending).then(done).catch(fail);
        return;
      }
      const clientId = googleClientId();
      if (!clientId) {
        fail('Google Sign-In is not configured yet. Add a Google Web Client ID for this site.');
        return;
      }
      window._qbGoogleDone = function (err, profile) {
        window._qbGoogleDone = null;
        if (err) fail(err);
        else done(profile || {});
      };
      function nativeGoogle() {
        if (!inQuickBiteApp()) {
          fail('Could not load Google Sign-In.');
          return;
        }
        try { window.QuickBiteNative.postMessage('google'); }
        catch (e) { fail(e); }
      }
      function fromAccessToken(accessToken) {
        profileFromGoogleHit({ access_token: accessToken }).then(done).catch(fail);
      }
      function startGis() {
        try {
          if (!(window.google && google.accounts && google.accounts.oauth2)) {
            if (inQuickBiteApp()) nativeGoogle();
            else fail('Could not load Google Sign-In.');
            return;
          }
          const tc = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'openid email profile',
            callback: function (resp) {
              if (!resp || resp.error || !resp.access_token) {
                if (inQuickBiteApp()) {
                  setTimeout(function () { if (!settled) nativeGoogle(); }, 400);
                  return;
                }
                fail((resp && (resp.error_description || resp.error)) || 'closed');
                return;
              }
              fromAccessToken(resp.access_token);
            },
            error_callback: function (err) {
              if (inQuickBiteApp()) {
                setTimeout(function () { if (!settled) nativeGoogle(); }, 400);
                return;
              }
              fail((err && (err.type || err.message)) || 'closed');
            },
          });
          tc.requestAccessToken({ prompt: 'select_account' });
        } catch (e) {
          if (inQuickBiteApp()) nativeGoogle();
          else fail(e);
        }
      }
      if (window.google && google.accounts && google.accounts.oauth2) {
        startGis();
        return;
      }
      if (inQuickBiteApp()) {
        nativeGoogle();
        return;
      }
      const existing = document.querySelector('script[data-gsi],script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', startGis);
        existing.addEventListener('error', function () { fail('Could not load Google Sign-In.'); });
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.dataset.gsi = '1';
      s.onload = startGis;
      s.onerror = function () { fail('Could not load Google Sign-In.'); };
      document.head.appendChild(s);
    });
  };

  API.verifiedPhone = function (role) {
    const v = API._verified;
    if (!v || !sameRole(v.role, role)) return '';
    if (isPlaceholderPhone(v.phone)) return '';
    return v.phone || '';
  };

  API.completeShopRegister = async function () {
    let phone = API.verifiedPhone('shop');
    if (!phone && API.user && sameRole(API.user.role, 'shop') && !isPlaceholderPhone(API.user.phone)) {
      phone = normalizePhone(API.user.phone);
    }
    if (!phone) throw new Error('Verify WhatsApp first.');
    const p = pendingShop() || {};
    const rec = API.recallShopProfile(phone) || {};
    if (!p.shopName && !p.ownerName && !rec.shopName) throw new Error('Register your shop first.');
    if (!p.shopName && rec.shopName) {
      API.setPendingShop(Object.assign({}, rec, p, { phone: phone }));
    }
    const user = await enterAccount('shop', phone);
    clearVerified('shop');
    return user;
  };

  API.completeRiderRegister = async function () {
    let phone = API.verifiedPhone('rider');
    if (!phone && API.user && sameRole(API.user.role, 'rider') && !isPlaceholderPhone(API.user.phone)) {
      phone = normalizePhone(API.user.phone);
    }
    if (!phone) throw new Error('Verify WhatsApp first.');
    const p = pendingRider() || {};
    if (isPlaceholderName(p.name)) throw new Error('Register as a rider first.');
    const user = await enterAccount('rider', phone);
    clearVerified('rider');
    return user;
  };

  function sessionKey(role) {
    return 'qb_auth_' + roleTag(role || API.roleHint || 'customer');
  }
  function sessionKeys(role) {
    const tag = roleTag(role || API.roleHint || 'customer');
    const keys = ['qb_auth_' + tag, 'sd_session_' + tag, 'sd_user_' + tag, 'sd_user_' + (role || '')];
    if (tag === 'customer') keys.push('sd_user_user', 'sd_user_customer', 'sd_session_user', 'sd_session_customer', 'qb_auth_user', 'qb_auth_customer');
    const out = [];
    keys.forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function verifiedKey(role) {
    return 'sd_verified_' + roleTag(role || API.roleHint || 'customer');
  }
  function persistVerified(v) {
    const role = v && v.role;
    if (v && isPlaceholderPhone(v.phone)) v = null;
    API._verified = v || null;
    try {
      if (v && v.phone) storeSet(verifiedKey(v.role), JSON.stringify(v));
      else if (role) storeDel(verifiedKey(role));
    } catch (_) {}
  }
  function restoreVerified(role) {
    try {
      const raw = storeGet(verifiedKey(role));
      if (!raw) return;
      const v = JSON.parse(raw);
      if (v && v.phone && sameRole(v.role, role)) {
        if (isPlaceholderPhone(v.phone)) {
          storeDel(verifiedKey(role));
          return;
        }
        API._verified = v;
      }
    } catch (_) {}
  }
  function clearVerified(role) {
    API._verified = null;
    storeDel(verifiedKey(role));
  }
  function cookieName(role) {
    return 'qb_auth_' + roleTag(role || API.roleHint || 'customer');
  }
  function cookieWrite(role, user) {
    try {
      const body = encodeURIComponent(JSON.stringify({
        id: user.id, phone: user.phone, role: user.role, shopId: user.shopId || '', name: user.name || '', email: user.email || '', photo: user.photo || '', token: API.token || '',
      }));
      document.cookie = cookieName(role) + '=' + body + ';path=/;max-age=31536000;SameSite=Lax';
    } catch (_) {}
  }
  function cookieRead(role) {
    try {
      const n = cookieName(role) + '=';
      const parts = String(document.cookie || '').split(';');
      for (let i = 0; i < parts.length; i++) {
        const s = parts[i].trim();
        if (s.indexOf(n) !== 0) continue;
        const u = JSON.parse(decodeURIComponent(s.slice(n.length)));
        if (u && u.id && u.phone) return u;
      }
    } catch (_) {}
    return null;
  }
  function cookieClear(role) {
    try { document.cookie = cookieName(role) + '=;path=/;max-age=0;SameSite=Lax'; } catch (_) {}
  }

  function saveSession() {
    if (!API.user) return;
    try {
      if (sameRole(API.user.role, 'shop')) API.user = attachShopIdentity(API.user);
      const payload = JSON.stringify({ user: API.user, token: API.token || null, ts: Date.now() });
      sessionKeys(API.roleHint || API.user.role).forEach(function (k) { storeSet(k, payload); });
      sessionKeys(API.user.role).forEach(function (k) { storeSet(k, payload); });
      cookieWrite(API.roleHint || API.user.role, API.user);
      cookieWrite(API.user.role, API.user);
      const v = API._verified;
      if (v && sameRole(v.role, API.user.role)) {
        const sameWa = !isPlaceholderPhone(API.user.phone) && normalizePhone(API.user.phone) === normalizePhone(v.phone);
        if (!isPlaceholderPhone(API.user.phone) && !sameWa) clearVerified(API.user.role);
      }
    } catch (_) {}
  }

  API.logout = function () {
    const role = (API.user && API.user.role) || API.roleHint || 'customer';
    API.user = null;
    API.token = null;
    API.orders = [];
    API.messages = {};
    API.wallet = emptyWallet();
    resetKept();
    clearVerified(role);
    try {
      sessionKeys(role).forEach(storeDel);
      sessionKeys(API.roleHint).forEach(storeDel);
      cookieClear(role);
      cookieClear(API.roleHint);
    } catch (_) {}
    notify();
  };

  API.restore = function () {
    try {
      const hint = roleTag(API.roleHint || 'customer');
      restoreVerified(hint);
      const keys = sessionKeys(hint);
      let raw = null;
      for (let i = 0; i < keys.length; i++) {
        raw = storeGet(keys[i]);
        if (raw) break;
      }
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.user) {
          API.user = data.user;
          API.token = data.token || null;
        } else if (data && data.id) {
          API.user = data;
        }
      }
      if (!API.user) {
        const c = cookieRead(hint);
        if (c && sameRole(c.role, hint)) {
          API.user = c;
          API.token = c.token || null;
        }
      }
      if (API.user && !sameRole(API.user.role, hint)) {
        API.user = null;
        API.token = null;
        return;
      }
      if (API.user && isDemoAccount(API.user)) {
        API.user = null;
        API.token = null;
        keys.forEach(storeDel);
        cookieClear(hint);
        return;
      }
      if (API.user && sameRole(API.user.role, 'shop')) API.user = attachShopIdentity(API.user);
      purgeLocalDemoStores();
      if (API.user) {
        if (!isPlaceholderPhone(API.user.phone)) clearVerified(hint);
        saveSession();
      }
    } catch (_) {}
  };

  function luhnOk(num) {
    const d = String(num || '').replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let s = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      s += n; alt = !alt;
    }
    return s % 10 === 0;
  }
  API.isCardMethod = function (m) {
    const s = String(m || '').toLowerCase();
    if (s.indexOf('cash') !== -1) return false;
    return /visa|master|amex|unionpay|jcb|discover|card|••••/.test(s);
  };
  API.isCashMethod = function (m) {
    if (API.isCardMethod(m)) return false;
    const s = String(m || '').toLowerCase();
    return !s || s.indexOf('cash') !== -1;
  };
  API.openCodOrder = function (user) {
    const u = user || API.user;
    return (API.orders || []).find(function (o) {
      if (!o) return false;
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      if (u && !mineOrder(o, u)) return false;
      return API.isCashMethod(o.paymentMethod);
    }) || null;
  };
  API.shopCreditOf = function (o) {
    if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
    if (!o.paid && !API.isCardMethod(o.paymentMethod)) return 0;
    if (o.shopCredit != null && o.shopCredit !== '') return Math.max(0, Number(o.shopCredit) || 0);
    const sub = Number(o.subtotal);
    if (sub > 0) return sub;
    const fee = Number(o.deliveryFee) || 0;
    return Math.max(0, (Number(o.totalAmount) || 0) - fee);
  };
  API.riderCreditOf = function (o) {
    if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
    if (o.riderCredit != null && o.riderCredit !== '') return Math.max(0, Number(o.riderCredit) || 0);
    const fee = Number(o.deliveryFee);
    if (fee > 0) return fee;
    return 0;
  };
  function applyPay(order, pay, method) {
    if (!order || !pay) return order;
    order.paid = true;
    order.paymentStatus = pay.status || 'captured';
    order.paymentId = pay.paymentId;
    order.paidAt = pay.paidAt || new Date().toISOString();
    order.shopCredit = Math.round(Number(pay.shopCredit) || 0);
    order.riderCredit = Math.round(Number(pay.riderCredit) || 0);
    order.paymentBrand = pay.brand || '';
    order.paymentLast4 = pay.last4 || '';
    order.shopPaidAt = order.paidAt;
    if (method) order.paymentMethod = method;
    return order;
  }
  function lkPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('94') === 0 && d.length >= 11) return '+' + d;
    if (d.charAt(0) === '0' && d.length === 10) return '+94' + d.slice(1);
    if (d.length === 9) return '+94' + d;
    return '+' + d;
  }
  function payApiError(data, fallback) {
    if (!data) return fallback;
    if (typeof data.error === 'string' && data.error) return data.error;
    if (data.error && data.error.message) return data.error.message;
    if (data.message) return data.message;
    return fallback;
  }
  async function payApi(payload) {
    let res;
    try {
      res = await fetch((API.base || '') + '/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    } catch (_) {
      throw new Error('Could not reach Payments.lk. Try again.');
    }
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok) {
      throw new Error(payApiError(data, res.status === 404 ? 'Card payment is not connected on this host.' : 'Card payment failed.'));
    }
    return data;
  }
  API.createPayCheckout = async function (input) {
    input = input || {};
    const amount = Math.round(Number(input.amount) || 0);
    const amountCents = Math.round(Number(input.amountCents != null ? input.amountCents : amount * 100) || 0);
    if (!Array.isArray(input.lineItems) || !input.lineItems.length) {
      if (amountCents < 100 && amount < 1) throw new Error('Invalid payment amount.');
    }
    const reference = String(input.reference || ('QB-' + Date.now()));
    const customer = {};
    if (input.customer && input.customer.name) customer.name = String(input.customer.name);
    else if (API.user && API.user.name) customer.name = String(API.user.name);
    if (input.customer && input.customer.email) customer.email = String(input.customer.email);
    else if (API.user && API.user.email) customer.email = String(API.user.email);
    const phone = lkPhone((input.customer && input.customer.phone) || (API.user && API.user.phone) || '');
    if (phone) customer.phone = phone;
    const payload = {
      reference: reference,
      description: input.description || 'QuickBite order',
      customer: customer,
    };
    if (Array.isArray(input.lineItems) && input.lineItems.length) payload.lineItems = input.lineItems;
    else payload.amountCents = amountCents;
    let res;
    try {
      res = await fetch((API.base || '') + '/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': reference,
        },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      throw new Error('Could not reach Payments.lk. Try again.');
    }
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || !data.url) {
      throw new Error(payApiError(data, res.status === 404 ? 'Card payment is not connected on this host.' : 'Card payment failed.'));
    }
    return data;
  };
  API.confirmPayCheckout = async function (checkoutId, amountCents) {
    const data = await payApi({
      action: 'confirm',
      checkoutId: checkoutId,
      amountCents: Math.round(Number(amountCents) || 0),
    });
    if (data.status !== 'succeeded' || !data.paymentId) {
      throw new Error(data.error || 'Payment was not completed.');
    }
    return {
      ok: true,
      paymentId: data.paymentId,
      status: 'captured',
      amount: Math.round(Number(data.amountCents) / 100),
      amountCents: Math.round(Number(data.amountCents) || 0),
      brand: data.brand || 'Card',
      last4: data.last4 || '',
      paidAt: data.paidAt || new Date().toISOString(),
      checkoutId: data.checkoutId || checkoutId,
    };
  };
  API.chargeCard = async function () {
    throw new Error('Card payments go through Payments.lk checkout.');
  };

  function groupedLines(items) {
    const g = {};
    (items || []).forEach(function (it) {
      const id = String((it && it.id) || '');
      if (!id) return;
      if (!g[id]) g[id] = { id: id, name: String((it && it.name) || 'Item'), qty: 0 };
      g[id].qty += Number((it && it.qty) || 1);
    });
    return Object.keys(g).map(function (k) { return g[k]; });
  }
  function assertOrderStock(items) {
    groupedLines(items).forEach(function (line) {
      const it = (API.items || []).find(function (x) { return x.id === line.id; });
      if (!it) return;
      if (!itemOnSale(it)) throw new Error(it.name + ' is unavailable.');
      const st = itemStockOf(it);
      if (!st.unlimited && line.qty > st.stock) {
        throw new Error(it.name + ' only has ' + st.stock + ' left.');
      }
    });
  }
  async function persistItemStock(it) {
    if (!it || !it.id) return;
    const st = itemStockOf(it);
    const plain = stripItemMeta(it.desc || it.description);
    const available = (!st.unlimited && st.stock <= 0) ? false : (it.isAvailable !== false);
    it.isAvailable = available;
    it.stock = st.unlimited ? null : st.stock;
    it.stockUnlimited = st.unlimited;
    if (sbConfigured()) {
      await sbSend('menu_items?id=eq.' + encodeURIComponent(it.id), 'PATCH', {
        description: packDesc(plain, st.unlimited, st.stock, it.offer),
        is_available: available,
      });
    }
  }
  async function shiftStock(lines, reverse) {
    const grouped = groupedLines(lines);
    for (let i = 0; i < grouped.length; i++) {
      const line = grouped[i];
      const it = (API.items || []).find(function (x) { return x.id === line.id; });
      if (!it) continue;
      const st = itemStockOf(it);
      if (st.unlimited) continue;
      const next = reverse ? st.stock + line.qty : Math.max(0, st.stock - line.qty);
      it.stock = next;
      it.stockUnlimited = false;
      it.isAvailable = next > 0;
      try {
        await persistItemStock(it);
      } catch (_) {}
    }
    notify(true);
  }

  API.placeOrder = async function (payload) {
    if (API.user && API.user.adminStatus === 'restricted') {
      throw new Error('This account is restricted from placing orders.');
    }
    if (!API.isWhatsAppVerified()) {
      const err = new Error('Verify WhatsApp before placing an order.');
      err.code = 'WHATSAPP_REQUIRED';
      throw err;
    }
    const payingCard = !!(payload && payload.payment && payload.payment.paymentId) || API.isCardMethod(payload && payload.paymentMethod);
    if (!payingCard && API.openCodOrder()) {
      const err = new Error('Cash on Delivery is limited to one order at a time. Finish that order or pay by card.');
      err.code = 'COD_OPEN';
      throw err;
    }
    assertOrderStock(payload && payload.items);
    if (API.user) {
      payload = Object.assign({}, payload, {
        customerPhone: API.user.phone || payload.customerPhone,
        customerEmail: API.user.email || payload.customerEmail || '',
        customerName: API.user.name || payload.customerName,
        userId: API.user.id || payload.userId,
      });
    }
    let order = null;
    try {
      order = await getJSON('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {}
    if (!order || !order.id) {
      const shop = shopOf(payload.shopId);
      const lineItems = Array.isArray(payload.items) ? payload.items.map((it) => ({
        id: it.id || null,
        name: String(it.name || 'Item'),
        qty: Number(it.qty || 1),
        price: Number(it.price || 0),
      })) : [];
      const subtotal = lineItems.reduce((s, it) => s + it.price * it.qty, 0);
      const deliveryFee = payload.deliveryFee != null ? Number(payload.deliveryFee) : 200;
      order = {
        id: nextOrderId(),
        userId: payload.userId || (API.user && API.user.id) || '',
        shopId: payload.shopId,
        shopName: shop.name,
        shopEmoji: shop.emoji,
        customerName: payload.customerName || (API.user && API.user.name) || 'Guest',
        customerPhone: payload.customerPhone || (API.user && API.user.phone) || '',
        customerEmail: payload.customerEmail || (API.user && API.user.email) || '',
        address: payload.address,
        note: payload.note || '',
        paymentMethod: payload.paymentMethod || 'Cash on delivery',
        riderId: null,
        riderName: null,
        riderPhone: null,
        status: 'pending',
        items: lineItems,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        totalAmount: subtotal + deliveryFee,
        deliveryLat: Number(payload.deliveryLat != null ? payload.deliveryLat : (window.QB_LIVE && window.QB_LIVE.lat) || 8.335),
        deliveryLng: Number(payload.deliveryLng != null ? payload.deliveryLng : (window.QB_LIVE && window.QB_LIVE.lng) || 80.4108),
        riderLat: null,
        riderLng: null,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (payload.payment && payload.payment.paymentId) {
      applyPay(order, payload.payment, payload.paymentMethod);
    }
    const shopPin = shopOf(order.shopId);
    const dLat = finiteNum(order.deliveryLat);
    const dLng = finiteNum(order.deliveryLng);
    const pinLat = finiteNum(shopPin.lat);
    const pinLng = finiteNum(shopPin.lng);
    let sLat = finiteNum(pinLat != null ? pinLat : (payload.shopLat != null ? payload.shopLat : order.shopLat));
    let sLng = finiteNum(pinLng != null ? pinLng : (payload.shopLng != null ? payload.shopLng : order.shopLng));
    if (sLat != null && sLng != null && dLat != null && Math.abs(sLat - dLat) < 1e-5 && Math.abs(sLng - dLng) < 1e-5 && pinLat == null) {
      sLat = null;
      sLng = null;
    }
    if (sLat != null && sLng != null) {
      order.shopLat = sLat;
      order.shopLng = sLng;
    }
    order.shopAddress = shopPin.address || payload.shopAddress || order.shopAddress || '';
    if (shopPin.name && (!order.shopName || order.shopName === 'Shop')) order.shopName = shopPin.name;
    if (!order.stockApplied) {
      try {
        await shiftStock(order.items, false);
        order.stockApplied = true;
      } catch (_) {}
    }
    if (sbConfigured()) {
      try {
        await sbPutRow('orders', orderRow(order));
      } catch (_) {}
      try {
        await sbSend('messages', 'POST', [{
          id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          order_id: order.id,
          sender: 'QuickBite',
          role: 'system',
          body: 'Order placed at ' + (order.shopName || 'shop'),
          ts: Date.now(),
        }]);
      } catch (_) {}
    }
    keepOrder(order);
    if (!API.orders.some((o) => o.id === order.id)) API.orders.unshift(order);
    mergeKept();
    notify(true);
    setTimeout(function () {
      API.refresh().then(function () {
        keepOrder(order);
        if (!API.orders.some((o) => o.id === order.id)) {
          API.orders.unshift(order);
          mergeKept();
          notify(true);
        }
      }).catch(function () {});
    }, 400);
    return order;
  };

  const _patchTail = {};
  const _locPend = {};
  const _locTimer = {};
  function enqueuePatch(id, task) {
    const prev = _patchTail[id] || Promise.resolve();
    const next = prev.then(task, task);
    _patchTail[id] = next.catch(function () {});
    return next;
  }
  async function writePatch(id, body) {
    const local = applyLocalOrder(id, body);
    notify(true);
    if (locOnlyBody(body) && local && (local.status === 'delivered' || local.status === 'cancelled')) return local;
    let order = null;
    try {
      order = await getJSON('/api/orders/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {}
    if (sbConfigured()) {
      const cur = API.orders.find((o) => o.id === id) || order || local;
      if (cur) {
        const next = Object.assign({}, cur, body);
        next.status = mergeStatus(cur.status, body.status);
        if (cur.status === 'delivered' && body.status !== 'cancelled') next.status = 'delivered';
        if (API.user && API.user.role === 'rider' && (body.status === 'accepted' || body.status === 'picked_up' || body.status === 'on_the_way')) {
          next.riderId = next.riderId || API.user.id;
          next.riderName = next.riderName || API.user.name;
          next.riderPhone = next.riderPhone || API.user.phone;
        }
        if (body.status === 'picked_up' || body.status === 'on_the_way') next.pickedUpAt = next.pickedUpAt || new Date().toISOString();
        if (body.status === 'delivered') next.deliveredAt = next.deliveredAt || new Date().toISOString();
        next.updatedAt = new Date().toISOString();
        await sbSend('orders?id=eq.' + encodeURIComponent(id), 'PATCH', orderRow(next));
        applyLocalOrder(id, next);
        order = next;
      }
    }
    if (!locOnlyBody(body)) {
      try { await API.refresh(); } catch (_) {}
      const after = API.orders.find((o) => o.id === id);
      const want = local || order;
      if (after && want && mergeStatus(after.status, want.status) !== after.status) {
        after.status = mergeStatus(after.status, want.status);
        keepOrder(after);
        notify(true);
      }
    }
    return API.orders.find((o) => o.id === id) || order || local;
  }
  function earthMeters(a, b) {
    if (!a || !b) return Infinity;
    const lat1 = Number(a[0]), lng1 = Number(a[1]), lat2 = Number(b[0]), lng2 = Number(b[1]);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
    if (typeof haversineKm === 'function') return haversineKm([lat1, lng1], [lat2, lng2]) * 1000;
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const x = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function riderPatchHere(body, order) {
    const lat = finiteNum(body && body.riderLat != null ? body.riderLat : (order && order.riderLat));
    const lng = finiteNum(body && body.riderLng != null ? body.riderLng : (order && order.riderLng));
    if (lat != null && lng != null) return [lat, lng];
    if (typeof window !== 'undefined' && window.QB_LIVE && window.QB_LIVE.lat != null) {
      const la = Number(window.QB_LIVE.lat), ln = Number(window.QB_LIVE.lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) return [la, ln];
    }
    return null;
  }
  function shopPatchHere(order) {
    if (!order) return null;
    const shop = shopOf(order.shopId) || {};
    const lat = finiteNum(shop.lat != null ? shop.lat : order.shopLat);
    const lng = finiteNum(shop.lng != null ? shop.lng : order.shopLng);
    const dLat = finiteNum(order.deliveryLat);
    const dLng = finiteNum(order.deliveryLng);
    if (lat != null && lng != null) {
      if (dLat != null && Math.abs(lat - dLat) < 1e-5 && Math.abs(lng - dLng) < 1e-5) return null;
      return [lat, lng];
    }
    return null;
  }
  const RIDER_CLOSE_M = 25;
  function assertRiderClose(id, body) {
    if (!API.user || !sameRole(API.user.role, 'rider')) return;
    const st = body && body.status;
    if (st !== 'picked_up' && st !== 'on_the_way' && st !== 'delivered') return;
    const order = (API.orders || []).find(function (o) { return o.id === id; });
    const here = riderPatchHere(body, order);
    const dest = st === 'delivered'
      ? (order ? [finiteNum(order.deliveryLat), finiteNum(order.deliveryLng)] : null)
      : shopPatchHere(order);
    const m = earthMeters(here, dest);
    if (m < RIDER_CLOSE_M) return;
    const err = new Error(st === 'delivered'
      ? 'Get within 25 m of the customer to mark delivered.'
      : 'Get within 25 m of the shop to confirm pickup.');
    err.code = 'TOO_FAR';
    throw err;
  }
  API.patch = async function (id, body) {
    body = Object.assign({}, body || {});
    if (API.user && sameRole(API.user.role, 'rider') && (body.status === 'accepted' || body.riderId || body.status === 'picked_up')) {
      if (!API.isRiderRegistered()) throw new Error('Register as a rider first, then accept orders.');
      if (body.status === 'accepted' && !API.isRiderVerified()) {
        const err = new Error('Add NIC, driving licence, and registered vehicle number in Profile first.');
        err.code = 'RIDER_DOCS';
        throw err;
      }
      if (!API.isWhatsAppVerified()) {
        const err = new Error('Verify WhatsApp before accepting an order.');
        err.code = 'WHATSAPP_REQUIRED';
        throw err;
      }
    }
    if (API.user && sameRole(API.user.role, 'rider') && (body.status === 'accepted' || body.riderId)) {
      const d = riderDocsFromUser(API.user);
      if (!body.riderPhoto && /^https?:\/\//i.test(String(d.avatar || ''))) body.riderPhoto = d.avatar;
    }
    if (API.user && sameRole(API.user.role, 'rider') && body.status === 'accepted') {
      const open = (API.orders || []).find(function (o) {
        if (!o || o.id === id) return false;
        if (!mineOrder(o, API.user)) return false;
        if (o.status === 'delivered' || o.status === 'cancelled') return false;
        return o.status === 'accepted' || o.status === 'picked_up' || o.status === 'on_the_way' || (o.status === 'ready' && !!(o.riderId || o.rider_id));
      });
      if (open) {
        const err = new Error('Finish your current order before accepting another.');
        err.code = 'RIDER_BUSY';
        throw err;
      }
    }
    assertRiderClose(id, body);
    if (API.user && sameRole(API.user.role, 'rider') && body.status === 'delivered') {
      const cur = (API.orders || []).find(function (x) { return x && x.id === id; });
      if (API.needsDeliveryPin(cur) && !body.deliveryConfirmed) {
        const err = new Error('Enter the 4-digit WhatsApp delivery code.');
        err.code = 'DELIVERY_PIN';
        throw err;
      }
    }
    if (locOnlyBody(body)) {
      const local = applyLocalOrder(id, body);
      if (local && (local.status === 'delivered' || local.status === 'cancelled')) return local;
      notify();
      _locPend[id] = Object.assign({}, _locPend[id] || {}, body);
      if (!_locTimer[id]) {
        _locTimer[id] = setTimeout(function () {
          _locTimer[id] = null;
          const extra = _locPend[id];
          delete _locPend[id];
          if (extra) enqueuePatch(id, function () { return writePatch(id, extra); });
        }, 1200);
      }
      return local || API.orders.find((o) => o.id === id);
    }
    if (_locTimer[id]) {
      clearTimeout(_locTimer[id]);
      _locTimer[id] = null;
    }
    if (_locPend[id]) {
      body = Object.assign({}, _locPend[id], body);
      delete _locPend[id];
    }
    const before = API.orders.find(function (o) { return o.id === id; });
    return enqueuePatch(id, function () { return writePatch(id, body); }).then(function (out) {
      try {
        if (body.status === 'cancelled' && before && before.status !== 'cancelled' && before.stockApplied) {
          shiftStock(before.items, true).then(function () {
            const o = API.orders.find(function (x) { return x.id === id; }) || before;
            o.stockApplied = false;
            keepOrder(o);
            if (sbConfigured()) {
              sbSend('orders?id=eq.' + encodeURIComponent(id), 'PATCH', orderRow(o)).catch(function () {});
            }
          }).catch(function () {});
        }
      } catch (_) {}
      return out;
    });
  };

  API.rateOrder = async function (id, input) {
    input = input || {};
    const o = API.orders.find(function (x) { return x.id === id; });
    if (!o || o.status !== 'delivered') throw new Error('Rate after the order is delivered.');
    if (API.orderRated(o)) return o;
    const shopStars = clampStar(input.shop);
    if (!shopStars) throw new Error('Tap stars to rate the shop.');
    const riderStars = clampStar(input.rider);
    const itemsIn = input.items && typeof input.items === 'object' ? input.items : {};
    const itemMap = {};
    uniqueOrderItems(o).forEach(function (it) {
      const s = clampStar(itemsIn[it.key] != null ? itemsIn[it.key] : itemsIn[it.id]);
      if (s) itemMap[it.key] = s;
    });
    const ratings = {
      shop: shopStars,
      rider: riderStars || 0,
      items: itemMap,
      at: new Date().toISOString(),
      by: (API.user && API.user.id) || '',
    };
    await API.patch(id, { ratings: ratings });
    const bag = await loadRatingsBag();
    const sid = o.shopId;
    if (sid && bag.shops && !bag.shops[sid]) {
      const shop = (API.shops || []).find(function (s) { return s.id === sid; });
      if (shop && Number(shop.reviews) > 0) {
        bag.shops[sid] = { sum: Number(shop.rating || 0) * Number(shop.reviews), n: Number(shop.reviews) };
      }
    }
    bumpBag('shops', sid, shopStars);
    if (o.riderId && riderStars) bumpBag('riders', o.riderId, riderStars);
    Object.keys(itemMap).forEach(function (k) { bumpBag('items', k, itemMap[k]); });
    await saveRatingsBag();
    applyRatingOverlay();
    const shopRec = API.ratings.shops && API.ratings.shops[sid];
    if (sid && shopRec) {
      const rating = bagAvg(shopRec);
      const reviews = shopRec.n;
      const shop = (API.shops || []).find(function (s) { return s.id === sid; });
      if (shop) { shop.rating = rating; shop.reviews = reviews; }
      try { await sbSend('shops?id=eq.' + encodeURIComponent(sid), 'PATCH', { rating: rating, reviews: reviews }); } catch (_) {}
    }
    if (o.riderId && riderStars) {
      const rec = API.ratings.riders && API.ratings.riders[o.riderId];
      const rating = bagAvg(rec);
      if (rating != null) {
        try { await sbSend('accounts?id=eq.' + encodeURIComponent(o.riderId), 'PATCH', { rating: rating }); } catch (_) {}
      }
    }
    notify(true);
    return API.orders.find(function (x) { return x.id === id; }) || o;
  };

  API.claimOrder = async function (id) {
    const u = API.user || {};
    if (u.adminStatus === 'restricted' || u.adminStatus === 'suspended') {
      throw new Error('This account cannot accept jobs.');
    }
    return API.patch(id, {
      riderId: u.id,
      riderName: u.name,
      riderPhone: u.phone,
    });
  };

  API.toggleItem = async function (id, isAvailable) {
    const hit = API.items.find((i) => i.id === id);
    const st = itemStockOf(hit);
    if (isAvailable && !st.unlimited && st.stock <= 0) isAvailable = false;
    try {
      await getJSON('/api/items/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable }),
      });
    } catch (_) {}
    if (sbConfigured()) {
      await sbSend('menu_items?id=eq.' + encodeURIComponent(id), 'PATCH', { is_available: isAvailable });
    }
    if (hit) hit.isAvailable = !!isAvailable;
    notify(true);
    return API.refresh();
  };

  API.saveShop = async function (shop) {
    const id = (API.user && sameRole(API.user.role, 'shop') && linkedShopId(API.user))
      || shop.id || '';
    if (!id || isDemoShop(id)) throw new Error('Missing shop');
    const prev = API.shops.find((s) => s.id === id) || {};
    const nextName = String(shop.name || '').trim();
    if (!nextName) throw new Error('Enter a shop name.');
    if (isDemoShopName(nextName) || isPlaceholderShopName(nextName)) throw new Error('Choose your shop name — not a demo name.');
    const row = {
      id,
      name: nextName,
      category: shop.category || prev.category || 'Bakery',
      rating: prev.rating || 5,
      reviews: prev.reviews || 0,
      is_open: shop.isOpen !== false,
      lat: finiteNum(shop.lat != null ? shop.lat : prev.lat),
      lng: finiteNum(shop.lng != null ? shop.lng : prev.lng),
      km: prev.km || 0,
      eta: prev.eta || '20–35 min',
      fee: prev.fee || 200,
      hours: shop.hours || prev.hours || '08:00 AM – 10:00 PM',
      address: shop.address || prev.address || '',
      image: shop.image || prev.image || '/img/shop-bakery.jpg',
      promo: shop.promo || shop.about || prev.promo || '',
    };
    persistedShopNames[id] = nextName;
    if (sbConfigured()) {
      try {
        await sbSend('shops?id=eq.' + encodeURIComponent(id), 'PATCH', {
          name: nextName,
          category: row.category,
          hours: row.hours,
          promo: row.promo,
          image: row.image,
          is_open: row.is_open,
        });
      } catch (_) {}
      await sbUpsert('shops', [row]);
      await sbSend('shops?id=eq.' + encodeURIComponent(id), 'PATCH', { name: nextName });
      try {
        const check = asRows(await sbGet('shops?id=eq.' + encodeURIComponent(id) + '&select=id,name'));
        if (!check[0] || String(check[0].name || '').trim() !== nextName) {
          await sbSend('shops?id=eq.' + encodeURIComponent(id), 'PATCH', { name: nextName });
        }
      } catch (_) {}
      try { await sbSend('orders?shop_id=eq.' + encodeURIComponent(id), 'PATCH', { shop_name: nextName }); } catch (_) {}
    }
    purgeLocalDemoStores();
    if (API.user && API.user.phone) {
      const rec = API.recallShopProfile(API.user.phone) || {};
      API.rememberShopProfile(API.user.phone, {
        shopId: id,
        shopName: nextName,
        ownerName: rec.ownerName || API.user.name || '',
        address: row.address || rec.address || '',
        lat: row.lat != null ? row.lat : rec.lat,
        lng: row.lng != null ? row.lng : rec.lng,
      });
    }
    const mapped = mapShop(row);
    const i = API.shops.findIndex((s) => s.id === id);
    if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
    else API.shops.push(mapped);
    if (API.user && sameRole(API.user.role, 'shop')) API.user.shopName = nextName;
    (API.orders || []).forEach(function (o) {
      if (o && String(o.shopId || '') === String(id)) o.shopName = nextName;
    });
    try { saveSession(); } catch (_) {}
    notify(true);
    try { await API.refresh(); } catch (_) {}
    const after = API.shops.find((s) => s.id === id);
    if (!after || String(after.name || '').trim() !== nextName) {
      persistedShopNames[id] = nextName;
      if (sbConfigured()) {
        try { await sbSend('shops?id=eq.' + encodeURIComponent(id), 'PATCH', { name: nextName }); } catch (_) {}
      }
      if (after) after.name = nextName;
      else API.shops.push(Object.assign({}, mapped, { name: nextName }));
      if (API.user && sameRole(API.user.role, 'shop')) API.user.shopName = nextName;
      notify(true);
    }
    return mapped;
  };

  API.saveItem = async function (item, opts) {
    if (!API.user || !sameRole(API.user.role, 'shop')) {
      throw new Error('Register as a shop owner first, then add items.');
    }
    try {
      API.user = await ensureShopRow(API.user, { required: true });
      saveSession();
    } catch (e) {
      throw new Error('Register your shop first, then add items.');
    }
    if (!API.isShopRegistered()) throw new Error('Register your shop first, then add items.');
    let sid = item.shopId || item.shop_id || linkedShopId(API.user) || '';
    if (!sid || isDemoShop(sid)) {
      sid = linkedShopId(API.user) || '';
    }
    if (!sid) throw new Error('Shop is not in the database. Register the shop, then add items.');
    if (!String(item.name || '').trim()) throw new Error('Enter an item name.');
    const id = item.id || ('ITM_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const st = itemStockOf(item);
    const plain = stripItemMeta(item.desc || item.description);
    let available = item.isAvailable !== false;
    if (!st.unlimited && st.stock <= 0) available = false;
    if (!st.unlimited && st.stock > 0 && item.stockUnlimited === false) available = item.isAvailable !== false;
    const row = {
      id,
      shop_id: sid,
      name: String(item.name).trim(),
      category: item.category || 'Food',
      price: Number(item.price || 0),
      is_available: available,
      description: packDesc(plain, st.unlimited, st.stock, item.offer),
      image: item.image || '/img/shop-bakery.jpg',
    };
    let mapped = mapItem(row);
    if (sbConfigured()) {
      await sbPutRow('menu_items', row);
      try {
        const check = await sbGet('menu_items?id=eq.' + encodeURIComponent(id) + '&select=*');
        if (check && check[0]) mapped = mapItem(check[0]);
        else throw new Error('missing');
      } catch (e) {
        throw new Error('Item did not save to the database. Try again.');
      }
    }
    if (sid) delete catState.itemIds[sid];
    const i = API.items.findIndex((x) => x.id === id);
    if (i >= 0) API.items[i] = mapped;
    else API.items.push(mapped);
    notify(true);
    if (!(opts && opts.silent)) {
      try { await API.refresh(); } catch (_) {}
      if (!API.items.some((x) => x.id === id)) API.items.push(mapped);
      notify(true);
    }
    return mapped;
  };

  function chatReadKey(orderId, role) {
    return 'qb_chat_read_' + String(role || '') + '_' + String(orderId || '');
  }
  function normChatRole(role) {
    return role === 'user' ? 'customer' : role;
  }
  function orderHasRider(o) {
    return !!(o && ((o.riderId && String(o.riderId) !== 'null') || o.riderName));
  }
  function orderPicked(o) {
    return !!(o && (o.status === 'picked_up' || o.status === 'on_the_way' || o.status === 'delivered'));
  }
  API.chatLane = function (order) {
    if (!order || order.status === 'cancelled') return null;
    if (orderPicked(order)) return 'customer';
    if (orderHasRider(order) || order.status === 'accepted') return 'shop';
    return null;
  };
  API.canChat = function (order, role) {
    const lane = API.chatLane(order);
    if (!lane) return false;
    const r = normChatRole(role);
    if (r === 'rider') return true;
    if (r === 'shop') return lane === 'shop';
    if (r === 'customer') return lane === 'customer';
    return false;
  };
  API.messageThread = function (m, order) {
    if (!m) return 'system';
    if (m.thread === 'shop' || m.thread === 'customer') return m.thread;
    const id = String(m.id || '');
    if (id.indexOf('qbS.') === 0) return 'shop';
    if (id.indexOf('qbC.') === 0) return 'customer';
    if (m.role === 'shop') return 'shop';
    if (m.role === 'customer' || m.role === 'user') return 'customer';
    if (m.role === 'system') return 'system';
    const pickedAt = order && (order.pickedUpAt || order.picked_up_at);
    if (pickedAt && m.ts) {
      const t = new Date(pickedAt).getTime();
      if (!isNaN(t)) return Number(m.ts) >= t ? 'customer' : 'shop';
    }
    return API.chatLane(order) || 'shop';
  };
  API.chatMessages = function (orderId, role) {
    const order = (API.orders || []).find((o) => o.id === orderId);
    const msgs = (API.messages || {})[orderId] || [];
    const r = normChatRole(role);
    const want = r === 'shop' ? 'shop' : r === 'customer' ? 'customer' : (API.chatLane(order) || 'shop');
    return msgs.filter((m) => {
      if (!m) return false;
      if (m.role === 'system') {
        const th = API.messageThread(m, order);
        if (th === 'system') return true;
        return th === want;
      }
      return API.messageThread(m, order) === want;
    });
  };
  API.chatPeerName = function (order, role) {
    if (!order) return 'Chat';
    const r = normChatRole(role);
    if (r === 'shop') return order.riderName || 'Rider';
    if (r === 'customer') return order.riderName || 'Courier';
    const lane = API.chatLane(order);
    if (lane === 'shop') {
      const shop = API.shopOf ? API.shopOf(order.shopId) : {};
      const pub = API.publicShopName ? API.publicShopName(shop) : '';
      if (pub && pub !== 'My Shop') return pub;
      if (order.shopName && (!API.user || !sameRole(API.user.role, 'shop') || !isOwnerLikeShopName(order.shopName, API.user))) return order.shopName;
      return shop.name && !isOwnerLikeShopName(shop.name, API.user) ? shop.name : 'Shop';
    }
    return order.customerName || 'Customer';
  };
  API.unreadCount = function (orderId, myRole) {
    const order = (API.orders || []).find((o) => o.id === orderId);
    const r = normChatRole(myRole);
    if ((r === 'customer' || r === 'shop') && !API.canChat(order, r)) return 0;
    const msgs = API.chatMessages(orderId, r);
    let readAt = 0;
    try { readAt = Number(localStorage.getItem(chatReadKey(orderId, r)) || 0); } catch (_) {}
    let n = 0;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!m || m.role === r || m.role === 'system') continue;
      if (Number(m.ts || 0) > readAt) n++;
    }
    return n;
  };
  API.markChatRead = function (orderId, myRole) {
    try { localStorage.setItem(chatReadKey(orderId, normChatRole(myRole)), String(Date.now())); } catch (_) {}
  };
  API.quickReplies = function (role, order) {
    const r = normChatRole(role);
    const lane = order ? API.chatLane(order) : null;
    if (r === 'shop') return ['Food is ready', 'Come to the counter', 'Park in front'];
    if (r === 'rider' && lane === 'shop') return ["On my way to the shop", "I've arrived at the shop", 'Which entrance?'];
    if (r === 'rider') return ["I'm on my way", "I've arrived", "I'm downstairs", 'Please come to the gate'];
    return ['Where are you?', "I'm at the gate", 'Please call me', 'Leave at the door', 'Thank you'];
  };

  API.sendMessage = async function (orderId, from, role, text) {
    const body = String(text || '').trim();
    if (!body) return null;
    const r = normChatRole(role);
    const order = (API.orders || []).find((o) => o.id === orderId);
    if (r !== 'system' && !API.canChat(order, r)) {
      const err = r === 'customer'
        ? 'Chat opens after the rider picks up your order.'
        : r === 'shop'
          ? 'Chat with the rider is open until pickup.'
          : 'Chat is not available for this order.';
      throw new Error(err);
    }
    const lane = r === 'system' ? null : API.chatLane(order);
    const prefix = lane === 'shop' ? 'qbS.' : lane === 'customer' ? 'qbC.' : 'm';
    const msg = {
      id: prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      from: from,
      role: r === 'system' ? 'system' : r,
      text: body,
      ts: Date.now(),
      thread: lane || undefined,
    };
    const list = API.messages[orderId] || (API.messages[orderId] = []);
    list.push(msg);
    notify(true);
    try {
      await getJSON('/api/orders/' + encodeURIComponent(orderId) + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, role: msg.role, text: body, thread: msg.thread }),
      });
    } catch (_) {}
    if (sbConfigured()) {
      try {
        await sbSend('messages', 'POST', [{
          id: msg.id,
          order_id: orderId,
          sender: from,
          role: msg.role,
          body: body,
          ts: msg.ts,
        }]);
      } catch (_) {}
    }
    try { await API.refresh(); } catch (_) {}
    const after = API.messages[orderId] || (API.messages[orderId] = []);
    if (!after.some((x) => x.id === msg.id || (x.text === msg.text && x.role === msg.role))) {
      after.push(msg);
      notify(true);
    }
    return msg;
  };

  API.reset = async function () {
    API._demoWipeTries = 0;
    await wipeDemo();
    try { await getJSON('/api/reset', { method: 'POST' }); } catch (_) {}
    return API.refresh();
  };

  API.shopOf = shopOf;

  API.statusLabel = function (s) {
    return (
      {
        pending: 'Waiting for confirm',
        preparing: 'Preparing',
        ready: 'Ready for pickup',
        accepted: 'Rider accepted',
        picked_up: 'Picked up',
        on_the_way: 'Picked up',
        delivered: 'Delivered',
        cancelled: 'Cancelled',
      }[s] || s
    );
  };

  API.rs = function (n) {
    return 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-LK');
  };

  try {
    if (!API.base) throw new Error('no stream');
    const es = new EventSource(url('/api/stream'));
    es.onmessage = (ev) => {
      if (sbConfigured()) {
        API.refresh().catch(() => {});
        return;
      }
      const data = JSON.parse(ev.data);
      if (data.type === 'state') {
        API.shops = data.shops;
        API.items = data.items;
        API.orders = data.orders;
        API.messages = data.messages || {};
        scopeData();
        notify();
      }
    };
  } catch (_) {}

  (function bootCleanCache() {
    const GEN = '19y';
    let g = '';
    try { g = localStorage.getItem('qb_gen') || sessionStorage.getItem('qb_gen') || ''; } catch (_) {}
    const first = g !== GEN;
    if (first) {
      try {
        localStorage.setItem('qb_gen', GEN);
        sessionStorage.setItem('qb_gen', GEN);
      } catch (_) {}
    }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          rs.forEach(function (r) { try { r.unregister(); } catch (_) {} });
        });
      }
    } catch (_) {}
    API.restore();
  })();
  try {
    const w = new URLSearchParams(location.search || '').get('wipe');
    if (w && /^(all|\*|reset)$/i.test(String(w).trim())) {
      clearAllLocalAuth();
    } else if (w) dropLocalShop(w);
  } catch (_) {}
  if (API.user) notify(true);
  API.refresh().catch(() => {});
  setInterval(() => {
    if (sbConfigured()) API.refresh({ light: true }).catch(() => {});
  }, 2500);
  global.API = API;
})(window);
