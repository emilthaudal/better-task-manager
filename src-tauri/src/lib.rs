use tauri::Manager;

// Release builds don't ship a bundled frontend (frontendDist is a dummy dir);
// point the window at the real Next.js server instead. Overridable at runtime
// so a packaged app can be pointed at a deployed URL without a rebuild.
const DEFAULT_APP_URL: &str = "http://localhost:3000/app";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        if let Some(window) = app.get_webview_window("main") {
          if let Ok(factor) = window.scale_factor() {
            println!("[debug] window scale_factor = {factor}");
          }
          if let Ok(monitor) = window.current_monitor() {
            if let Some(m) = monitor {
              println!("[debug] monitor scale_factor = {}", m.scale_factor());
            }
          }
        }
      } else {
        let url = std::env::var("APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
        if let Some(window) = app.get_webview_window("main") {
          window.navigate(url.parse().expect("APP_URL must be a valid URL"))?;
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
