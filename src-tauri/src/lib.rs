use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::{thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize};
use walkdir::WalkDir;

const CONFIG_DIR: &str = ".local/share/control-strip";
const CONFIG_FILE: &str = "config.yaml";
const DEFAULT_WINDOW_LEFT: i32 = 71;
const DEFAULT_WINDOW_WIDTH: u32 = 600;
const DEFAULT_WINDOW_HEIGHT: u32 = 200;
const DEFAULT_SNAP_BACK_SECONDS: u64 = 10;
const DEFAULT_SCREEN_CORNER_RADIUS: u32 = 18;
const DEFAULT_SCREEN_CORNER_COLOR: &str = "#000000";
const DEFAULT_SCREEN_CORNER_POSITION: &str = "bottom-left";
const DEFAULT_CONFIG: &str = r##"# ControlStrip Simulator config
# Window placement is native Tauri window geometry in physical screen pixels.
window:
  left: 71
  width: 600
  height: 200

screenCorner:
  enabled: true
  position: bottom-left
  radius: 18
  color: "#000000"

# Optional strip sizing behavior. Omit visible_icons to show all panes and expand
# as new panes appear. Set it to snap back to that many icons after tail dragging.
# strip:
#   visible_icons: 3
#   snap_back_seconds: 10
#
# Add pinned Linux .desktop files here.
# Most apps only need desktop_file. Use match only when automatic matching fails.
#
# pinned_apps:
#   - desktop_file: "/usr/share/applications/firefox.desktop"
#   - desktop_file: "/usr/share/applications/chromium.desktop"
#     match:
#       wm_class: "chromium"
#       title_contains: "Weather"
pinned_apps: []
"##;

#[derive(Debug, Deserialize, Serialize)]
#[serde(default)]
struct ControlStripConfig {
    window: WindowPlacementConfig,
    strip: StripBehaviorConfig,
    #[serde(rename = "screenCorner")]
    screen_corner: ScreenCornerConfig,
    #[serde(default)]
    window_filters: WindowFiltersConfig,
    #[serde(default)]
    window_filters: WindowFiltersConfig,
    #[serde(default)]
    pinned_apps: Vec<PinnedAppConfig>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(default)]
struct WindowPlacementConfig {
    left: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(default)]
struct StripBehaviorConfig {
    visible_icons: Option<u32>,
    snap_back_seconds: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default)]
struct ScreenCornerConfig {
    enabled: bool,
    position: String,
    radius: u32,
    color: String,
}

impl Default for ControlStripConfig {
    fn default() -> Self {
        Self {
            window: WindowPlacementConfig::default(),
            strip: StripBehaviorConfig::default(),
            screen_corner: ScreenCornerConfig::default(),
            window_filters: WindowFiltersConfig::default(),
            pinned_apps: Vec::new(),
        }
    }
}

