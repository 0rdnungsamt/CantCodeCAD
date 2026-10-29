// cantcodecad als Desktop-Programm (Tauri 2).
// Ein kleiner Webserver im Programm liefert den cantcodecad-Ordner (index.html, src, Projekte) auf localhost aus –
// genau wie bisher tools/server.ps1 – und ein eigenes Fenster (WebView2) zeigt ihn an. Kein Browser; PowerShell nur
// unsichtbar für den Windows-Dateidialog (tools/dialog.ps1, ins Programm eingebaut).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

/// Ordner mit index.html suchen: CANTCODECAD_ROOT, neben der .exe oder bis zu 5 Ebenen darüber
/// (beim Bauen liegt die .exe in desktop/target/release).
fn find_root() -> PathBuf {
    if let Ok(p) = std::env::var("CANTCODECAD_ROOT") {
        let p = PathBuf::from(p);
        if p.join("index.html").is_file() {
            return p;
        }
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.parent().map(|p| p.to_path_buf());
        let mut n = 0;
        while let Some(x) = d.take() {
            if n >= 6 {
                break;
            }
            n += 1;
            d = x.parent().map(|p| p.to_path_buf());
            dirs.push(x);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.clone());
        if let Some(p) = cwd.parent() {
            dirs.push(p.to_path_buf());
        }
    }
    for d in dirs {
        if d.join("index.html").is_file() && d.join("src").is_dir() {
            return d;
        }
        // installiert (NSIS): Programmdateien als Ressourcen in <exe>\web
        let w = d.join("web");
        if w.join("index.html").is_file() && w.join("src").is_dir() {
            return w;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Ordner: Programmdateien (root), Projekte und beschreibbare Daten (Fehlerprotokoll).
/// Im Entwicklungsordner liegt alles beisammen; installiert kommen Projekte nach Dokumente\cantcodecad\Projekte,
/// beim ersten Start mit den Beispielen (aus web\Projekte-Beispiele).
struct Dirs {
    root: PathBuf,
    proj: PathBuf,
    data: PathBuf,
}
fn make_dirs(root: PathBuf) -> Dirs {
    if root.join("Projekte").is_dir() || !root.join("Projekte-Beispiele").is_dir() {
        let proj = root.join("Projekte");
        let _ = fs::create_dir_all(&proj);
        return Dirs { proj, data: root.join("tools"), root };
    }
    let home = std::env::var("USERPROFILE").map(PathBuf::from).unwrap_or_else(|_| root.clone());
    let data = home.join("Documents").join("cantcodecad");
    let proj = data.join("Projekte");
    let first = !proj.is_dir();
    let _ = fs::create_dir_all(&proj);
    if first {
        copy_dir(&root.join("Projekte-Beispiele"), &proj.join("Beispiele"));
    }
    Dirs { root, proj, data }
}
fn copy_dir(from: &Path, to: &Path) {
    let Ok(rd) = fs::read_dir(from) else { return };
    let _ = fs::create_dir_all(to);
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            copy_dir(&p, &to.join(e.file_name()));
        } else {
            let _ = fs::copy(&p, to.join(e.file_name()));
        }
    }
}

fn mime(path: &Path) -> &'static str {
    let ps = path.to_string_lossy();
    if ps.contains("+esm") {
        return "text/javascript; charset=utf-8";
    }
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") | Some("cantcodecad") => "application/json; charset=utf-8",
        Some("wasm") => "application/wasm",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("ttf") => "font/ttf",
        Some("md") | Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("Header")
}

/// %XX-Folgen einer URL entschlüsseln (UTF-8), "+" bleibt
fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Pfad sicher unterhalb von base auflösen (kein "..")
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut p = base.to_path_buf();
    for part in rel.split(|c| c == '/' || c == '\\') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') {
            return None;
        }
        p.push(part);
    }
    Some(p)
}

fn list_projects(dir: &Path, base: &Path, out: &mut Vec<serde_json::Value>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            if name != ".backup" {
                list_projects(&p, base, out);
            }
        } else if name.to_ascii_lowercase().ends_with(".cantcodecad") {
            let meta = e.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let rel = p.strip_prefix(base).unwrap_or(&p).to_string_lossy().replace('\\', "/");
            out.push(serde_json::json!({ "path": rel, "size": size, "mtime": mtime }));
        }
    }
}

/* ---------- Mitgelieferte Offline-Bibliotheken ----------
   Abhängigkeiten werden ausschließlich aus vendor/ geliefert. Der Desktop-Client
   baut keine Netzwerkverbindung auf und funktioniert vom ersten Start an offline. */
