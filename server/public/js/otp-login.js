(function (global) {
  const DEFAULTS = {
    customer: '',
    shop: '',
    rider: '',
  };
  const WA_ICON = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#fff" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24zM8.68 7.51c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.39 1.01 2.56.12.17 1.75 2.67 4.23 3.74 2.05.9 2.47.72 2.92.67.45-.05 1.45-.59 1.65-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.43-.28-.22-.12-1.45-.71-1.67-.79-.22-.08-.38-.12-.54.12-.16.25-.62.79-.76.95-.14.17-.27.19-.5.06-.22-.12-.96-.35-1.83-1.13-.68-.6-1.13-1.35-1.27-1.57-.13-.22-.01-.34.1-.46.11-.11.22-.28.34-.42.11-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.54-1.3-.74-1.78-.2-.48-.39-.4-.54-.4z"/></svg>';

  function render(opts) {
    const role = opts.role || 'customer';
    const title = opts.title || 'Enter your mobile number';
    const sub = opts.sub || 'We’ll send a 4-digit code on WhatsApp. Same number can be User, Shop, and Rider — not two accounts in the same role.';
    const phone = opts.phone || DEFAULTS[role] || '';
    return `<div class="login otp-login" data-otp-root data-role="${role}">
      <div class="wordmark">Quick<em>Bite</em></div>
      <div class="otp-steps"><span class="on">1 Phone</span><span>2 WhatsApp</span><span>3 Code</span></div>
      <div data-step="phone">
        <h1>${title}</h1>
        <p class="sub">${sub}</p>
        <div class="phone-row">
          <span class="cc">+94</span>
          <input id="phone" inputmode="tel" autocomplete="tel" maxlength="12" value="${phone}" />
        </div>
        <p class="otp-err" data-err></p>
        <button class="btn full" type="button" data-send>Continue</button>
      </div>
      <div data-step="code" class="hidden">
        <button class="back" type="button" data-back-phone style="position:static">←</button>
        <h1>Enter the 4-digit code</h1>
        <p class="sub">WhatsApp sent to <b data-sent-phone></b></p>
        <div class="wa-chat" data-wa-chat>
          <div class="wa-head">${WA_ICON}<div><b>QuickBite</b><small>WhatsApp · now</small></div></div>
          <div class="wa-thread">
            <div class="wa-bubble" data-sms-body>Sending…</div>
          </div>
        </div>
        <div class="otp-boxes">
          <input data-d="0" maxlength="1" inputmode="numeric" />
          <input data-d="1" maxlength="1" inputmode="numeric" />
          <input data-d="2" maxlength="1" inputmode="numeric" />
          <input data-d="3" maxlength="1" inputmode="numeric" />
        </div>
        <p class="otp-err" data-err2></p>
        <button class="btn full" type="button" data-verify>Verify & enter</button>
        <button class="btn ghost full" type="button" data-resend style="margin-top:8px">Resend on WhatsApp</button>
      </div>
      <div class="wa-toast hidden" data-sms>
        <div class="wa-toast-ico">${WA_ICON}</div>
        <div class="grow">
          <div class="sms-meta"><span>WhatsApp</span><span>now</span></div>
          <div class="sms-from">QuickBite</div>
          <div class="sms-body" data-sms-preview></div>
        </div>
      </div>
    </div>`;
  }

  function codeValue(root) {
    return [...root.querySelectorAll('.otp-boxes input')].map((i) => i.value).join('');
  }

  function setStep(root, step) {
    root.querySelector('[data-step="phone"]').classList.toggle('hidden', step !== 'phone');
    root.querySelector('[data-step="code"]').classList.toggle('hidden', step !== 'code');
    const spans = root.querySelectorAll('.otp-steps span');
    spans.forEach((s, i) => s.classList.toggle('on', i < (step === 'phone' ? 1 : 3)));
  }

  async function deliverWhatsApp(root, smsToken) {
    const toast = root.querySelector('[data-sms]');
    const preview = root.querySelector('[data-sms-preview]');
    const bubble = root.querySelector('[data-sms-body]');
    const sent = 'Open WhatsApp. We sent the 4-digit code to this number.';
    if (bubble) bubble.textContent = sent;
    if (preview) preview.textContent = sent;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 7000);
  }

  function bind(opts) {
    const root = document.querySelector('[data-otp-root]');
    if (!root) return;
    const role = opts.role || root.dataset.role || 'customer';
    const err = root.querySelector('[data-err]');
    const err2 = root.querySelector('[data-err2]');
    let phone = '';

    async function send() {
      const input = document.getElementById('phone');
      phone = (input && input.value) || '';
      err.textContent = '';
      const btn = root.querySelector('[data-send]');
      btn.disabled = true;
      btn.textContent = 'Sending WhatsApp…';
      try {
        const out = await API.sendOtp(role, phone);
        phone = out.phone;
        root.querySelector('[data-sent-phone]').textContent = phone;
        setStep(root, 'code');
        deliverWhatsApp(root, out.smsToken);
        const first = root.querySelector('.otp-boxes input');
        if (first) first.focus();
      } catch (e) {
        err.textContent = e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Continue';
    }

    async function verify() {
      err2.textContent = '';
      const code = codeValue(root);
      if (code.length !== 4) {
        err2.textContent = 'Enter the 4-digit WhatsApp code';
        return;
      }
      const btn = root.querySelector('[data-verify]');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const out = await API.verifyOtp(role, phone || document.getElementById('phone').value, code);
        if (opts.onReady) opts.onReady(out);
      } catch (e) {
        err2.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Verify & enter';
      }
    }

    root.querySelector('[data-send]').onclick = send;
    root.querySelector('[data-verify]').onclick = verify;
    root.querySelector('[data-resend]').onclick = send;
    root.querySelector('[data-back-phone]').onclick = () => setStep(root, 'phone');
    root.querySelectorAll('.otp-boxes input').forEach((el) => {
      el.oninput = () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 1);
        const i = Number(el.dataset.d);
        if (el.value && i < 3) root.querySelector('.otp-boxes input[data-d="' + (i + 1) + '"]').focus();
        if (codeValue(root).length === 4) verify();
      };
      el.onkeydown = (e) => {
        if (e.key === 'Backspace' && !el.value) {
          const i = Number(el.dataset.d);
          if (i > 0) root.querySelector('.otp-boxes input[data-d="' + (i - 1) + '"]').focus();
        }
      };
    });
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      phoneInput.onkeydown = (e) => {
        if (e.key === 'Enter') send();
      };
    }
  }

  global.OtpLogin = { render, bind };
})(window);
