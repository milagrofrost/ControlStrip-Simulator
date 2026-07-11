from pathlib import Path

cargo = Path('src-tauri/Cargo.toml')
cargo_text = cargo.read_text()
if 'base64 = "0.22"' not in cargo_text:
    cargo_text = cargo_text.replace('[dependencies]\n', '[dependencies]\nbase64 = "0.22"\n', 1)
cargo.write_text(cargo_text)

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
    'use serde::{Deserialize, Serialize};',
    'use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};\nuse serde::{Deserialize, Serialize};',
    1,
)
text = text.replace(
    'const DEFAULT_SCREEN_CORNER_POSITION: &str = "bottom-left";',
    'const DEFAULT_SCREEN_CORNER_POSITION: &str = "bottom-left";\nconst MAX_ICON_BYTES: u64 = 1_048_576;',
    1,
)
old = '''    let icon_path = expand_home(icon);
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
'''
new = '''    let icon_path = expand_home(icon);
    if icon_path.is_absolute() {
        return load_icon_data_url(&icon_path);
    }

    for path in icon_search_roots() {
        if let Some(icon_path) = find_icon_in_root(&path, icon) {
            return load_icon_data_url(&icon_path);
        }
    }
'''
if old not in text:
    raise SystemExit('resolve_icon block not found')
text = text.replace(old, new, 1)
marker = 'fn find_icon_in_root(root: &Path, icon: &str) -> Option<PathBuf> {'
helper = '''fn load_icon_data_url(path: &Path) -> Option<String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => {
            eprintln!("Control Strip: could not read icon metadata for {}: {error}", path.display());
            return None;
        }
    };

    if !metadata.is_file() {
        eprintln!("Control Strip: icon path is not a file: {}", path.display());
        return None;
    }

    if metadata.len() > MAX_ICON_BYTES {
        eprintln!(
            "Control Strip: icon {} is too large ({} bytes; maximum {} bytes)",
            path.display(),
            metadata.len(),
            MAX_ICON_BYTES
        );
        return None;
    }

    let mime_type = match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("xpm") => "image/x-xpixmap",
        _ => {
            eprintln!("Control Strip: unsupported icon type: {}", path.display());
            return None;
        }
    };

    match fs::read(path) {
        Ok(bytes) => Some(format!(
            "data:{mime_type};base64,{}",
            BASE64_STANDARD.encode(bytes)
        )),
        Err(error) => {
            eprintln!("Control Strip: could not read icon {}: {error}", path.display());
            None
        }
    }
}

'''
if 'fn load_icon_data_url(path: &Path)' not in text:
    text = text.replace(marker, helper + marker, 1)
lib.write_text(text)

frontend = Path('src/controlStripModel.ts')
frontend_text = frontend.read_text()
frontend_text = frontend_text.replace(
    "import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';",
    "import { invoke, isTauri } from '@tauri-apps/api/core';",
    1,
)
frontend_text = frontend_text.replace(
    '    icon: item.icon ? convertFileSrc(item.icon) : undefined,',
    '    icon: item.icon ?? undefined,',
    1,
)
frontend.write_text(frontend_text)