fn sanitize_query(q: &str) -> String {
    if q.is_empty() {
        return String::new();
    }
    let mut h: u64 = 1469598103934665603;
    for b in q.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    format!("__{:016x}", h)
}
/// (lokale Vendor-Datei, Art) für einen Bibliothekspfad
fn vendor_file_of(raw_path: &str, query: &str, root: &Path) -> Option<(PathBuf, &'static str)> {
    let (key, kind) = if let Some(r) = raw_path.strip_prefix("/cdn/") {
        (format!("jsdelivr/{}", r), "cdn")
    } else if let Some(r) = raw_path.strip_prefix("/npm/") {
        (format!("jsdelivr/npm/{}", r), "cdn")
    } else if let Some(r) = raw_path.strip_prefix("/gfonts/") {
        (format!("gfonts/{}{}.css", r, sanitize_query(query)), "css")
    } else if let Some(r) = raw_path.strip_prefix("/gstatic/") {
        (format!("gstatic/{}", r), "font")
    } else {
        return None;
    };
    let file = safe_join(&root.join("vendor"), &decode(&key))?;
    Some((file, kind))
}
fn vendor_mime(file: &Path, kind: &str) -> &'static str {
    if kind == "css" {
        return "text/css; charset=utf-8";
    }
    let m = mime(file);
    if m == "application/octet-stream" && kind == "cdn" {
        "text/javascript; charset=utf-8"
    } else {
        m
    }
}

/* ---------- Nesting: externes Blechnesting (Python) über tools/nester_bridge.py starten ----------
   Ordner aus tools/nester.json { "dir": "…" } oder der neueste mit app.py unter Desktop/Nester (bis 3 Ebenen tief). */
fn find_app_py(dir: &Path, depth: u32, best: &mut Option<(std::time::SystemTime, PathBuf)>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            if depth > 0 && name != ".venv" && name != "node_modules" {
                find_app_py(&p, depth - 1, best);
            }
        } else if name == "app.py" {
            let t = e.metadata().and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
            if best.as_ref().map(|(bt, _)| t > *bt).unwrap_or(true) {
                *best = Some((t, dir.to_path_buf()));
            }
        }
    }
}
fn find_nester(root: &Path) -> Option<PathBuf> {
    if let Ok(s) = fs::read_to_string(root.join("tools").join("nester.json")) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(d) = v.get("dir").and_then(|d| d.as_str()) {
                let p = PathBuf::from(d);
                if p.join("app.py").is_file() {
                    return Some(p);
                }
            }
        }
    }
    let home = std::env::var("USERPROFILE").ok()?;
    let mut best = None;
    find_app_py(&PathBuf::from(home).join("Desktop").join("Nester"), 3, &mut best);
    best.map(|(_, d)| d)
}
fn nester_python(dir: &Path) -> Option<PathBuf> {
    let s = dir.join(".venv").join("Scripts");
    [s.join("pythonw.exe"), s.join("python.exe")].into_iter().find(|p| p.is_file())
}
fn start_nester(root: &Path, dir: &Path, py: &Path) -> bool {
    let mut cmd = std::process::Command::new(py);
    cmd.arg(root.join("tools").join("nester_bridge.py")).current_dir(dir).env("NESTER_DIR", dir).env("PORT", "5057");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn().is_ok()
}

/// Wert eines Abfrageparameters (dekodiert, + = Leerzeichen)
fn qp(query: &str, key: &str) -> String {
    query
        .split('&')
        .find_map(|kv| kv.strip_prefix(&format!("{}=", key)))
        .map(|v| decode(&v.replace('+', " ")))
        .unwrap_or_default()
}
/// Base64 (für powershell -EncodedCommand, UTF-16LE)
fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity((data.len() + 2) / 3 * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= c.len() { s.push(T[(n >> (18 - 6 * i) & 63) as usize] as char); } else { s.push('='); }
        }
    }
    s
}
const DIALOG_PS: &str = include_str!("../../tools/dialog.ps1");
/// Windows-Dateidialog (Öffnen/Speichern unter) über ein unsichtbares PowerShell im STA-Modus; None = abgebrochen
fn file_dialog(mode: &str, name: &str, dir: &str, filter: &str) -> Option<String> {
    let utf16: Vec<u8> = DIALOG_PS.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-STA", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &b64(&utf16)])
        .env("CC_MODE", mode)
        .env("CC_NAME", name)
        .env("CC_DIR", dir)
        .env("CC_FILTER", filter);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}
