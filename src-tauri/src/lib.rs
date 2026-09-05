use std::io::Write;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

#[derive(serde::Serialize)]
pub struct Opened {
    pub name: String,
    pub contents: String,
}

// 安卓的对话框返回 SAF 的 content:// URI，而 FilePath::into_path() 只认 file://，
// 四个命令于是全挂在「URL is not a valid path」上。改走 fs 插件的 Fs::open()：
// 桌面端等价于 std::fs，安卓端会把 content:// 换成文件描述符。

fn write_bytes(app: &tauri::AppHandle, fp: FilePath, bytes: &[u8]) -> Result<(), String> {
    let mut opts = OpenOptions::new();
    opts.write(true).truncate(true).create(true);
    let mut f = app.fs().open(fp, opts).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// 按字节解码，避免 `%` 后面跟多字节字符时切在半个字符上。
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// content:// URI 里没有文件名，只能从末段试着抠一个：
/// `primary%3ADocuments%2F歌.txt` 抠得到 `歌.txt`，`msf%3A1000000123` 抠不到，给空串。
fn name_from_uri(uri: &str) -> String {
    let head = uri.split(['?', '#']).next().unwrap_or(uri);
    let last = head.rsplit('/').next().unwrap_or("");
    let name = percent_decode(last);
    let name = name.rsplit(['/', ':']).next().unwrap_or("").trim();
    if name.contains('.') {
        name.to_string()
    } else {
        String::new()
    }
}

/// 前端靠这个名字分辨工程 JSON 还是词格 TXT，空串时它退回内容嗅探。
fn opened_name(fp: &FilePath) -> String {
    match fp {
        FilePath::Path(p) => p
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        FilePath::Url(u) => name_from_uri(u.as_str()),
    }
}

/// 桌面端给完整路径，安卓端只给得出文件名或空串。
fn saved_label(fp: &FilePath) -> String {
    match fp {
        FilePath::Path(p) => p.to_string_lossy().into_owned(),
        FilePath::Url(u) => name_from_uri(u.as_str()),
    }
}

/// 弹系统保存对话框，把文本写到用户选的位置。
/// 返回 None 表示用户取消了，返回空串表示存好了但说不出存到哪。
#[tauri::command]
async fn save_text(
    app: tauri::AppHandle,
    default_name: String,
    filter_name: String,
    exts: Vec<String>,
    contents: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();

    app.dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(filter_name, &ext_refs)
        .save_file(move |p| {
            let _ = tx.send(p);
        });

    let picked = rx.recv().map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let label = saved_label(&fp);
    write_bytes(&app, fp, contents.as_bytes())?;
    Ok(Some(label))
}

/// 弹系统打开对话框，读回文本内容。
#[tauri::command]
async fn open_text(
    app: tauri::AppHandle,
    filter_name: String,
    exts: Vec<String>,
) -> Result<Option<Opened>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();

    app.dialog()
        .file()
        .add_filter(filter_name, &ext_refs)
        .pick_file(move |p| {
            let _ = tx.send(p);
        });

    let picked = rx.recv().map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let name = opened_name(&fp);
    let contents = app.fs().read_to_string(fp).map_err(|e| e.to_string())?;
    Ok(Some(Opened { name, contents }))
}

/// 弹系统打开对话框，原样读回二进制内容（给 MIDI 导入用，文本那套 open_text
/// 用 read_to_string 会把非 UTF-8 的字节弄坏）。
#[tauri::command]
async fn open_binary(
    app: tauri::AppHandle,
    filter_name: String,
    exts: Vec<String>,
) -> Result<Option<Vec<u8>>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();

    app.dialog()
        .file()
        .add_filter(filter_name, &ext_refs)
        .pick_file(move |p| {
            let _ = tx.send(p);
        });

    let picked = rx.recv().map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let bytes = app.fs().read(fp).map_err(|e| e.to_string())?;
    Ok(Some(bytes))
}

/// 弹系统保存对话框，把二进制内容原样写到用户选的位置（给 MIDI 导出用）。
#[tauri::command]
async fn save_binary(
    app: tauri::AppHandle,
    default_name: String,
    filter_name: String,
    exts: Vec<String>,
    contents: Vec<u8>,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();

    app.dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(filter_name, &ext_refs)
        .save_file(move |p| {
            let _ = tx.send(p);
        });

    let picked = rx.recv().map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let label = saved_label(&fp);
    write_bytes(&app, fp, &contents)?;
    Ok(Some(label))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_text, open_text, open_binary, save_binary
        ])
        .run(tauri::generate_context!())
        .expect("词格酱启动失败");
}

#[cfg(test)]
mod tests {
    use super::name_from_uri;

    #[test]
    fn saf_uris() {
        let cases = [
            // 外部存储：末段解码后带相对路径
            (
                "content://com.android.externalstorage.documents/document/primary%3ADocuments%2F%E8%AF%8D%E6%A0%BC.txt",
                "词格.txt",
            ),
            // 下载目录的 raw 形式：解码后是绝对路径
            (
                "content://com.android.providers.downloads.documents/document/raw%3A%2Fstorage%2Femulated%2F0%2FDownload%2Fa.mid",
                "a.mid",
            ),
            // 下载目录的 msf 形式和 MediaStore 的数字 id：抠不到
            (
                "content://com.android.providers.downloads.documents/document/msf%3A1000000123",
                "",
            ),
            ("content://media/external/audio/media/42", ""),
            // 带 query、以斜杠结尾、畸形百分号、百分号后跟汉字，都不能 panic
            ("content://x/document/a%2Fb.txt?foo=1#z", "b.txt"),
            ("content://x/document/", ""),
            ("content://x/document/%zz%", ""),
            ("content://x/document/%中.txt", "%中.txt"),
        ];
        for (uri, want) in cases {
            assert_eq!(name_from_uri(uri), want, "{uri}");
        }
    }
}
