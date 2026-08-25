from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PHOTO_ROOT = ROOT / "data" / "照片"
OUTPUT_ROOT = ROOT / "public" / "assets" / "places" / "field"
SQL_PATH = ROOT / "server" / "database" / "006_place_photos.sql"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

FOLDER_MAPPINGS = {
    "南昌市/南昌新四军军部旧址": {
        "slug": "nanchang-new-fourth-army",
        "place_ids": ["pl-item-3004e5fb4e3c"],
        "place_name": "南昌新四军军部旧址陈列馆",
    },
    "南昌市/中共中央东南分局旧址": {
        "slug": "southeast-bureau-site",
        "place_ids": ["pl-southeast-bureau-site"],
        "place_name": "中共中央东南分局旧址",
    },
    "庐山山上/抗战纪念碑": {
        "slug": "lushan-war-memorial",
        "place_ids": ["pl-lushan-anti-japanese-memorial", "pl-item-9f69ce34f655"],
        "place_name": "庐山抗战纪念碑",
    },
    "庐山山上/美庐别墅": {
        "slug": "meilu-villa",
        "place_ids": ["pl-meilu-villa"],
        "place_name": "美庐别墅",
    },
    "庐山山上/月照松林石刻": {
        "slug": "yuezhao-songlin",
        "place_ids": ["pl-yuezhao-songlin"],
        "place_name": "月照松林",
    },
    "庐山山上/周恩来纪念室": {
        "slug": "zhou-enlai-memorial-room",
        "place_ids": ["pl-zhou-enlai-villa-hexilu-442"],
        "place_name": "周恩来纪念馆河西路442号别墅",
    },
    "德安县城/德安县博物馆": {
        "slug": "dean-museum",
        "place_ids": ["pl-dean-museum"],
        "place_name": "德安县博物馆",
    },
    "德安县城/万家岭大捷纪念园": {
        "slug": "wanjialing-memorial-park",
        "place_ids": ["pl-wanjialing-victory-memorial-park"],
        "place_name": "万家岭大捷纪念园",
    },
}


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.name)]


def captured_at(path: Path, image: Image.Image) -> str | None:
    exif = image.getexif()
    raw = exif.get(36867) or exif.get(306)
    if raw:
        return str(raw)
    match = re.search(r"(20\d{6})[_-]?(\d{6})", path.stem)
    if match:
        date, clock = match.groups()
        return f"{date[:4]}-{date[4:6]}-{date[6:8]} {clock[:2]}:{clock[2:4]}:{clock[4:6]}"
    return None


def prepare_image(source: Path, destination: Path) -> tuple[int, int, int, str | None]:
    with Image.open(source) as opened:
        taken_at = captured_at(source, opened)
        if destination.exists():
            with Image.open(destination) as existing:
                return existing.width, existing.height, destination.stat().st_size, taken_at
        image = ImageOps.exif_transpose(opened)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        if image.mode == "RGBA":
            canvas = Image.new("RGB", image.size, "white")
            canvas.paste(image, mask=image.getchannel("A"))
            image = canvas
        image.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=82, method=6, optimize=True)
        return image.width, image.height, destination.stat().st_size, taken_at


