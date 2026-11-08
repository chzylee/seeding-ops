/*
	app/public/busy.js — one loading indicator for everything that waits on the server (Noah, 2026-10-30).

	Two sources, one display:
	  1. Requests in flight: window.fetch is wrapped; same-origin calls to /api/ count, except the
	     polls (GET …/status, GET /api/t/<t>, GET …/schedule) which are quick and would flicker.
	  2. Background jobs: a page's status poll calls Busy.job(label, progress) while a job runs and
	     Busy.job(null) when it stops (pull, W-L, schedule, archive, upload resolution).

	The display: a 3 px bar across the top of the page (indeterminate while a request is in flight or a
	job has no progress figure; a growing width when it does) and a small pill at the bottom right with a
	spinner and the label. Nothing else on the page changes; the pages' own status lines keep their text.
*/
(function () {
	'use strict';
	if (window.Busy) return;

	var inflight = 0;
	var job = null;          // { label, done, total } or null
	var bar, pill, label;

	function mount() {
		if (bar) return;
		bar = document.createElement('div'); bar.id = 'busyBar'; bar.setAttribute('aria-hidden', 'true');
		pill = document.createElement('div'); pill.id = 'busyPill'; pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite');
		pill.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="label"></span>';
		label = pill.querySelector('.label');
		document.body.appendChild(bar); document.body.appendChild(pill);
		render();
	}
	function render() {
		if (!bar) return;
		var active = inflight > 0 || !!job;
		document.documentElement.classList.toggle('is-busy', active);
		bar.hidden = !active; pill.hidden = !active;
		if (!active) return;
		var det = job && job.total > 0 && typeof job.done === 'number';
		bar.classList.toggle('determinate', !!det);
		bar.style.width = det ? Math.max(2, Math.round(100 * job.done / job.total)) + '%' : '';
		var text = (job && job.label) || pendingLabel || 'Working…';
		if (det) text += ' ' + job.done + ' / ' + job.total;
		label.textContent = text;
	}

	// Labels for requests, by path; the pages' own status lines carry the detail.
	var pendingLabel = '';
	function labelFor(url, init) {
		var method = (init && init.method || 'GET').toUpperCase();
		if (/\/api\/tournaments$/.test(url)) return 'Asking start.gg for the tournament’s events…';
		if (/\/api\/uploads$/.test(url)) return 'Checking the list…';
		if (/\/refresh(\?|$)/.test(url)) return 'Starting the pull…';
		if (/\/review$/.test(url) || /\/player\/\d+$/.test(url)) return 'Saving…';
		if (/\/lifecycle$/.test(url)) return 'Updating…';
		if (/\/events$/.test(url)) return 'Saving events…';
		if (/\/push\/[^/]+\/dry-run$/.test(url)) return 'Reading the seeding from start.gg…';
		if (/\/push\/[^/]+\/post$/.test(url)) return 'Posting the seeding to start.gg…';
		if (/\/data(\?|$)/.test(url)) return 'Loading…';
		if (/\/export\.csv|\/seeds\.csv/.test(url)) return 'Preparing the file…';
		return method === 'GET' ? 'Loading…' : 'Working…';
	}
	// Quick polls never show the indicator.
	function isPoll(url, init) {
		var method = (init && init.method || 'GET').toUpperCase();
		if (method !== 'GET') return false;
		return /\/status(\?|$)/.test(url) || /\/api\/t\/[^/]+(\?|$)/.test(url) || /\/schedule(\?|$)/.test(url) || /\/api\/schedule\//.test(url);
	}

	// The update check runs silently on every page (update.js): the bar says what it found, nothing else.
	function isUpdateCheck(url, init) {
		var method = (init && init.method || 'GET').toUpperCase();
		return (method === 'GET' && /\/api\/update(\?|$)/.test(url)) || (method === 'POST' && /\/api\/update\/check(\?|$)/.test(url));
	}

	var realFetch = window.fetch.bind(window);
	window.fetch = function (input, init) {
		var url = typeof input === 'string' ? input : (input && input.url) || '';
		var ours = /^\/api\//.test(url) || (/^https?:\/\//.test(url) && url.indexOf(location.origin + '/api/') === 0);
		if (!ours || isPoll(url, init) || isUpdateCheck(url, init)) return realFetch(input, init);
		inflight++; pendingLabel = labelFor(url, init); render();
		var done = function () { inflight = Math.max(0, inflight - 1); if (!inflight) pendingLabel = ''; render(); };
		return realFetch(input, init).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
	};

	window.Busy = {
		// Busy.job('Pulling…') · Busy.job('W-L', { done, total }) · Busy.job(null)
		job: function (text, progress) {
			job = text ? { label: text, done: progress && progress.done, total: progress && progress.total } : null;
			render();
		},
		active: function () { return inflight > 0 || !!job; },
	};

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
