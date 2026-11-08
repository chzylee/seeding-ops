/*
	app/public/update.js — the update status in the account bar, beside the profile, on every page
	(Noah, 2026-11-08: "on open, auto check for updates. at top bar by profile pic, will notify if up to
	date or if there's a new version to get. update gets new version, installs, relaunches.").

	Each page asks the app's server once (POST /api/update/check). The server asks GitHub once per
	launch and caches the answer (app/server.js), so moving between pages never asks again. While it
	checks the bar shows nothing new. Then:
	  up to date        "v0.2.0 · You're up to date" (quiet; a click checks again)
	  check failed      "v0.2.0", titled "Couldn't check for updates" (never an error)
	  newer, installed  "Update available: v0.3.0" + Update (+ What's new): one confirm dialog, then the
	                    server downloads, checks the signature, starts the installer and closes the app;
	                    the installer reopens it (lib/update.js)
	  newer, elsewhere  "Update available: v0.3.0" + Download (a checkout, the portable ZIP, no key)
	  checkout          "v0.2.0 (dev)" when nothing newer exists
	Update is disabled while a pull, schedule pull, archive or push runs (GET /api/update's busy, read
	every few seconds while an update is on offer); the server refuses then too.
*/
(function () {
	'use strict';
	if (window.UpdateBar) return;
	var H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
	var POLL_MS = 4000;
	var BUSY_TITLE = 'Finish the current pull or push first';
	var st = null;            // the server's answer; null while checking
	var phase = 'idle';       // 'idle' | 'downloading' | 'installing' | 'failed'
	var failReason = '';
	var polling = false;
	var area, text, btn, retry, link, dlg;

	var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
	var v = function (x) { return 'v' + String(x || '').replace(/^v/i, ''); };

	function post(url, body) {
		return fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body || {}) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b || {} }; }); })
			.catch(function (e) { return { ok: false, status: 0, body: { error: 'The app did not answer (' + e.message + ').' } }; });
	}

	function el(tag, id, cls) { var e = document.createElement(tag); e.id = id; if (cls) e.className = cls; return e; }

	function setText(s, title) { text.textContent = s; text.title = title || ''; }

	function render() {
		btn.hidden = true; retry.hidden = true; link.hidden = true;
		area.classList.toggle('available', false);
		if (!st) { area.hidden = true; return; }   // checking: nothing new
		area.hidden = false;
		var cur = v(st.current);
		if (phase === 'downloading') return setText('Downloading update…');
		if (phase === 'installing' || st.updating) return setText('Installing update… Seeding Ops will reopen in a moment.');
		if (phase === 'failed') { setText('Update failed. Try again later.', failReason); retry.hidden = false; return; }
		if (st.ok === false) {   // no error shown: the version, which a click checks again (audit, final #1)
			text.title = '';
			text.innerHTML = '<button type="button" class="update-recheck">' + esc(cur + (st.dev ? ' (dev)' : '')) + '</button>';
			var again = text.querySelector('.update-recheck');
			again.title = "Couldn't check for updates. Click to try again.";
			again.addEventListener('click', recheck);
			return;
		}
		if (!st.available) {
			if (st.dev) return setText(cur + ' (dev)');
			text.title = '';
			text.innerHTML = '<button type="button" class="update-recheck" title="Check for updates again">' + esc(cur) + " · You're up to date</button>";
			text.querySelector('.update-recheck').addEventListener('click', recheck);
			return;
		}
		area.classList.toggle('available', true);
		setText('Update available: ' + v(st.latest));
		if (st.releases_page) {
			link.href = st.releases_page;
			link.textContent = st.can_install ? "What's new" : 'Download';
			link.hidden = false;
		}
		if (st.can_install) {
			btn.hidden = false;
			btn.disabled = !!st.busy;
			btn.title = st.busy ? BUSY_TITLE : 'Update to ' + v(st.latest);
			poll();
		}
	}

	function take(res) {
		if (res.body && res.body.current) st = res.body;
		render();
	}

	function recheck() {
		var b = text.querySelector('.update-recheck');
		b.disabled = true;
		return post('/api/update/check', { force: true }).then(take);
	}

	// While Update is on offer: keep its busy state current (GET /api/update is local, no GitHub).
	function poll() {
		if (polling) return;
		polling = true;
		setTimeout(function () {
			polling = false;
			if (phase !== 'idle' || !st || !st.available || !st.can_install) return;
			fetch('/api/update', { cache: 'no-store', headers: { 'X-Seeding-App': '1' } })
				.then(function (r) { return r.json(); })
				.then(function (b) { st.busy = !!b.busy; st.updating = b.updating || null; render(); })
				.catch(function () { poll(); });
		}, POLL_MS);
	}

	function openDialog() {
		if (btn.disabled || dlg.open) return;
		dlg.querySelector('h2').textContent = 'Update to ' + v(st.latest) + '?';
		dlg.showModal();
		dlg.querySelector('.go').focus();
	}

	function install() {
		phase = 'downloading';
		render();
		return post('/api/update/install', { version: st.latest }).then(function (res) {
			if (res.ok) phase = 'installing';
			else { phase = 'failed'; failReason = res.body.error || 'The update could not be installed.'; }
			render();
		});
	}

	function mount() {
		var bar = window.Account && window.Account.bar && window.Account.bar();
		if (!bar || area) return;
		area = el('span', 'updateArea', 'update');
		area.hidden = true;
		text = el('span', 'updateStatus', 'update-text');
		text.setAttribute('role', 'status');
		text.setAttribute('aria-live', 'polite');
		text.setAttribute('aria-atomic', 'true');
		btn = el('button', 'updateBtn', 'update-go');
		btn.type = 'button'; btn.textContent = 'Update'; btn.hidden = true;
		retry = el('button', 'updateRetry', 'update-retry');
		retry.type = 'button'; retry.textContent = 'Retry'; retry.hidden = true;
		link = el('a', 'updateLink', 'update-link');
		link.target = '_blank'; link.rel = 'noopener'; link.hidden = true;
		area.appendChild(text); area.appendChild(btn); area.appendChild(retry); area.appendChild(link);
		bar.appendChild(area);

		dlg = el('dialog', 'updateDialog', 'account-dialog');
		dlg.setAttribute('aria-labelledby', 'updateDialogTitle');
		dlg.innerHTML = '<form method="dialog" class="account-form">'
			+ '<h2 id="updateDialogTitle"></h2>'
			+ '<p class="dim">Seeding Ops will close, install the update, and reopen. Your tiers, tournaments and start.gg connection are kept.</p>'
			+ '<div class="actions"><button type="button" class="go">Update</button><button type="button" class="plain cancel">Cancel</button></div>'
			+ '</form>';
		document.body.appendChild(dlg);

		btn.addEventListener('click', openDialog);
		retry.addEventListener('click', install);
		dlg.querySelector('.go').addEventListener('click', function () { var p = install(); dlg.close(); return p; });
		dlg.querySelector('.cancel').addEventListener('click', function () { dlg.close(); });
		// Cancel, Esc or the backdrop: focus goes back to Update.
		dlg.addEventListener('close', function () { if (phase === 'idle' && !btn.hidden) btn.focus(); });

		return post('/api/update/check').then(take);
	}

	window.UpdateBar = { state: function () { return st; } };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
