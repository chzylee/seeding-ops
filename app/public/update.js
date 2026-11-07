/*
	app/public/update.js — "Check for updates" on the home page (Noah, 2026-11-06).

	Check asks the app's server, which asks GitHub for the newest release's latest.json
	(lib/update.js). Up to date: says so. Newer: "Version X is available" and, in the installed app,
	Install. Install asks once, then the server downloads the installer, checks its signature, starts
	it and closes the app; the installer updates in place (your data is kept, it lives in your own data
	folder) and opens the app again. Where installing from here is not possible (a checkout, the
	portable ZIP, a build without a signing key) the page says why and links the release page.
*/
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var btn = $('updateCheck'), install = $('updateInstall'), link = $('updateLink'), msg = $('updateMsg');
	if (!btn) return;
	var H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
	var latest = null;

	function say(text, err) { msg.textContent = text || ''; msg.classList.toggle('err', !!err); }
	function post(url, body) {
		return fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body || {}) })
			.then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
			.catch(function (e) { return { ok: false, status: 0, body: { error: 'The app did not answer (' + e.message + ').' } }; });
	}
	function showLink(st) {
		link.hidden = !st.releases_page;
		if (st.releases_page) link.href = st.releases_page;
	}

	btn.addEventListener('click', function () {
		btn.disabled = true; install.hidden = true; link.hidden = true; latest = null;
		say('Checking for updates…');
		return post('/api/update/check').then(function (res) {
			btn.disabled = false;
			var st = res.body || {};
			if (!res.ok || st.ok === false) {
				say(st.error || 'Could not check for updates.', st.kind !== 'no-release');
				if (st.releases_page) showLink(st);
				return;
			}
			if (!st.available) { say('You have the latest version (' + st.current + ').'); return; }
			latest = st.latest;
			if (st.can_install) {
				say('Version ' + st.latest + ' is available (you have ' + st.current + ').');
				install.textContent = 'Install ' + st.latest;
				install.hidden = false;
			} else {
				say('Version ' + st.latest + ' is available (you have ' + st.current + '). ' + (st.reason || ''));
				showLink(st);
			}
		});
	});

	install.addEventListener('click', function () {
		if (!latest) return;
		if (!window.confirm('Install version ' + latest + ' now?\n\nThe app closes, updates, and opens again by itself. Your tiers, tournaments and start.gg key are kept.')) return;
		install.disabled = true; btn.disabled = true;
		say('Downloading version ' + latest + ' and checking its signature…');
		return post('/api/update/install', { version: latest }).then(function (res) {
			if (!res.ok) {
				install.disabled = false; btn.disabled = false;
				say(res.body.error || 'The update could not be installed.', true);
				return;
			}
			say('Installing ' + res.body.installing + '. The app will close and open again in a moment. If it has not reopened within a minute, open it yourself: it will say what happened.');
		});
	});
})();
