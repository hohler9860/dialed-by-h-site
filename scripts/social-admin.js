(function () {
    'use strict';
    var timer, generation = 0, active = false, busy = false, data;
    var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
    var date = function (v) { return v ? new Date(v).toLocaleString('en-US', {timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' ET' : '—'; };
    var button = function (label, action, id) { return '<button class="btn ghost" data-social-action="'+action+'"'+(id?' data-id="'+esc(id)+'"':'')+'>'+label+'</button>'; };
    function stop() { active=false;generation++;clearInterval(timer); }
    async function render(view, auth) {
        stop();active=true;var run=generation;
        async function call(action, args) { return auth.adminFetchTo('/api/leads-admin','social-'+action,args||{}); }
        async function update() {
            var result=await call('status');
            if(!active||run!==generation) return;
            data=result;paint(view,result);
        }
        try { await update(); } catch(error) { if(active&&run===generation) throw error; return; }
        if(!active||run!==generation) return;
        view.onclick=async function(e) {
            var target=e.target.closest('[data-social-action]');if(!target||busy||!active)return;
            var action=target.dataset.socialAction,p=data.posts && data.posts.find(function(p){return p.id===target.dataset.id;});
            var args=p?{id:p.id,version:p.version}:{};
            if(action==='open-editor') {openEditor(view,p);return;}
            if(action==='cancel-edit') {paint(view,data);return;}
            if(action==='mode') {
                args.mode=data.autonomy==='autonomous'?'review':'autonomous';
                if(args.mode==='autonomous'&&!confirm('Enable automatic drafting, editorial checks, and scheduling? Eligible posts can publish without individual approval once the queue is resumed. Uncertain claims will be held.'))return;
            }
            if(action==='reject'&&!confirm('Reject this draft and remove it from the schedule?'))return;
            busy=true;target.disabled=true;
            try {if(action!=='refresh')await call(action,args);await update();}
            catch(error) {showError(view,error.message);}
            finally {busy=false;target.disabled=false;}
        };
        view.onsubmit=async function(e) {
            if(e.target.id!=='social-edit-form')return;e.preventDefault();var form=e.target;
            busy=true;var submit=form.querySelector('[type=submit]');submit.disabled=true;
            try {
                await call('edit',{id:form.dataset.id,version:Number(form.dataset.version),body:form.elements.body.value,scheduledAt:new Date(form.elements.scheduledAt.value).toISOString()});
                await update();
            } catch(error) {showError(view,error.message);} finally {busy=false;submit.disabled=false;}
        };
        timer=setInterval(function(){if(!busy&&active&&document.visibilityState==='visible'&&!view.querySelector('#social-edit-form'))update().catch(function(err){showError(view,'Status refresh failed: '+err.message);});},30000);
    }
    function showError(view,message) {var box=view.querySelector('#social-error');if(box){box.textContent=message;box.hidden=false;}}
    function paint(view,d) {
        if(!d.configured) {
            view.innerHTML='<div class="social"><div class="bar"><h2>Social publishing</h2></div><section class="social-panel"><h3>Connect the publishing worker</h3><p>'+esc(d.reason)+'</p><p>The website admin is ready to show the queue, account identity, worker heartbeat, and verified post links once hosting is connected.</p><p class="count">Required server settings: SOCIAL_POSTER_URL and SOCIAL_POSTER_SECRET</p>'+button('Check connection','refresh')+'</section><section class="social-panel"><h3>Reddit · approval required</h3><p>Commercial API approval, a dedicated app account, and community rules need to be confirmed before automated posting can be enabled.</p><a href="https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy" target="_blank" rel="noopener noreferrer">Reddit requirements ↗</a></section><p id="social-error" class="err" role="alert" hidden></p></div>';return;
        }
        var verified=d.posts.filter(function(p){return p.delivery_status==='verified';}).length;
        var awaiting=d.posts.filter(function(p){return p.status==='draft'||p.status==='uncertain'||p.status==='failed'||p.delivery_status==='unverified';}).length;
        var next=d.nextPost?date(d.nextPost.scheduled_at):'No approved posts queued';
        view.innerHTML='<div class="social"><div class="bar"><h2>Social publishing</h2><span class="pill">'+(d.paused?'Paused':'Active')+'</span><span class="pill">'+(d.autonomy==='autonomous'?'Autonomous':'Review each post')+'</span><div class="grow"></div>'+button('Refresh','refresh')+button(d.paused?'Resume publishing':'Pause publishing',d.paused?'resume':'pause')+'</div><p id="social-error" class="err" role="alert" hidden></p>'+
            '<div class="social-grid"><section class="social-panel"><span class="count">X account</span><h3>'+esc(d.account?'@'+d.account.username:'Not connected')+'</h3><p>'+(d.account?'Account ID '+esc(d.account.id):'Connect the account before publishing.')+'</p><p class="count">Last verified: '+date(d.account&&d.account.verifiedAt)+'</p>'+button('Verify account now','verify-account')+'</section>'+
            '<section class="social-panel"><span class="count">Worker</span><h3>'+(d.worker.healthy?'Checking the queue':'Offline or delayed')+'</h3><p>Last heartbeat: '+date(d.worker.heartbeat)+'</p><p>Last completed sweep: '+date(d.worker.lastSweep)+'</p><p class="count">Dashboard can be closed while the hosted worker runs.</p></section>'+
            '<section class="social-panel"><span class="count">Next post</span><h3>'+esc(next)+'</h3><p>'+verified+' verified deliveries · '+awaiting+' items need attention</p><p class="count">X estimate: $'+Number(d.estimatedSpend).toFixed(2)+' / $'+d.monthlyBudget+'</p></section></div>'+
            '<section class="social-panel"><div class="bar"><h3>Editorial controls</h3><div class="grow"></div>'+button(d.autonomy==='autonomous'?'Require individual approval':'Enable autonomous mode','mode')+'</div><p>'+(d.autonomy==='autonomous'?'The worker prepares drafts, runs an independent editorial check, and schedules eligible posts. Unsupported or time-sensitive claims are held. Publishing pause is controlled separately.':'Drafts require your approval. Autonomous mode adds a separate editorial check before scheduling eligible drafts automatically.')+'</p><p class="count">'+(d.draftingConfigured?'Drafting API configured':'Drafting API not configured')+' · Five slots per day · America/New_York</p><p><a href="'+esc(d.serviceUrl)+'/#settings" target="_blank" rel="noopener noreferrer">Manage provider connections and research ↗</a></p></section>'+
            '<section class="social-panel"><h3>Publishing queue & proof</h3><p>“Verified” means the post was fetched back from X and its author and text matched. API acceptance alone is shown separately.</p><div class="social-table-wrap"><table class="social-table"><thead><tr><th>Post</th><th>Schedule</th><th>Status</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>'+d.posts.map(function(p){
                var editable=['draft','scheduled','failed','expired'].indexOf(p.status)!==-1;
                var actions=editable?button('Edit','open-editor',p.id):'';
                if(['draft','failed','expired'].indexOf(p.status)!==-1)actions+=button('Approve','approve',p.id);
                if(editable)actions+=button('Reject','reject',p.id);
                if(p.delivery_status==='unverified')actions+=button('Recheck delivery','recheck',p.id);
                var delivery=p.delivery_status==='verified'?'Verified':p.delivery_status==='unverified'?'Could not verify':p.status==='posted'?'Accepted · verification pending':'—';
                return '<tr><td><div class="count">'+esc(p.category)+'</div><p class="social-post">'+esc(p.body)+'</p>'+(p.error?'<p class="err">'+esc(p.error)+'</p>':'')+(p.editorial_reasons.length?'<p class="social-note">'+esc(p.editorial_reasons.join(' '))+'</p>':'')+'</td><td>'+date(p.scheduled_at)+'</td><td>'+esc(p.status)+(p.auto_approved?'<p class="count">Automatically checked</p>':'')+'</td><td>'+delivery+(p.verified_at?'<p class="count">'+date(p.verified_at)+'</p>':'')+(p.url?'<p><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">View on X ↗</a></p>':'')+(p.verification_error?'<p class="err">'+esc(p.verification_error)+'</p>':'')+'</td><td><div class="social-actions">'+actions+'</div></td></tr>';
            }).join('')+'</tbody></table></div></section>'+
            '<div class="social-grid social-two"><section class="social-panel"><h3>Reddit · approval required</h3><p>'+esc(d.reddit.reason)+'</p><p>Reddit needs a separate community-specific schedule, permitted formats, flairs, and promotional rules. X content will not be automatically copied across communities.</p><a href="https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy" target="_blank" rel="noopener noreferrer">Review Reddit requirements ↗</a></section><section class="social-panel"><h3>Recent activity</h3>'+d.events.slice(0,10).map(function(e){return '<div class="social-event"><span class="count">'+date(e.created_at)+'</span><p>'+esc(e.message)+'</p></div>';}).join('')+'</section></div></div>';
    }
    function openEditor(view,p) {
        var local=p.scheduled_at?new Date(Date.parse(p.scheduled_at)-new Date(p.scheduled_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
        view.innerHTML='<div class="social"><div class="bar"><h2>Edit social draft</h2>'+button('Cancel','cancel-edit')+'</div><form id="social-edit-form" data-id="'+p.id+'" data-version="'+p.version+'" class="social-panel"><label for="social-body">Post text</label><textarea id="social-body" name="body" class="ctl" rows="6" maxlength="4000" required>'+esc(p.body)+'</textarea><label for="social-time">Publish at · your browser’s local timezone</label><input id="social-time" name="scheduledAt" class="ctl" type="datetime-local" value="'+local+'" required><p>Saving returns the post to manual review. Edit supporting sources or images in the content workspace.</p><button class="btn" type="submit">Save draft</button><p id="social-error" class="err" role="alert" hidden></p></form></div>';
    }
    window.dialedSocial={render:render,stop:stop};
})();
