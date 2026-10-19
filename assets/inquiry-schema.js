/* Shared allowlist: never accept form values, complete URLs, or message text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.dbhInquirySchema = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const types = ['BUY', 'SELL', 'TRADE', 'WATCH_DETAIL'];
  const events = ['page_view', 'form_open', 'form_attempt', 'form_error', 'whatsapp_click'];
  function token(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(value) && !/\d{7,}/.test(value) ? value.toLowerCase() : null;
  }
  function path(value) {
    if (typeof value !== 'string') return '/';
    value = value.split(/[?#]/)[0].replace(/\/$/, '') || '/';
    return /^(?:\/|\/(?:source|sell|trade|buy|about|process|journal|privacy|boston|buy-rolex-boston|sell-rolex-boston|rolex-dealer-boston|patek-philippe-boston|rolex|patek-philippe|audemars-piguet|richard-mille|vacheron-constantin|cartier|fp-journe|a-lange-sohne|trivia)|\/(?:watch|journal)\/[a-z0-9-]{1,180})$/.test(value) ? value : '/other';
  }
  function referrer(value) {
    if (typeof value !== 'string' || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) return null;
    const host = value.toLowerCase();
    // Only known channels are retained; arbitrary subdomains can contain identifiers.
    if (/(^|\.)(instagram\.com|facebook\.com|google\.com|bing\.com|tiktok\.com|linkedin\.com|youtube\.com|pinterest\.com|duckduckgo\.com)$/.test(host)) return host;
    if (['t.co','l.wl.co','bentley-startup-showcase.netlify.app'].includes(host)) return host;
    return host ? 'other-referral' : null;
  }
  function context(raw) {
    if (!raw || typeof raw !== 'object' || !UUID.test(raw.session_id || '')) return null;
    return {
      session_id: raw.session_id.toLowerCase(),
      form_id: UUID.test(raw.form_id || '') ? raw.form_id.toLowerCase() : null,
      form_type: types.includes(raw.form_type) ? raw.form_type : null,
      path: path(raw.path), landing_path: path(raw.landing_path),
      referrer_host: referrer(raw.referrer_host),
      utm_source: token(raw.utm_source), utm_medium: token(raw.utm_medium),
      utm_campaign: token(raw.utm_campaign), utm_content: token(raw.utm_content),
      device: ['mobile','desktop'].includes(raw.device) ? raw.device : null
    };
  }
  function event(raw) {
    const out = context(raw);
    if (!out || !UUID.test(raw.event_id || '') || !events.includes(raw.event)) return null;
    if (raw.event.startsWith('form_') && (!out.form_id || !out.form_type)) return null;
    return { ...out, event_id: raw.event_id.toLowerCase(), event: raw.event };
  }
  return { context, event, path, token, referrer, types };
});
