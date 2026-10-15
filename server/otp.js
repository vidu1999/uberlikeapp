'use strict';

const crypto = require('crypto');

const otps = new Map();
const smsByToken = new Map();

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('94') && d.length === 11) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('7')) d = '0' + d;
  return d;
}

function isValidPhone(phone) {
  return /^07\d{8}$/.test(phone) || /^\d{10,15}$/.test(phone);
}

function hashCode(code, phone) {
  return crypto.createHash('sha256').update(String(code) + ':' + phone + ':ubereats-lk').digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function keyOf(role, phone) {
  return String(role || 'customer') + ':' + phone;
}

function sendOtp(phoneRaw, role) {
  const phone = normalizePhone(phoneRaw);
  if (!isValidPhone(phone)) {
    const err = new Error('Enter a valid mobile number');
    err.status = 400;
    throw err;
  }
  const key = keyOf(role, phone);
  const prev = otps.get(key);
  if (prev && Date.now() - prev.lastSent < 30000) {
    const wait = Math.ceil((30000 - (Date.now() - prev.lastSent)) / 1000);
    const err = new Error('Wait ' + wait + 's before resending');
    err.status = 429;
    throw err;
  }
  const code = generateCode();
  const smsToken = crypto.randomBytes(16).toString('hex');
  const body = 'Your Uber Eats code is ' + code + '. Don\'t share this WhatsApp message.';
  const rec = {
    hash: hashCode(code, phone),
    expires: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    smsToken,
    phone,
    role: role || 'customer',
    lastSent: Date.now(),
  };
  otps.set(key, rec);
  smsByToken.set(smsToken, {
    from: 'Uber Eats',
    body,
    phone,
    channel: 'whatsapp',
    expires: rec.expires,
  });
  return {
    ok: true,
    phone,
    smsToken,
    channel: 'whatsapp',
    expiresIn: 300,
  };
}

function readSms(smsToken) {
  const m = smsByToken.get(String(smsToken || ''));
  if (!m || m.expires < Date.now()) return null;
  return { from: m.from, body: m.body, phone: m.phone, channel: m.channel || 'whatsapp' };
}

function verifyOtp(phoneRaw, role, codeRaw) {
  const phone = normalizePhone(phoneRaw);
  const code = String(codeRaw || '').replace(/\D/g, '');
  const rec = otps.get(keyOf(role, phone));
  if (!rec) {
    const err = new Error('No code was sent to this number. Request a new OTP.');
    err.status = 400;
    throw err;
  }
  if (rec.expires < Date.now()) {
    otps.delete(keyOf(role, phone));
    const err = new Error('Code expired. Request a new OTP.');
    err.status = 400;
    throw err;
  }
  rec.attempts += 1;
  if (rec.attempts > 5) {
    otps.delete(keyOf(role, phone));
    const err = new Error('Too many attempts. Request a new OTP.');
    err.status = 429;
    throw err;
  }
  if (code.length !== 4 || rec.hash !== hashCode(code, phone)) {
    const err = new Error('That code does not match this phone number.');
    err.status = 401;
    throw err;
  }
  otps.delete(keyOf(role, phone));
  smsByToken.delete(rec.smsToken);
  return { phone, role: role || 'customer' };
}

module.exports = { normalizePhone, isValidPhone, sendOtp, readSms, verifyOtp };
