/* First-party, session-scoped measurement. No field values, cookies or fingerprinting. */
(function () {
  'use strict';
  if (window.dbhTracking || !window.dbhInquirySchema || !window.crypto || !crypto.randomUUID) return;
  const schema = window.dbhInquirySchema;
  const KEY = 'dbh_inquiry_session_v1', TTL = 30 * 60 * 1000;
  const forms = new WeakMap();
  let memory, count = 0;
  function disabled() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1' || /^\/(admin|api)(\/|$)/.test(location.pathname);
  }
  function session() {
    if (disabled()) return null;
    let s = memory;
    try { s = JSON.parse(sessionStorage.getItem(KEY)) || s; } catch (_) {}
    if (!s || !schema.context(s) || !s.expires || s.expires < Date.now()) {
      const q = new URLSearchParams(location.search);
      let host = null;
      try { const u = new URL(document.referrer); if (!['dialedbyhenry.com','www.dialedbyhenry.com',location.hostname].includes(u.hostname)) host = u.hostname; } catch (_) {}
      s = {session_id: crypto.randomUUID(), landing_path: schema.path(location.pathname), referrer_host: schema.referrer(host), device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'};
      ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(k => { s[k] = schema.token(q.get(k)); });
    }
    s.expires = Date.now() + TTL;
    memory = s;
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
    return s;
  }
  function context(form) {
    const s = session();
    if (!s) return null;
    const f = form && forms.get(form);
    return schema.context({...s, path: location.pathname, ...(f || {})});
  }
  function send(name, form) {
    try {
      const c = context(form);
      if (!c || count >= 100) return;
      count++;
      const body = JSON.stringify({...c, event_id: crypto.randomUUID(), event: name});
      const url = '/api/submit-form?action=track';
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], {type:'application/json'}))) return;
      fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true, credentials:'same-origin'}).catch(function () {});
    } catch (_) { /* Measurement must never break an inquiry or navigation. */ }
  }
  function open(form, type) {
    if (!form || !schema.types.includes(type) || disabled()) return;
    if (!forms.has(form)) {
      forms.set(form, {form_id: crypto.randomUUID(), form_type:type});
      send('form_open', form);
    }
  }
  window.dbhTracking = {
    open,
    context: function (form) { try { return context(form); } catch (_) { return null; } },
    attempt: function (form) { send('form_attempt', form); },
    error: function (form) { send('form_error', form); },
    whatsapp: function (form) { send('whatsapp_click', form); }
  };
  document.addEventListener('click', function (e) {
    const link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      const u = new URL(link.href, location.href);
      if (['wa.me','api.whatsapp.com','web.whatsapp.com'].includes(u.hostname)) send('whatsapp_click', link.closest('form'));
    } catch (_) {}
  }, true);
  send('page_view');
})();
