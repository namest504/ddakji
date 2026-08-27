//! 노트 내보내기 (#149) — 공유물에는 이 기계의 사정(프론트매터·절대경로)이
//! 섞이면 안 된다. 렌더 충실도는 프런트(TipTap)가 갖고 있으므로 여기는
//! 파일 쓰기·zip 묶기·이미지 인코딩만 맡는다.

use std::fs;
use std::io::Write;
use std::path::Path;

use base64::Engine;

use crate::error::Error;
use crate::store::Store;
use crate::Result;

/// 본문에서 이 노트의 에셋 상대경로(`assets/<id>/파일`)를 전부 찾는다.
/// 마크다운 `![](...)`과 `<img src="...">` 두 표기 모두 이 문자열을 지나므로
/// 경로 패턴만 보면 된다.
pub fn asset_refs(body: &str, id: &str) -> Vec<String> {
    let prefix = format!("assets/{id}/");
    let mut out: Vec<String> = Vec::new();
    let mut rest = body;
    while let Some(pos) = rest.find(&prefix) {
        let tail = &rest[pos + prefix.len()..];
        let name: String = tail
            .chars()
            .take_while(|c| !c.is_whitespace() && !")\"'<>".contains(*c))
            .collect();
        if !name.is_empty() {
            let full = format!("{prefix}{name}");
            if !out.contains(&full) {
                out.push(full);
            }
        }
        rest = &rest[pos + prefix.len()..];
    }
    out
}

/// 에셋 상대경로 검증 — 본문에서 온 값이므로 경로 조작을 막는다.
fn checked_asset<'a>(rel: &'a str, id: &str) -> Result<&'a str> {
    let ok =
        rel.starts_with(&format!("assets/{id}/")) && !rel.contains("..") && !rel.contains('\\');
    if ok {
        Ok(rel)
    } else {
        Err(Error::Invalid(format!("bad asset path: {rel}")))
    }
}

/// 이미지를 data URI로 — 프런트가 HTML에 내장할 때 쓴다.
pub fn asset_data_uri(store: &Store, id: &str, rel: &str) -> Result<String> {
    checked_asset(rel, id)?;
    let bytes = fs::read(store.root().join(rel))?;
    let mime = match rel.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// 마크다운 내보내기. 이미지가 없으면 `.md` 한 파일, 있으면 같은 이름의
/// `.zip`(note.md + assets/) — 받는 쪽에서 풀면 상대경로가 바로 통한다.
/// 반환값은 실제로 쓴 파일 경로.
pub fn export_md(store: &Store, id: &str, dest: &Path) -> Result<String> {
    let note = store.load(id).ok_or(Error::NoteNotFound)?;
    let refs = asset_refs(&note.body, id);
    if refs.is_empty() {
        let path = dest.with_extension("md");
        fs::write(&path, &note.body)?;
        return Ok(path.display().to_string());
    }
    // zip 안에서는 노트 폴더 계층이 없으므로 경로를 한 단계 접는다
    let body = note.body.replace(&format!("assets/{id}/"), "assets/");
    let path = dest.with_extension("zip");
    let file = fs::File::create(&path)?;
    let mut zip = zip::ZipWriter::new(file);
    let opt = zip::write::SimpleFileOptions::default();
    zip.start_file("note.md", opt).map_err(zip_err)?;
    zip.write_all(body.as_bytes())?;
    for rel in refs {
        checked_asset(&rel, id)?;
        let name = rel.rsplit('/').next().unwrap_or(&rel);
        zip.start_file(format!("assets/{name}"), opt)
            .map_err(zip_err)?;
        zip.write_all(&fs::read(store.root().join(&rel))?)?;
    }
    zip.finish().map_err(zip_err)?;
    Ok(path.display().to_string())
}

fn zip_err(e: zip::result::ZipError) -> Error {
    Error::Invalid(format!("zip: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::MetaPatch;
    use tempfile::TempDir;

    fn store_with_note(body: &str) -> (TempDir, Store, String) {
        let d = TempDir::new().unwrap();
        let s = Store::new(d.path()).unwrap();
        let n = s.create().unwrap();
        s.save_body(&n.meta.id, body).unwrap();
        (d, s, n.meta.id)
    }

    #[test]
    fn plain_note_exports_as_single_md_without_frontmatter() {
        let (_d, s, id) = store_with_note("# 제목\n\n본문입니다.");
        let out = TempDir::new().unwrap();
        let path = export_md(&s, &id, &out.path().join("공유")).unwrap();
        assert!(path.ends_with(".md"));
        let text = fs::read_to_string(&path).unwrap();
        assert_eq!(text, "# 제목\n\n본문입니다.");
        assert!(!text.contains("---"), "프론트매터가 섞이면 안 된다");
    }

    #[test]
    fn note_with_images_exports_as_zip_with_rewritten_paths() {
        let (_d, s, id) = store_with_note("");
        let rel = {
            // 실제 에셋을 하나 심는다
            let r = s.save_asset(&id, "png", &[137, 80, 78, 71]).unwrap();
            s.save_body(
                &id,
                &format!("앞\n\n![]({r})\n\n<img src=\"{r}\" width=\"120\">"),
            )
            .unwrap();
            r
        };
        assert!(rel.starts_with(&format!("assets/{id}/")));

        let out = TempDir::new().unwrap();
        let path = export_md(&s, &id, &out.path().join("공유")).unwrap();
        assert!(path.ends_with(".zip"));

        let mut zip = zip::ZipArchive::new(fs::File::open(&path).unwrap()).unwrap();
        let names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(names.contains(&"note.md".to_string()));
        assert_eq!(names.iter().filter(|n| n.starts_with("assets/")).count(), 1);

        use std::io::Read;
        let mut md = String::new();
        zip.by_name("note.md")
            .unwrap()
            .read_to_string(&mut md)
            .unwrap();
        assert!(
            !md.contains(&format!("assets/{id}/")),
            "노트 id 계층은 접힌다"
        );
        assert!(md.contains("![](assets/"), "마크다운 경로 재작성");
        assert!(md.contains("<img src=\"assets/"), "img 태그 경로 재작성");
    }

    #[test]
    fn data_uri_encodes_and_rejects_traversal() {
        let (_d, s, id) = store_with_note("");
        let rel = s.save_asset(&id, "png", &[1, 2, 3]).unwrap();
        let uri = asset_data_uri(&s, &id, &rel).unwrap();
        assert!(uri.starts_with("data:image/png;base64,"));
        assert!(asset_data_uri(&s, &id, "assets/../secret").is_err());
        assert!(asset_data_uri(&s, &id, &format!("assets/{id}/../../x")).is_err());
    }

    #[test]
    fn asset_refs_dedupes_and_stops_at_delimiters() {
        let refs = asset_refs(
            "![](assets/n1/a.png) again <img src=\"assets/n1/a.png\"> and ![](assets/n1/b.jpg)",
            "n1",
        );
        assert_eq!(
            refs,
            vec!["assets/n1/a.png".to_string(), "assets/n1/b.jpg".to_string()]
        );
        let _ = MetaPatch::default(); // use 경고 방지용이 아니라 실제 타입 확인
    }
}
