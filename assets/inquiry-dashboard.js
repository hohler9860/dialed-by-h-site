(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const status = text => { el('status').textContent = text; };
  function rows(id, data, keys) {
    el(id).replaceChildren();
    data.forEach(item => {
      const tr = document.createElement('tr');
      keys.forEach(key => { const td = document.createElement('td'); td.textContent = String(item[key] ?? ''); tr.appendChild(td); });
      el(id).appendChild(tr);
    });
    if (!data.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = keys.length; td.textContent = 'No measured activity yet.'; tr.appendChild(td); el(id).appendChild(tr); }
  }
  async function load() {
    const token = window.dialedAdmin.getToken();
    el('login').hidden = !!token; el('signout').hidden = !token;
    if (!token) { el('report').hidden = true; status('Sign in to view private analytics.'); return; }
    el('refresh').disabled = true; status('Loading…');
    try {
      const r = await fetch('/api/submit-form?action=analytics&days=' + el('period').value, {headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if (r.status === 401) { window.dialedAdmin.clearToken(); el('login').hidden = false; el('signout').hidden = true; throw new Error('Please sign in with your admin password.'); }
      if (!r.ok) throw new Error('Analytics is unavailable. Please retry.');
      const d = await r.json();
      el('sessions').textContent = d.totals.sessions; el('opens').textContent = d.funnel.opened;
      el('inquiries').textContent = d.totals.inquiries; el('whatsapp').textContent = d.totals.whatsapp_clicks;
      el('funnel').replaceChildren();
      [['Opened a form',d.funnel.opened],['Attempted submission (among opened forms)',d.funnel.attempted],['Saved successfully (among opened forms)',d.funnel.completed],['Not completed in this window',d.funnel.not_completed],['Forms with a recorded error',d.funnel.errors]].forEach(([label,value]) => {
        const row = document.createElement('div'); row.className='bar'; const name=document.createElement('span'), n=document.createElement('strong'); name.textContent=label;n.textContent=value;row.append(name,n);el('funnel').appendChild(row);
      });
      el('completion').textContent = d.funnel.opened ? (100*d.funnel.completed/d.funnel.opened).toFixed(1)+'% of measured opened forms saved an inquiry.' : 'Completion rate will appear after the first measured form open.';
      rows('sources',d.sources,['source','campaign','sessions','forms_opened','inquiries','whatsapp_clicks']);
      rows('pages',d.pages,['path','sessions','forms_opened','inquiries','whatsapp_clicks']);
      el('coverage').textContent = 'Earliest retained event: '+(d.first_event_at ? new Date(d.first_event_at).toLocaleString() : 'none yet')+'. '+d.funnel.submitted_without_open+' submitted form(s) have no matching open event in this window. '+d.totals.whatsapp_sessions+' session(s) clicked WhatsApp. Raw events are retained for 90 days.';
      el('report').hidden=false;status('Updated '+new Date(d.generated_at).toLocaleString()+'. Rolling '+d.days+'-day window.');
    } catch (e) { el('report').hidden=true;status(e.message); }
    finally { el('refresh').disabled=false; }
  }
  el('login').addEventListener('submit', e => { e.preventDefault();window.dialedAdmin.setToken(el('password').value);el('password').value='';load(); });
  el('refresh').addEventListener('click',load);el('period').addEventListener('change',load);
  el('signout').addEventListener('click',()=>{window.dialedAdmin.clearToken();load();});
  load();
})();
