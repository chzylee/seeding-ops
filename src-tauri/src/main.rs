// Prevent a console window from opening alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/*
	The desktop shell, and deliberately almost nothing else.

	Everything this app actually does lives in app/server.js and the pages it
	serves. The server is the app, and this is a window pointed at it plus a
	process to babysit.

	Keeping the shell this thin is what makes CI-only builds practical: the Rust
	here changes approximately never, so not having a local Rust toolchain costs
	nothing day to day. Anything that feels like a feature belongs on the
	JavaScript side, where it can be developed with `npm start` and a browser.

	Copied from mbaacc-stream-setup's shell (the same arrangement, proven on a
	stream machine); only the names, the port and the window size differ.
*/

use std::net::{Shutdown, SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Must match the server's default port (app/server.js DEFAULT_PORT). Hardcoded
/// rather than negotiated on purpose: bookmarks and the README embed it.
const PORT: u16 = 8765;

/// How long to wait for the server to bind before giving up and showing the
/// failure page. Generous -- a cold start behind antivirus can be slow.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);

/// Handle to the sidecar so it can be killed on exit. Without this the server
/// outlives the window, keeps the port bound, and the next launch fails with
/// "port already in use" for no visible reason.
struct ServerProcess(Mutex<Option<CommandChild>>);

/// True once something is accepting connections on the port.
fn port_is_up(addr: &SocketAddr) -> bool {
	match TcpStream::connect_timeout(addr, Duration::from_millis(250)) {
		Ok(stream) => {
			let _ = stream.shutdown(Shutdown::Both);
			true
		}
		Err(_) => false,
	}
}

fn main() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.manage(ServerProcess(Mutex::new(None)))
		.setup(|app| {
			let handle = app.handle().clone();

			/*
				The window is created immediately on a local "starting" page
				rather than after the server is up. If the server never binds,
				an app that waited would show nothing at all -- no window, no
				error, just a taskbar icon that does nothing. Better to have a
				window that can explain itself.
			*/
			let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
				.title("Seeding Ops")
				// The seeding table is wide (frozen columns plus majors plus
				// series); start large enough that nothing needs a sideways
				// scroll on a 1080p screen.
				.inner_size(1440.0, 900.0)
				.min_inner_size(900.0, 500.0)
				.resizable(true)
				.build()?;

			/*
				Find the server binary. In a checkout the pair is laid out with the
				server exe inside app/, next to the code it runs, so the folder
				shows a single executable; an installed copy keeps Tauri's flattened
				layout with the sidecar beside this exe. Probe both, in that order.

				A missing binary is deliberately not fatal: the window is already
				up, the startup poll below times out onto the explanation page, and
				a server started some other way (npm start) still gets adopted.
			*/
			let server_name = if cfg!(windows) { "seeding-server.exe" } else { "seeding-server" };
			let found = std::env::current_exe()
				.ok()
				.and_then(|p| p.parent().map(|d| d.to_path_buf()))
				.and_then(|dir| {
					[dir.join("app").join(server_name), dir.join(server_name)]
						.into_iter()
						.find(|p| p.exists())
				});
			if let Some(bin) = found {
				let child = app
					.shell()
					.command(bin)
					// Tell the server it is running inside the app window, so it
					// must not also open a browser tab -- one page, not two.
					.envs(std::collections::HashMap::from([(
						"SEEDING_EMBEDDED".to_string(),
						"1".to_string(),
					)]))
					.spawn()
					.map(|(_rx, child)| child)?;
				app.state::<ServerProcess>().0.lock().unwrap().replace(child);
			}

			// Poll off the main thread; blocking it would freeze the window we
			// just created.
			std::thread::spawn(move || {
				let addr: SocketAddr = ([127, 0, 0, 1], PORT).into();
				let deadline = Instant::now() + STARTUP_TIMEOUT;

				while Instant::now() < deadline {
					if port_is_up(&addr) {
						let url = format!("http://127.0.0.1:{PORT}/");
						if let Some(w) = handle.get_webview_window("main") {
							if let Ok(parsed) = url.parse() {
								let _ = w.navigate(parsed);
							}
						}
						return;
					}
					std::thread::sleep(Duration::from_millis(150));
				}

				// Timed out. The starting page listens for this and swaps to an
				// explanation instead of spinning forever.
				if let Some(w) = handle.get_webview_window("main") {
					let _ = w.emit("server-failed", PORT);
				}
			});

			let _ = window;
			Ok(())
		})
		.build(tauri::generate_context!())
		.expect("failed to start Seeding Ops")
		.run(|app, event| {
			// Kill the server on the way out, however we got here.
			if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
				if let Some(child) = app.state::<ServerProcess>().0.lock().unwrap().take() {
					let _ = child.kill();
				}
			}
		});
}
