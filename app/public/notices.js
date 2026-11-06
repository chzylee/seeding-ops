/*
	app/public/notices.js — Dismiss on the home page's data notices (lib/data-dir.js; app/server.js
	noticesHtml). Only lasting notices have the button; the others go away once their cause does.
*/
(function () {
	'use strict';
	var box = document.querySelector('section.data-notices');
	if (!box) return;
	box.addEventListener('click', function (ev) {
		var b = ev.target && ev.target.closest && ev.target.closest('[data-dismiss]');
		if (!b) return;
		b.disabled = true;
		return fetch('/api/notices/dismiss', { method: 'POST', headers: { 'X-Seeding-App': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.getAttribute('data-dismiss') }) })
			.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); var n = b.closest('.data-notice'); if (n) n.remove(); })
			.catch(function () { b.disabled = false; });
	});
})();
