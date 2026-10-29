/*
	app/public/theme.js — light / dark theme, with a switch that is always on screen.

	Loaded in <head> on every page so the theme is applied before first paint (no flash).
	The choice lives in localStorage ('seeding:theme' = 'light' | 'dark'); with nothing saved, the
	OS preference decides (app.css's prefers-color-scheme rule), and the switch shows that state.
	Per browser, like pins and the compare pair. A click cross-fades (html.theme-fade, app.css)
	rather than snapping.
*/
(function () {
	'use strict';
	var KEY = 'seeding:theme';
	var FADE_MS = 320;
	var root = document.documentElement;

	var SUN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
		+ '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
	var MOON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">'
		+ '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

	function saved() {
		try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; }
	}
	function osDark() {
		return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
	}
	function current() { return saved() || (osDark() ? 'dark' : 'light'); }
	function apply(theme) {
		if (theme) root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
	}
	var fadeTimer = null;
	function fade() {
		root.classList.add('theme-fade');
		clearTimeout(fadeTimer);
		fadeTimer = setTimeout(function () { root.classList.remove('theme-fade'); }, FADE_MS);
	}

	// Before paint, no fade.
	apply(saved());

	function render() {
		var sw = document.querySelector('.theme-switch');
		if (!sw) {
			sw = document.createElement('button');
			sw.type = 'button';
			sw.className = 'theme-switch';
			sw.setAttribute('role', 'switch');
			sw.innerHTML = '<span class="icon sun">' + SUN + '</span><span class="track"><span class="knob"></span></span><span class="icon moon">' + MOON + '</span>';
			sw.addEventListener('click', function () {
				var next = current() === 'dark' ? 'light' : 'dark';
				try { localStorage.setItem(KEY, next); } catch (e) { /* no storage: the choice lasts this page */ }
				fade();
				apply(next);
				update(sw);
			});
			document.body.appendChild(sw);
		}
		update(sw);
	}
	function update(sw) {
		var dark = current() === 'dark';
		sw.setAttribute('aria-checked', dark ? 'true' : 'false');
		sw.setAttribute('aria-label', 'Dark mode');
		sw.title = dark ? 'Dark mode. Click for light.' : 'Light mode. Click for dark.';
	}

	// Follow the OS only while no explicit choice is saved.
	if (window.matchMedia) {
		try {
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
				if (!saved()) { fade(); apply(null); var sw = document.querySelector('.theme-switch'); if (sw) update(sw); }
			});
		} catch (e) { /* older engines */ }
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
	else render();
})();
