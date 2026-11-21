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
			// Nothing is lost silently (PRODUCT.md principle 4; Amendment A4, UX-30): a failed Dismiss says so
			// in the notice's live region, and the button works again.
			.catch(function () {
				b.disabled = false;
				var n = b.closest('.data-notice');
				var m = n && n.querySelector('.notice-msg');
				if (m) m.textContent = 'Couldn’t dismiss. Try again.';
			});
	});
})();
