(function (global) {
  const DEFAULTS = {
    customer: '0771234567',
    shop: '0772223333',
    rider: '0775556666',
  };

  function render(opts) {
    const role = opts.role || 'customer';
    const title = opts.title || 'Enter your mobile number';
    const sub = opts.sub || 'We’ll text a 4-digit code. Free SMS · no PIN.';
    const phone = opts.phone || DEFAULTS[role] || '';
    return `<div class="login otp-login" data-otp-root data-role="${role}">
      <div class="wordmark">Uber <em>Eats</em></div>
      <div class="otp-steps"><span class="on">1 Phone</span><span>2 SMS</span><span>3 Code</span></div>
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
        <p class="sub">SMS sent to <b data-sent-phone></b></p>
        <div class="otp-boxes">
          <input data-d="0" maxlength="1" inputmode="numeric" />
          <input data-d="1" maxlength="1" inputmode="numeric" />
          <input data-d="2" maxlength="1" inputmode="numeric" />
          <input data-d="3" maxlength="1" inputmode="numeric" />
        </div>
        <p class="otp-err" data-err2></p>
        <button class="btn full" type="button" data-verify>Verify & enter</button>
        <button class="btn ghost full" type="button" data-resend style="margin-top:8px">Resend SMS</button>
      </div>
      <div class="sms-toast hidden" data-sms>
        <div class="sms-meta"><span>Messages</span><span>now</span></div>
        <div class="sms-from">Uber Eats</div>
        <div class="sms-body" data-sms-body></div>
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

  async function deliverSms(root, smsToken) {
    const toast = root.querySelector('[data-sms]');
    const body = root.querySelector('[data-sms-body]');
    try {
      await new Promise((r) => setTimeout(r, 900));
      const sms = await API.readSms(smsToken);
      if (body) body.textContent = sms.body;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 8000);
    } catch (_) {}
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
      btn.textContent = 'Sending SMS…';
      try {
        const out = await API.sendOtp(role, phone);
        phone = out.phone;
        root.querySelector('[data-sent-phone]').textContent = phone;
        setStep(root, 'code');
        deliverSms(root, out.smsToken);
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
        err2.textContent = 'Enter the 4-digit SMS code';
        return;
      }
      const btn = root.querySelector('[data-verify]');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        await API.verifyOtp(role, phone || document.getElementById('phone').value, code);
        if (opts.onReady) opts.onReady();
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