def media_id(folder_key: str, digest: str) -> str:
    return "media-field-" + hashlib.sha1(f"{folder_key}:{digest}".encode("utf-8")).hexdigest()[:20]


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    unmatched: list[str] = []

    image_folders = sorted(
        {path.parent for path in PHOTO_ROOT.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS},
        key=lambda path: path.as_posix(),
    )
    for folder in image_folders:
        folder_key = folder.relative_to(PHOTO_ROOT).as_posix()
        mapping = FOLDER_MAPPINGS.get(folder_key)
        if not mapping:
            unmatched.append(folder_key)
            continue

        seen_hashes: set[str] = set()
        order = 0
        for source in sorted(
            (path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS),
            key=natural_key,
        ):
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)
            identifier = media_id(folder_key, digest)
            output_name = f"{order + 1:03d}-{digest[:10]}.webp"
            output_path = OUTPUT_ROOT / str(mapping["slug"]) / output_name
            width, height, size_bytes, taken_at = prepare_image(source, output_path)
            records.append(
                {
                    "id": identifier,
                    "folder": folder_key,
                    "place_ids": mapping["place_ids"],
                    "place_name": mapping["place_name"],
                    "source_name": source.name,
                    "source_path": source.relative_to(ROOT).as_posix(),
                    "sha256": digest,
                    "url": f"/assets/places/field/{mapping['slug']}/{output_name}",
                    "width": width,
                    "height": height,
                    "size_bytes": size_bytes,
                    "captured_at": taken_at,
                    "sort_order": order,
                }
            )
            order += 1

    manifest = {
        "generated_from": "data/照片",
        "mapped_folders": len(FOLDER_MAPPINGS),
        "media_count": len(records),
        "unmatched_folders": unmatched,
        "records": records,
    }
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "BEGIN;",
        "",
        "INSERT INTO public.sources (id,title,source_type,citation,reliability,note,metadata)",
        "VALUES ('src-field-photos-2026','项目实地调研照片','field_photo','data/照片 目录中的项目实地拍摄照片','high',NULL,'{\"import\":\"scripts/sync_place_photos.py\"}')",
        "ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, citation=EXCLUDED.citation, reliability=EXCLUDED.reliability, metadata=EXCLUDED.metadata;",
        "",
    ]
    first_media_by_place: dict[str, str] = {}
    for record in records:
        metadata = json.dumps(
            {"original_path": record["source_path"], "sha256": record["sha256"]},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        captured = "NULL" if record["captured_at"] is None else sql_text(str(record["captured_at"]))
        lines.extend(
            [
                "INSERT INTO public.media (id,media_type,url,storage_key,thumbnail_url,title,caption,mime_type,size_bytes,width,height,is_ai_generated,license,provider,credit_line,captured_at_raw,source_id,sort_order,metadata,status)",
                "VALUES ("
                + ",".join(
                    [
                        sql_text(str(record["id"])),
                        "'image'",
                        sql_text(str(record["url"])),
                        sql_text(str(record["url"])),
                        "NULL",
                        sql_text(f"{record['place_name']} - {Path(str(record['source_name'])).stem}"),
                        "''",
                        "'image/webp'",
                        str(record["size_bytes"]),
                        str(record["width"]),
                        str(record["height"]),
                        "FALSE",
                        "NULL",
                        "'项目实地调研'",
                        "'项目实地拍摄'",
                        captured,
                        "'src-field-photos-2026'",
                        str(record["sort_order"]),
                        sql_text(metadata),
                        "'active'",
                    ]
                )
                + ") ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url, storage_key=EXCLUDED.storage_key, title=EXCLUDED.title, mime_type=EXCLUDED.mime_type, size_bytes=EXCLUDED.size_bytes, width=EXCLUDED.width, height=EXCLUDED.height, captured_at_raw=EXCLUDED.captured_at_raw, sort_order=EXCLUDED.sort_order, metadata=EXCLUDED.metadata, status='active';",
            ]
        )
        for place_id in record["place_ids"]:
            first_media_by_place.setdefault(str(place_id), str(record["id"]))
            link_seed = f"{record['id']}:{place_id}"
            link_id = "ml-field-" + hashlib.sha1(link_seed.encode("utf-8")).hexdigest()[:20]
            relation = "primary_image" if record["sort_order"] == 0 else "gallery_image"
            lines.append(
                "INSERT INTO public.media_links (id,media_id,target_type,target_id,relation_type,sort_order,note) VALUES ("
                + ",".join(
                    [
                        sql_text(link_id),
                        sql_text(str(record["id"])),
                        "'place'",
                        sql_text(str(place_id)),
                        sql_text(relation),
                        str(record["sort_order"]),
                        "NULL",
                    ]
                )
                + ") ON CONFLICT (id) DO UPDATE SET media_id=EXCLUDED.media_id, target_id=EXCLUDED.target_id, relation_type=EXCLUDED.relation_type, sort_order=EXCLUDED.sort_order;"
            )

    lines.append("")
    for place_id, identifier in first_media_by_place.items():
        lines.append(
            f"UPDATE public.places SET status='active', review_status='approved', primary_media_id={sql_text(identifier)}, updated_at=now() WHERE id={sql_text(place_id)};"
        )
    lines.extend(["", "COMMIT;", ""])
    SQL_PATH.write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps({"media": len(records), "unmatched": unmatched}, ensure_ascii=False))


if __name__ == "__main__":
    main()