impl Default for WindowPlacementConfig {
    fn default() -> Self {
        Self {
            left: DEFAULT_WINDOW_LEFT,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

impl Default for StripBehaviorConfig {
    fn default() -> Self {
        Self {
            visible_icons: None,
            snap_back_seconds: DEFAULT_SNAP_BACK_SECONDS,
        }
    }
}

impl Default for ScreenCornerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            position: DEFAULT_SCREEN_CORNER_POSITION.to_string(),
            radius: DEFAULT_SCREEN_CORNER_RADIUS,
            color: DEFAULT_SCREEN_CORNER_COLOR.to_string(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
struct WindowFiltersConfig {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    exclude_titles: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    exclude_wm_classes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct PinnedAppConfig {
    desktop_file: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(default)]
    r#match: Option<WindowMatch>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct WindowMatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    wm_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title_contains: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
struct ParsedDesktopFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    startup_wm_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    no_display: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comment: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlStripModel {
    items: Vec<ControlStripItem>,
    strip: StripBehavior,
    screen_corner: ScreenCorner,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StripBehavior {
    #[serde(skip_serializing_if = "Option::is_none")]
    visible_icons: Option<u32>,
    snap_back_seconds: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenCorner {
    enabled: bool,
    position: String,
    radius: u32,
    color: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlStripItem {
    id: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    desktop_file: String,
    is_pinned: bool,
    is_open: bool,
    windows: Vec<ControlStripWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    r#match: Option<WindowMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlStripWindow {
    id: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_active: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunningWindowsResult {
    windows: Vec<RunningWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct RunningWindow {
    id: String,
    title: String,
    wm_class_instance: String,
    wm_class: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<u32>,
}

#[tauri::command]
fn get_control_strip_model() -> Result<ControlStripModel, String> {
    let config_path = ensure_config_file()?;
    let config = load_config(&config_path)?;
    let items: Vec<ControlStripItem> = config
        .pinned_apps
        .iter()
        .map(build_control_strip_item)
        .collect();
    eprintln!("Control Strip: loaded {} pinned app(s)", items.len());
    for item in &items {
        let match_hint = item
            .r#match
            .as_ref()
            .and_then(|match_info| match_info.wm_class.as_deref())
            .unwrap_or("");
        eprintln!(
            "Control Strip: pinned app id={} label={} match.wm_class={}",
            item.id, item.label, match_hint
        );
    }

    Ok(ControlStripModel {
        items,
        strip: StripBehavior {
            visible_icons: config.strip.visible_icons,
            snap_back_seconds: config.strip.snap_back_seconds,
        },
        screen_corner: ScreenCorner {
            enabled: config.screen_corner.enabled,
            position: config.screen_corner.position,
            radius: config.screen_corner.radius,
            color: config.screen_corner.color,
        },
    })
}

#[tauri::command]
fn get_running_windows() -> RunningWindowsResult {
    match current_running_windows() {
        Ok(windows) => RunningWindowsResult {
            windows,
            error: None,
        },
        Err(error) => {
            eprintln!("Control Strip: {error}");
            RunningWindowsResult {
                windows: Vec::new(),
                error: Some(error),
            }
        }
    }
}

#[tauri::command]
fn launch_pinned_app(app_id: String) -> Result<(), String> {
    let config_path = ensure_config_file()?;
    let config = load_config(&config_path)?;
    let pinned_app = config
        .pinned_apps
        .iter()
        .find(|candidate| sanitize_id(&expand_home(&candidate.desktop_file)) == app_id)
        .ok_or_else(|| format!("No pinned app found for id {app_id}"))?;
    let desktop_path = validate_launch_desktop_file(pinned_app)?;
    let desktop_file = desktop_path
        .to_str()
        .ok_or_else(|| format!("Desktop file path is not valid UTF-8: {}", desktop_path.display()))?;

    launch_desktop_file(desktop_file)
}

#[tauri::command]
fn set_app_pinned(desktop_file: String, pinned: bool, wm_class: Option<String>) -> Result<(), String> {
    let config_path = ensure_config_file()?;
    let mut config = load_config(&config_path)?;
    let expanded = expand_home(&desktop_file);
    let canonical = fs::canonicalize(&expanded)
        .map_err(|error| format!("Failed to resolve {}: {error}", expanded.display()))?;
    if canonical.extension().and_then(|value| value.to_str()) != Some("desktop") {
        return Err(format!("Pinned application must be a .desktop file: {}", canonical.display()));
    }
    let canonical_string = canonical.display().to_string();
    if pinned {
        if !config.pinned_apps.iter().any(|item| expand_home(&item.desktop_file) == canonical) {
            config.pinned_apps.push(PinnedAppConfig {
                desktop_file: canonical_string,
                icon: None,
                r#match: wm_class.filter(|value| !value.trim().is_empty()).map(|value| WindowMatch {
                    wm_class: Some(value),
                    title_contains: None,
                }),
            });
        }
    } else {
        config.pinned_apps.retain(|item| expand_home(&item.desktop_file) != canonical);
    }
    let yaml = serde_yaml::to_string(&config)
        .map_err(|error| format!("Failed to serialize {}: {error}", config_path.display()))?;
    fs::write(&config_path, yaml)
        .map_err(|error| format!("Failed to write {}: {error}", config_path.display()))
}

#[tauri::command]
fn ignore_wm_class(wm_class: String) -> Result<(), String> {
    let normalized = wm_class.trim();
    if normalized.is_empty() {
        return Err("Window class is empty".to_string());
    }
    let config_path = ensure_config_file()?;
    let mut config = load_config(&config_path)?;
    if !config.window_filters.exclude_wm_classes.iter().any(|value| value.eq_ignore_ascii_case(normalized)) {
        config.window_filters.exclude_wm_classes.push(normalized.to_string());
    }
    let yaml = serde_yaml::to_string(&config)
        .map_err(|error| format!("Failed to serialize {}: {error}", config_path.display()))?;
    fs::write(&config_path, yaml)
        .map_err(|error| format!("Failed to write {}: {error}", config_path.display()))
}

#[tauri::command]
fn resolve_desktop_file(wm_class: String) -> Result<String, String> {
    let hint = wm_class.trim().to_ascii_lowercase();
    if hint.is_empty() {
        return Err("Window class is empty".to_string());
    }
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/applications"));
    }
    roots.push(PathBuf::from("/usr/share/applications"));
    for root in roots {
        if !root.exists() { continue; }
        for entry in WalkDir::new(root).follow_links(false).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() || entry.path().extension().and_then(|value| value.to_str()) != Some("desktop") { continue; }
            let Ok(contents) = fs::read_to_string(entry.path()) else { continue; };
            let desktop = parse_desktop_file(&contents);
            if validate_desktop_file(&desktop).is_some() { continue; }
            let startup = desktop.startup_wm_class.as_deref().unwrap_or("").trim().to_ascii_lowercase();
            let stem = entry.path().file_stem().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
            if startup == hint || stem == hint || startup.contains(&hint) || stem.contains(&hint) {
                return Ok(entry.path().display().to_string());
            }
        }
    }
    Err(format!("No installed .desktop file matched WM_CLASS {wm_class}"))
}

#[tauri::command]
fn focus_app_windows(app_id: String) -> Result<(), String> {
    let windows = current_running_windows()?;
    let window_ids = resolve_focus_window_ids(&app_id, &windows)?;

    if window_ids.is_empty() {
        return Err(format!("No detected windows found for app id {app_id}"));
    }

    for window_id in &window_ids {
        focus_window(window_id)?;
    }

    eprintln!(
        "Control Strip: focused {} window(s) for app {app_id}",
        window_ids.len()
    );
    Ok(())
}

/// Resize the strip window to hug the visible content the webview reports, then
/// re-anchor it to the bottom-left. Without this the fully transparent window keeps
/// its full footprint and swallows clicks meant for the app behind it.
#[tauri::command]
fn resize_strip_window(
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err(format!("Invalid strip content size {width}x{height}"));
    }

    let placement = load_window_placement();
    let scale = window
        .scale_factor()
        .map_err(|error| format!("Failed to read scale factor: {error}"))?;
    // width/height arrive as CSS logical pixels; window geometry is physical pixels.
    let physical_width = ((width * scale).ceil() as i64).clamp(1, u32::MAX as i64) as u32;
    let physical_height = ((height * scale).ceil() as i64).clamp(1, u32::MAX as i64) as u32;

    // Defensive: if the window still carries non-resizable size hints from a stale
    // config, set_size gets clamped by the compositor. Clear them before resizing.
    if let Err(error) = window.set_resizable(true) {
        eprintln!("Control Strip: could not mark window resizable: {error}");
    }

    eprintln!(
        "Control Strip: resize_strip_window css={width:.1}x{height:.1} scale={scale} physical={physical_width}x{physical_height} left={}",
        placement.left
    );

    place_window_bottom_left(&window, placement.left, physical_width, physical_height)
        .map_err(|error| format!("Failed to resize strip window: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let placement = load_window_placement();
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = position_control_strip_window(&window, placement) {
                    eprintln!("Control Strip: could not position window: {error}");
                }
                window.show()?;
                thread::sleep(Duration::from_millis(60));
                if let Err(error) = position_control_strip_window(&window, placement) {
                    eprintln!("Control Strip: could not reapply window position: {error}");
                }
            } else {
                eprintln!("Control Strip: missing main window; could not position window");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_control_strip_model,
            get_running_windows,
            launch_pinned_app,
            set_app_pinned,
            ignore_wm_class,
            resolve_desktop_file,
            focus_app_windows,
            resize_strip_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running ControlStrip Simulator");
}

fn load_window_placement() -> WindowPlacementConfig {
    ensure_config_file()
        .and_then(|config_path| load_config(&config_path))
        .map(|config| config.window)
        .unwrap_or_else(|error| {
            eprintln!("Control Strip: could not load window placement config: {error}");
            WindowPlacementConfig::default()
        })
}

fn position_control_strip_window(
    window: &tauri::WebviewWindow,
    placement: WindowPlacementConfig,
) -> tauri::Result<()> {
    place_window_bottom_left(window, placement.left, placement.width, placement.height)
}

fn place_window_bottom_left(
    window: &tauri::WebviewWindow,
    left: i32,
    width: u32,
    height: u32,
) -> tauri::Result<()> {
    window.set_size(PhysicalSize::new(width, height))?;
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        eprintln!("Control Strip: no current or primary monitor available; keeping default position");
        return Ok(());
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let bottom_y = monitor_position.y + monitor_size.height as i32 - height as i32;
    let left_x = monitor_position.x + left;

    eprintln!(
        "Control Strip: place_window_bottom_left size={width}x{height} monitor_pos=({},{}) monitor_size={}x{} -> pos=({left_x},{bottom_y})",
        monitor_position.x, monitor_position.y, monitor_size.width, monitor_size.height
    );

    window.set_position(PhysicalPosition::new(left_x, bottom_y))
}

fn current_running_windows() -> Result<Vec<RunningWindow>, String> {
    let script_path = window_check_script_path();
    if !script_path.exists() {
        return Err(format!(
            "Window discovery script is missing: {}",
            script_path.display()
        ));
    }

    let output = Command::new("bash")
        .arg(&script_path)
        .output()
        .map_err(|error| format!("Failed to run {} through bash: {error}", script_path.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return if stderr.is_empty() {
            Err(format!(
                "{} exited with status {}",
                script_path.display(),
                output.status
            ))
        } else {
            Err(format!("{} failed: {stderr}", script_path.display()))
        };
    }

    serde_json::from_slice::<Vec<RunningWindow>>(&output.stdout).map_err(|error| {
        let stdout = String::from_utf8_lossy(&output.stdout);
        format!(
            "Failed to parse JSON from {}: {error}. stdout: {stdout}",
            script_path.display()
        )
    })
}

fn resolve_focus_window_ids(app_id: &str, windows: &[RunningWindow]) -> Result<Vec<String>, String> {
    if !is_valid_app_id(app_id) {
        return Err(format!("Invalid app id {app_id}"));
    }

    let config_path = ensure_config_file()?;
    let config = load_config(&config_path)?;
    let mut unmatched_indices = (0..windows.len()).collect::<Vec<_>>();

    for pinned_app in &config.pinned_apps {
        let item = build_control_strip_item(pinned_app);
        let matched_indices = unmatched_indices
            .iter()
            .copied()
            .filter(|index| does_window_match_item(&item, &windows[*index]))
            .collect::<Vec<_>>();

        if item.id == app_id {
            return Ok(matched_indices
                .into_iter()
                .map(|index| windows[index].id.clone())
                .collect());
        }

        unmatched_indices.retain(|index| !matched_indices.contains(index));
    }

    let temporary_group_id = app_id
        .strip_prefix("running:")
        .ok_or_else(|| format!("No pinned or temporary app found for id {app_id}"))?;
    Ok(unmatched_indices
        .into_iter()
        .filter(|index| normalize_temporary_group_id(window_group_key(&windows[*index])) == temporary_group_id)
        .map(|index| windows[index].id.clone())
        .collect())
}

fn focus_window(window_id: &str) -> Result<(), String> {
    if !is_valid_window_id(window_id) {
        return Err(format!("Invalid wmctrl window id {window_id}"));
    }

    match Command::new("wmctrl").args(["-ia", window_id]).output() {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if stderr.is_empty() {
                Err(format!("wmctrl -ia {window_id} failed with status {}", output.status))
            } else {
                Err(format!("wmctrl -ia {window_id} failed: {stderr}"))
            }
        }
        Err(error) => Err(format!("Failed to run wmctrl -ia {window_id}: {error}")),
    }
}

fn window_check_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("scripts/window-check.sh")
}

fn validate_launch_desktop_file(config: &PinnedAppConfig) -> Result<PathBuf, String> {
    let desktop_path = expand_home(&config.desktop_file);
    let desktop_path = fs::canonicalize(&desktop_path)
        .map_err(|error| format!("Failed to resolve {}: {error}", desktop_path.display()))?;

    if !desktop_path.is_file() {
        return Err(format!("Desktop file is not a file: {}", desktop_path.display()));
    }

    if desktop_path.extension().and_then(|extension| extension.to_str()) != Some("desktop") {
        return Err(format!("Desktop file must end in .desktop: {}", desktop_path.display()));
    }

    let contents = fs::read_to_string(&desktop_path)
        .map_err(|error| format!("Failed to read {}: {error}", desktop_path.display()))?;
    let desktop = parse_desktop_file(&contents);

    if let Some(error) = validate_desktop_file(&desktop) {
        return Err(format!("Cannot launch {}: {error}", desktop_path.display()));
    }

    Ok(desktop_path)
}

fn launch_desktop_file(desktop_file: &str) -> Result<(), String> {
    let gio_result = spawn_launcher("gio", &["launch", desktop_file]);
    if gio_result.is_ok() {
        eprintln!("Control Strip: launched {desktop_file} with gio");
        return Ok(());
    }

    let dex_result = spawn_launcher("dex", &[desktop_file]);
    if dex_result.is_ok() {
        eprintln!("Control Strip: launched {desktop_file} with dex");
        return Ok(());
    }

    Err(format!(
        "Failed to launch {desktop_file}. gio: {}; dex: {}",
        gio_result.unwrap_err(),
        dex_result.unwrap_err()
    ))
}

fn spawn_launcher(program: &str, args: &[&str]) -> Result<(), String> {
    match Command::new(program).args(args).spawn() {
        Ok(_child) => Ok(()),
        Err(error) => Err(format!("{program} could not be started: {error}")),
    }
}

fn ensure_config_file() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Unable to determine home directory".to_string())?;
    let config_dir = home.join(CONFIG_DIR);
    let config_path = config_dir.join(CONFIG_FILE);

    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Failed to create {}: {error}", config_dir.display()))?;

    if !config_path.exists() {
        fs::write(&config_path, DEFAULT_CONFIG)
            .map_err(|error| format!("Failed to create {}: {error}", config_path.display()))?;
    }

    Ok(config_path)
}

fn load_config(config_path: &Path) -> Result<ControlStripConfig, String> {
    let contents = fs::read_to_string(config_path)
        .map_err(|error| format!("Failed to read {}: {error}", config_path.display()))?;

    serde_yaml::from_str(&contents)
        .map_err(|error| format!("Failed to parse {}: {error}", config_path.display()))
}

fn build_control_strip_item(config: &PinnedAppConfig) -> ControlStripItem {
    let desktop_path = expand_home(&config.desktop_file);
    let desktop_file = desktop_path.display().to_string();
    let id = sanitize_id(&desktop_path);

    match fs::read_to_string(&desktop_path) {
        Ok(contents) => {
            let desktop = parse_desktop_file(&contents);
            let label = desktop
                .name
                .as_deref()
                .filter(|name| !name.trim().is_empty())
                .map(ToString::to_string)
                .unwrap_or_else(|| fallback_label(&desktop_path));
            let icon = config
                .icon
                .as_deref()
                .and_then(resolve_icon)
                .or_else(|| desktop.icon.as_deref().and_then(resolve_icon));
            let validation_error = validate_desktop_file(&desktop);
            let match_info = build_match_info(config.r#match.clone(), desktop.startup_wm_class.clone());

            if let Some(error) = validation_error {
                eprintln!("Control Strip: disabled {}: {}", desktop_file, error);
                return disabled_item(id, label, icon, desktop_file, match_info, error);
            }

            ControlStripItem {
                id,
                label,
                icon,
                desktop_file,
                is_pinned: true,
                is_open: false,
                windows: Vec::new(),
                r#match: match_info,
                disabled: None,
                error: None,
            }
        }
        Err(error) => {
            let message = format!("Failed to read .desktop file: {error}");
            eprintln!("Control Strip: disabled {}: {}", desktop_file, message);
            disabled_item(
                id,
                fallback_label(&desktop_path),
                None,
                desktop_file,
                config.r#match.clone(),
                message,
            )
        }
    }
}

fn disabled_item(
    id: String,
    label: String,
    icon: Option<String>,
    desktop_file: String,
    match_info: Option<WindowMatch>,
    error: String,
) -> ControlStripItem {
    ControlStripItem {
        id,
        label,
        icon,
        desktop_file,
        is_pinned: true,
        is_open: false,
        windows: Vec::new(),
        r#match: match_info,
        disabled: Some(true),
        error: Some(error),
    }
}

fn parse_desktop_file(contents: &str) -> ParsedDesktopFile {
    let mut values = HashMap::new();
    let mut in_desktop_entry = false;

    for raw_line in contents.lines() {
        let line = raw_line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            in_desktop_entry = line == "[Desktop Entry]";
            continue;
        }

        if !in_desktop_entry {
            continue;
        }

        if let Some((key, value)) = line.split_once('=') {
            values.insert(key.trim().to_string(), unescape_desktop_value(value.trim()));
        }
    }

    ParsedDesktopFile {
        name: values.remove("Name"),
        icon: values.remove("Icon"),
        exec: values.remove("Exec"),
        startup_wm_class: values.remove("StartupWMClass"),
        r#type: values.remove("Type"),
        hidden: values.remove("Hidden").and_then(|value| parse_desktop_bool(&value)),
        no_display: values
            .remove("NoDisplay")
            .and_then(|value| parse_desktop_bool(&value)),
        comment: values.remove("Comment"),
    }
}

fn validate_desktop_file(desktop: &ParsedDesktopFile) -> Option<String> {
    if desktop.name.as_deref().unwrap_or("").trim().is_empty() {
        return Some("Missing required Name".to_string());
    }

    if desktop.exec.as_deref().unwrap_or("").trim().is_empty() {
        return Some("Missing required Exec".to_string());
    }

    if !matches!(desktop.r#type.as_deref(), Some("Application")) {
        return Some("Type must be Application".to_string());
    }

    if desktop.hidden == Some(true) {
        return Some("Hidden=true".to_string());
    }

    None
}

fn build_match_info(
    configured: Option<WindowMatch>,
    startup_wm_class: Option<String>,
) -> Option<WindowMatch> {
    let startup_wm_class = startup_wm_class.filter(|value| !value.trim().is_empty());

    match (configured, startup_wm_class) {
        (Some(mut configured), Some(startup)) => {
            if configured.wm_class.is_none() {
                configured.wm_class = Some(startup);
            }

            Some(configured)
        }
        (Some(configured), None) => Some(configured),
        (None, Some(startup)) => Some(WindowMatch {
            wm_class: Some(startup),
            title_contains: None,
        }),
        (None, None) => None,
    }
}

fn does_window_match_item(item: &ControlStripItem, window: &RunningWindow) -> bool {
    let wm_class_hint = item
        .r#match
        .as_ref()
        .and_then(|match_info| match_info.wm_class.as_deref())
        .map(|value| value.trim().to_ascii_lowercase());
    let title_hint = item
        .r#match
        .as_ref()
        .and_then(|match_info| match_info.title_contains.as_deref())
        .map(|value| value.trim().to_ascii_lowercase());

    let wm_class_matches = if let Some(hint) = wm_class_hint.as_deref().filter(|hint| !hint.is_empty()) {
        does_window_class_match(window, hint)
    } else {
        does_window_match_weak_fallback(item, window)
    };
    let title_matches = if let Some(hint) = title_hint.as_deref().filter(|hint| !hint.is_empty()) {
        window.title.to_ascii_lowercase().contains(hint)
    } else {
        true
    };

    wm_class_matches && title_matches
}

fn does_window_match_weak_fallback(item: &ControlStripItem, window: &RunningWindow) -> bool {
    [desktop_file_stem(&item.desktop_file), Some(item.label.clone())]
        .into_iter()
        .flatten()
        .map(|candidate| candidate.trim().to_ascii_lowercase())
        .filter(|candidate| !candidate.is_empty())
        .any(|candidate| does_window_class_match(window, &candidate))
}

fn does_window_class_match(window: &RunningWindow, hint: &str) -> bool {
    does_class_value_match(&window.wm_class, hint)
        || does_class_value_match(&window.wm_class_instance, hint)
}

fn does_class_value_match(window_class: &str, hint: &str) -> bool {
    let normalized_wm_class = window_class.trim().to_ascii_lowercase();
    normalized_wm_class == hint
        || normalized_wm_class.ends_with(&format!(".{hint}"))
        || normalized_wm_class.contains(hint)
}

fn desktop_file_stem(desktop_file: &str) -> Option<String> {
    Path::new(desktop_file)
        .file_name()
        .and_then(|filename| filename.to_str())
        .map(|filename| filename.trim_end_matches(".desktop").to_string())
}

fn window_group_key(window: &RunningWindow) -> &str {
    if !window.wm_class.trim().is_empty() {
        &window.wm_class
    } else {
        &window.wm_class_instance
    }
}

fn normalize_temporary_group_id(wm_class: &str) -> String {
    let mut id = String::new();
    let mut previous_was_separator = false;

    for character in wm_class.trim().to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            id.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            id.push('-');
            previous_was_separator = true;
        }
    }

    let id = id.trim_matches('-').to_string();
    if id.is_empty() {
        "unknown".to_string()
    } else {
        id
    }
}

fn is_valid_app_id(app_id: &str) -> bool {
    !app_id.is_empty()
        && app_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, ':' | '-'))
}

fn is_valid_window_id(window_id: &str) -> bool {
    if let Some(hex) = window_id.strip_prefix("0x") {
        return !hex.is_empty() && hex.chars().all(|character| character.is_ascii_hexdigit());
    }

    !window_id.is_empty() && window_id.chars().all(|character| character.is_ascii_digit())
}

fn resolve_icon(icon: &str) -> Option<String> {
    let icon = icon.trim();

    if icon.is_empty() {
        return None;
    }

    let icon_path = expand_home(icon);
    if icon_path.is_absolute() {
        return icon_path
            .exists()
            .then(|| icon_path.display().to_string());
    }

    for path in icon_search_roots() {
        if let Some(icon_path) = find_icon_in_root(&path, icon) {
            return Some(icon_path.display().to_string());
        }
    }

    eprintln!("Control Strip: unresolved icon {}", icon);
    None
}

fn find_icon_in_root(root: &Path, icon: &str) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    for candidate in direct_icon_candidates(root, icon) {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let wanted_names = icon_file_names(icon);
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .find_map(|entry| {
            if !entry.file_type().is_file() {
                return None;
            }

            let file_name = entry.file_name().to_string_lossy();
            wanted_names
                .iter()
                .any(|wanted| wanted == file_name.as_ref())
                .then(|| entry.path().to_path_buf())
        })
}

fn direct_icon_candidates(root: &Path, icon: &str) -> Vec<PathBuf> {
    icon_file_names(icon)
        .into_iter()
        .map(|name| root.join(name))
        .collect()
}

fn icon_file_names(icon: &str) -> Vec<String> {
    let path = Path::new(icon);
    if path.extension().is_some() {
        return vec![icon.to_string()];
    }

    [".png", ".svg", ".xpm"]
        .iter()
        .map(|extension| format!("{icon}{extension}"))
        .collect()
}

fn icon_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/icons"));
    }

    roots.push(PathBuf::from("/usr/share/pixmaps"));
    roots.push(PathBuf::from("/usr/share/icons"));
    roots
}

fn parse_desktop_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn unescape_desktop_value(value: &str) -> String {
    value
        .replace("\\s", " ")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace("\\r", "\r")
        .replace("\\\\", "\\")
}

fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }

    PathBuf::from(path)
}

fn fallback_label(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Pinned App")
        .to_string()
}

fn sanitize_id(path: &Path) -> String {
    let id = fallback_label(path)
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if id.is_empty() {
        "pinned-app".to_string()
    } else {
        id
    }
}
