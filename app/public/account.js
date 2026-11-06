/*
	app/public/account.js — who is signed in, top left on every page (Noah, 2026-11-05).

	A slim bar at the top of the page: the start.gg profile picture (or initials), the gamer tag, and
	"Change…", which opens a small dialog to paste another personal API token. The token is the
	auth: locally stored, never sent to the page. With no token, or one start.gg rejects, the bar says
	"Not connected" and the same dialog connects. Reads GET /api/token; posts to POST /api/token.
*/
(function () {
	'use strict';
	if (window.Account) return;
	var bar, dlg, state = null;

	var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
	var initials = function (tag) { var t = String(tag || '?').replace(/[^a-z0-9]/gi, ''); return (t.slice(0, 2) || '?').toUpperCase(); };

	function render() {
		if (!bar) return;
		var who = bar.querySelector('.who');
		bar.classList.toggle('off', !!state && !state.ok);   // red while nobody is signed in (Noah, 2026-11-05)
		if (!state) { who.innerHTML = '<span class="avatar">…</span><span class="name dim">start.gg…</span>'; return; }
		if (state.ok) {
			var avatar = state.image ? '<img class="avatar" src="' + esc(state.image) + '" alt="">' : '<span class="avatar">' + esc(initials(state.as)) + '</span>';
			var name = (state.prefix ? '<span class="prefix">' + esc(state.prefix) + ' | </span>' : '') + esc(state.as);
			who.innerHTML = avatar + '<span class="name" title="Signed in to start.gg with your API token' + (state.env_wins ? ' (from the STARTGG_TOKEN environment variable)' : '') + '">' + name + '</span>';
			bar.querySelector('.change').textContent = 'Change…';
		} else {
			who.innerHTML = '<span class="avatar off">!</span><span class="name dim">' + (state.kind === 'missing' ? 'Not connected to start.gg' : 'start.gg rejected the saved token') + '</span>';
			bar.querySelector('.change').textContent = 'Connect…';
		}
	}

	function load(check) {
		return fetch('/api/token' + (check ? '?check=1' : ''), { cache: 'no-store' })
			.then(function (r) { return r.json(); })
			.then(function (st) { state = st; render(); return st; })
			.catch(function () { state = { ok: false, kind: 'network' }; render(); });
	}

	function mount() {
		if (bar) return;
		bar = document.createElement('div');
		bar.id = 'accountBar';
		bar.innerHTML = '<span class="who"></span><button type="button" class="change" title="Use a different start.gg account: paste another personal API token">Change…</button>';
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
		bar.querySelector('.change').addEventListener('click', function () { dlg.querySelector('.status').textContent = ''; dlg.showModal(); dlg.querySelector('#accountToken').focus(); });
		dlg.querySelector('.cancel').addEventListener('click', function () { dlg.close(); });
		dlg.querySelector('.save').addEventListener('click', save);
		dlg.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); save(); });
		render();
		load(false);
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
				load(true).then(function () { setTimeout(function () { dlg.close(); if (window.Account.onChange) window.Account.onChange(state); }, res.body.env_wins ? 4000 : 700); });
			});
	}

	window.Account = { reload: function () { return load(true); }, state: function () { return state; }, onChange: null, open: function () { bar.querySelector('.change').click(); } };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
