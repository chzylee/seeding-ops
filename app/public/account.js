/*
	app/public/account.js — who is signed in, top left on every page (Noah, 2026-11-05).

	A slim bar at the top of the page: the start.gg profile picture (or initials), the gamer tag, and
	"Change…", which opens a small dialog to paste another personal API token. The token is the
	auth: locally stored, never sent to the page. With no token, or one start.gg rejects, the bar says
	so in red and the same dialog opens by itself, once. When start.gg simply could not be reached
	(offline, rate limited, down) the token may be fine: the bar says "start.gg could not be reached"
	with a Retry, and nobody is asked to paste a new key. Reads GET /api/token; posts to POST /api/token.
*/
(function () {
	'use strict';
	if (window.Account) return;
	var bar, dlg, state = null, opened = false;   // the dialog opens once by itself when nobody is signed in

	var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
	var initials = function (tag) { var t = String(tag || '?').replace(/[^a-z0-9]/gi, ''); return (t.slice(0, 2) || '?').toUpperCase(); };
	// 'ok' | 'missing' | 'rejected' | 'unreachable'. Older servers sent only `kind`.
	var stateOf = function (st) { return st.ok ? 'ok' : st.state || (st.kind === 'missing' ? 'missing' : st.kind === 'bad-token' ? 'rejected' : 'unreachable'); };
	var needsKey = function (st) { var s = stateOf(st); return s === 'missing' || s === 'rejected'; };

	function render() {
		if (!bar) return;
		var who = bar.querySelector('.who');
		var s = state ? stateOf(state) : null;
		bar.classList.toggle('off', s === 'missing' || s === 'rejected');   // red while nobody is signed in (Noah, 2026-11-05)
		bar.classList.toggle('warn', s === 'unreachable');
		bar.querySelector('.retry').hidden = s !== 'unreachable';
		if (!state) { who.innerHTML = '<span class="avatar">…</span><span class="name dim">start.gg…</span>'; return; }
		if (state.ok) {
			var avatar = state.image ? '<img class="avatar" src="' + esc(state.image) + '" alt="">' : '<span class="avatar">' + esc(initials(state.as)) + '</span>';
			var name = (state.prefix ? '<span class="prefix">' + esc(state.prefix) + ' | </span>' : '') + esc(state.as);
			who.innerHTML = avatar + '<span class="name" title="Signed in to start.gg with your API token' + (state.env_wins ? ' (from the STARTGG_TOKEN environment variable)' : '') + '">' + name + '</span>';
			bar.querySelector('.change').textContent = 'Change…';
		} else if (s === 'unreachable') {
			who.innerHTML = '<span class="avatar off">!</span><span class="name dim" title="' + esc(state.message || '') + '">start.gg could not be reached</span>';
			bar.querySelector('.change').textContent = 'Change…';
		} else {
			who.innerHTML = '<span class="avatar off">!</span><span class="name dim">' + (s === 'missing' ? 'Not connected to start.gg' : 'start.gg rejected the saved token') + '</span>';
			bar.querySelector('.change').textContent = 'Connect…';
		}
	}

	function load(check) {
		return fetch('/api/token' + (check ? '?check=1' : ''), { cache: 'no-store', headers: { 'X-Seeding-App': '1' } })
			.then(function (r) { return r.json(); })
			.then(function (st) { state = st; render(); if (needsKey(st) && !opened) { opened = true; openDialog(); } return st; })
			// The app's own server did not answer: nothing to do with the token, so no dialog.
			.catch(function () { state = { ok: false, state: 'unreachable', kind: 'network', message: 'The app server did not answer.' }; render(); });
	}

	function mount() {
		if (bar) return;
		bar = document.createElement('div');
		bar.id = 'accountBar';
		bar.innerHTML = '<span class="who"></span><button type="button" class="retry" hidden title="Ask start.gg again">Retry</button><button type="button" class="change" title="Use a different start.gg account: paste another personal API token">Change…</button>';
		document.body.insertBefore(bar, document.body.firstChild);
		dlg = document.createElement('dialog');
		dlg.id = 'accountDialog';
		dlg.className = 'account-dialog';
		dlg.innerHTML = '<form method="dialog" class="account-form">'
			+ '<h2>start.gg account</h2>'
			+ '<p class="dim">Paste your start.gg API key. <a href="https://start.gg/admin/profile/developer" target="_blank" rel="noopener">Get one here.</a> The key never leaves your machine.</p>'
			+ '<input id="accountToken" type="password" autocomplete="off" spellcheck="false" placeholder="API key" required>'
			+ '<div class="actions"><button type="button" class="save">Save</button><button type="button" class="plain cancel">Cancel</button><span class="status" role="status" aria-live="polite"></span></div>'
			+ '</form>';
		document.body.appendChild(dlg);
		bar.querySelector('.change').addEventListener('click', openDialog);
		bar.querySelector('.retry').addEventListener('click', function () { load(true); });
		dlg.querySelector('.cancel').addEventListener('click', function () { dlg.close(); });
		dlg.querySelector('.save').addEventListener('click', save);
		dlg.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); save(); });
		render();
		load(false);
	}

	function openDialog() {
		if (dlg.open) return;
		dlg.querySelector('h2').textContent = state && state.ok ? 'start.gg account' : 'Connect to start.gg';
		dlg.querySelector('.status').textContent = '';
		dlg.showModal();
		dlg.querySelector('#accountToken').focus();
	}

	function save() {
		var box = dlg.querySelector('#accountToken'), msg = dlg.querySelector('.status'), btn = dlg.querySelector('.save');
		btn.disabled = true; msg.classList.remove('err'); msg.textContent = 'Saving…';
		fetch('/api/token', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: box.value }) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
			.catch(function (e) { return { ok: false, body: { error: e.message } }; })
			.then(function (res) {
				btn.disabled = false;
				if (!res.ok) { msg.textContent = res.body.error || 'Could not save it.'; msg.classList.add('err'); return; }
				box.value = '';
				msg.textContent = 'Saved. Connected as ' + res.body.as + '.' + (res.body.note ? ' ' + res.body.note : '');
				load(true).then(function () { setTimeout(function () { dlg.close(); }, res.body.env_wins ? 4000 : 700); });
			});
	}

	window.Account = { reload: function () { return load(true); }, state: function () { return state; }, open: function () { bar.querySelector('.change').click(); } };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