/// Dateien mit vollem Pfad: nur bekannte cantcodecad-/Export-Endungen
fn allowed_file(p: &str) -> bool {
    let l = p.to_ascii_lowercase();
    Path::new(p).is_absolute()
        && [".cantcodecad", ".step", ".stp", ".stl", ".3mf", ".dxf", ".svg", ".pdf", ".zip", ".csv", ".webm", ".png"].iter().any(|e| l.ends_with(e))
}

fn read_body(req: &mut Request) -> String {
    let mut s = String::new();
    let _ = req.as_reader().read_to_string(&mut s);
    s
}

fn handle(mut req: Request, dirs: &Dirs) {
    let root = dirs.root.as_path();
    let url = req.url().to_string();
    let (path_raw, query) = match url.split_once('?') {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => (url.clone(), String::new()),
    };
    let path = decode(&path_raw);
    let proj = dirs.proj.clone();
    let no_store = header("Cache-Control", "no-store");

    if *req.method() == Method::Post && path == "/__diag" {
        let mut body = read_body(&mut req);
        body.truncate(65536);
        let log = dirs.data.join("diagnose.log");
        if fs::metadata(&log).map(|m| m.len() > 262_144).unwrap_or(false) {
            let _ = fs::remove_file(&log);
        }
        let _ = fs::create_dir_all(&dirs.data);
        use std::io::Write;
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&log) {
            let _ = write!(f, "{}\r\n", body);
        }
        let _ = req.respond(Response::empty(204));
        return;
    }
    if path == "/__nester" {
        let dir = find_nester(root);
        let py = dir.as_deref().and_then(nester_python);
        let mut started = false;
        if let (Some(d), Some(p)) = (dir.as_deref(), py.as_deref()) {
            if query.split('&').any(|kv| kv == "start=1") {
                started = start_nester(root, d, p);
            }
        }
        let json = serde_json::json!({ "dir": dir.as_ref().map(|d| d.to_string_lossy().to_string()), "ok": py.is_some(), "started": started, "port": 5057 }).to_string();
        let _ = req.respond(
            Response::from_string(json)
                .with_header(header("Content-Type", "application/json; charset=utf-8"))
                .with_header(no_store),
        );
        return;
    }
    // Windows-Dateidialoge und Dateien mit vollem Pfad. Nur mit Kopfzeile X-cantcodecad: fremde Webseiten können sie
    // nicht ohne CORS-Vorabanfrage setzen (die dieser Server nicht erlaubt) → kein Schreiben über fremde Seiten.
    if ["/__caps", "/__dialog", "/__fread", "/__fwrite", "/__zoom"].contains(&path.as_str()) {
        let json = |v: serde_json::Value| Response::from_string(v.to_string()).with_header(header("Content-Type", "application/json; charset=utf-8"));
        if path == "/__caps" {
            let _ = req.respond(json(serde_json::json!({ "dialogs": true, "zoom": true, "projects": proj.to_string_lossy() })).with_header(no_store));
            return;
        }
        let ok_hdr = req.headers().iter().any(|h| h.field.equiv("X-cantcodecad") && h.value.as_str() == "1");
        if !ok_hdr {
            let _ = req.respond(Response::empty(403));
            return;
        }
        if path == "/__zoom" {
            // Einstellungen → Größe der Oberfläche: echter Seitenzoom des Fensters (Menüs, Maus und 3D bleiben stimmig)
            let f: f64 = qp(&query, "f").parse().unwrap_or(1.0);
            let f = f.clamp(0.5, 2.0);
            let ok = APP.get().and_then(|a| a.get_webview_window("main")).map(|w| w.set_zoom(f).is_ok()).unwrap_or(false);
            let _ = req.respond(Response::empty(if ok { 204 } else { 500 }));
            return;
        }
        if path == "/__dialog" {
            let chosen = file_dialog(&qp(&query, "mode"), &qp(&query, "name"), &qp(&query, "dir"), &qp(&query, "filter"));
            let _ = req.respond(json(serde_json::json!({ "path": chosen })).with_header(no_store));
            return;
        }
        let fp = qp(&query, "path");
        if !allowed_file(&fp) {
            let _ = req.respond(Response::empty(400));
            return;
        }
        if path == "/__fread" {
            match fs::read(&fp) {
                Ok(bytes) => { let _ = req.respond(Response::from_data(bytes).with_header(header("Content-Type", "application/octet-stream")).with_header(no_store)); }
                Err(_) => { let _ = req.respond(Response::empty(404)); }
            }
            return;
        }
        if *req.method() == Method::Post {
            let mut data = Vec::new();
            let _ = req.as_reader().read_to_end(&mut data);
            if let Some(dir) = Path::new(&fp).parent() { let _ = fs::create_dir_all(dir); }
            let ok = fs::write(&fp, &data).is_ok();
            let _ = req.respond(Response::empty(if ok { 204 } else { 500 }));
        } else {
            let _ = req.respond(Response::empty(405));
        }
        return;
    }
    if path == "/__files" {
        let _ = fs::create_dir_all(&proj);
        let mut list = Vec::new();
        list_projects(&proj, &proj, &mut list);
        let json = serde_json::Value::Array(list).to_string();
        let _ = req.respond(
            Response::from_string(json)
                .with_header(header("Content-Type", "application/json; charset=utf-8"))
                .with_header(no_store),
        );
        return;
    }
    if *req.method() == Method::Post && path == "/__save" {
        // Datei in Projekte schreiben, alte Fassung nach Projekte/.backup
        let rel = query
            .split('&')
            .find_map(|kv| kv.strip_prefix("path="))
            .map(|v| decode(&v.replace('+', " ")))
            .unwrap_or_default();
        let target = match safe_join(&proj, &rel) {
            Some(t) if rel.to_ascii_lowercase().ends_with(".cantcodecad") => t,
            _ => {
                let _ = req.respond(Response::empty(400));
                return;
            }
        };
        let body = read_body(&mut req);
        if let Some(dir) = target.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if target.is_file() {
            let bdir = proj.join(".backup");
            let _ = fs::create_dir_all(&bdir);
            let stem = target.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let secs = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = fs::copy(&target, bdir.join(format!("{}-{}.cantcodecad", stem, secs)));
        }
        let ok = fs::write(&target, body.as_bytes()).is_ok();
        let _ = req.respond(Response::empty(if ok { 204 } else { 500 }));
        return;
    }
    if let Some((file, kind)) = vendor_file_of(&path_raw, &query, root) {
        match fs::read(&file) {
            Ok(bytes) => {
                let _ = req.respond(
                    Response::from_data(bytes)
                        .with_header(header("Content-Type", vendor_mime(&file, kind)))
                        .with_header(header("Access-Control-Allow-Origin", "*")),
                );
            }
            Err(_) => {
                let _ = req.respond(Response::from_string("Fehlendes Offline-Asset im vendor-Ordner.").with_status_code(StatusCode(404)));
            }
        }
        return;
    }
    let rel = if path == "/" || path.is_empty() { "/index.html".to_string() } else { path };
    let file = match rel.strip_prefix("/Projekte/") {
        Some(r) => safe_join(&proj, r),
        None => safe_join(root, &rel),
    };
    match file {
        Some(full) if full.is_file() => match fs::read(&full) {
            Ok(bytes) => {
                let _ = req.respond(
                    Response::from_data(bytes)
                        .with_header(header("Content-Type", mime(&full)))
                        .with_header(no_store),
                );
            }
            Err(_) => {
                let _ = req.respond(Response::from_string("Fehler").with_status_code(StatusCode(500)));
            }
        },
        _ => {
            let _ = req.respond(Response::from_string("Nicht gefunden").with_status_code(StatusCode(404)));
        }
    }
}

