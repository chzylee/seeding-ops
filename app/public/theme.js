/*
	app/public/theme.js — light / dark theme, with a switch that is always on screen.

	Loaded in <head> on every page so the theme is applied before first paint (no flash).
	The choice lives in localStorage ('seeding:theme' = 'light' | 'dark'); with nothing saved, the
	OS preference decides (app.css's prefers-color-scheme rule), and the switch shows that state.
	Per browser, like pins and the compare pair.
*/
(function () {
	'use strict';
	var KEY = 'seeding:theme';
	var root = document.documentElement;

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

	// Before paint.
	apply(saved());

	function render() {
		var sw = document.querySelector('.theme-switch');
		if (!sw) {
			sw = document.createElement('button');
			sw.type = 'button';
			sw.className = 'theme-switch';
			sw.setAttribute('role', 'switch');
			sw.innerHTML = '<span class="track"><span class="knob"></span></span><span class="label"></span>';
			sw.addEventListener('click', function () {
				var next = current() === 'dark' ? 'light' : 'dark';
				try { localStorage.setItem(KEY, next); } catch (e) { /* no storage: the choice lasts this page */ }
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
		sw.title = dark ? 'Dark mode on. Click for light.' : 'Light mode. Click for dark.';
		sw.querySelector('.label').textContent = dark ? 'Dark' : 'Light';
	}

	// Follow the OS only while no explicit choice is saved.
	if (window.matchMedia) {
		try {
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
				if (!saved()) { apply(null); var sw = document.querySelector('.theme-switch'); if (sw) update(sw); }
			});
		} catch (e) { /* older engines */ }
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
	else render();
})();