static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

fn main() {
    let dirs = std::sync::Arc::new(make_dirs(find_root()));
    // fester Port, damit Einstellungen und zuletzt geöffnetes Teil (localStorage) beim nächsten Start wieder da sind
    let mut server = None;
    let mut port = 0u16;
    for p in [8770u16, 8771, 8772, 8773, 8774, 8775, 8776, 8777] {
        if let Ok(s) = Server::http(("127.0.0.1", p)) {
            server = Some(s);
            port = p;
            break;
        }
    }
    let server = server.expect("Kein freier Port für cantcodecad gefunden (8770–8777)");
    let srv_dirs = dirs.clone();
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let d = srv_dirs.clone();
            std::thread::spawn(move || handle(req, &d));
        }
    });
    let url = format!("http://127.0.0.1:{}/", port);
    tauri::Builder::default()
        // nur ein cantcodecad gleichzeitig: ein zweiter Start holt das offene Fenster nach vorn
        // (sonst bekäme er einen anderen Port und damit einen leeren Zwischenspeicher)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .setup(move |app| {
            let _ = APP.set(app.handle().clone());
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().expect("URL")))
                .title("cantcodecad")
                .inner_size(1600.0, 1000.0)
                .min_inner_size(900.0, 600.0)
                .maximized(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("cantcodecad konnte nicht gestartet werden");
}
