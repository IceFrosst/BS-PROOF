#!/usr/bin/env python3
"""Verify the published original-contract research comparison (offline, stdlib only).

Run from anywhere:

    python3 docs/design/research-original-contract-comparison/scripts/verify_publication.py
    python3 docs/design/research-original-contract-comparison/scripts/verify_publication.py --self-test

What it checks (every check fails closed; the exit code is non-zero if any fails):

  A. SHA256SUMS lists exactly the published files and every hash matches; nothing else is in the
     directory (no raw CLI streams, stderr, prompts, reports with cost, extra images).
  B. Exactly 16 annotated JPEG compositions (1 overview + 5 side-by-side + 10 individual); each is a
     well-formed JPEG whose byte size, pixel dimensions and sha256 equal the manifest.
  C. Exactly 10 raw audit.json files; each is byte-identical to the hash recorded from the immutable
     capture source (the manifest's recorded_source_sha256), parses, and validates against the
     canonical audit-v0.4 schema (JSON Schema 2020-12, repo file schemas/research_audit.json).
  D. The canonical schema, the audit-v0.4 prompt and the CLI "wire" schema (canonical minus the single
     "$schema" line, nothing else) match the recorded hashes; every keyword anywhere in the canonical schema
     is one this validator implements (so an unsupported keyword can never be silently skipped).
  E. report.csv: 10 rows, no cost/session/stream columns, per-row arithmetic
     (requests = non-access + Haiku refusals + content-bearing upper bound), totals 311 = 116 + 21 + 174,
     and the outcome counts equal the published audits.
  F. No absolute host paths, e-mail addresses or credential-looking strings in any published text file;
     no EXIF/XMP/IPTC/comment segments before the image data of any JPEG (only JFIF + ICC profile).
  G. README carries the mandatory limitation phrases and links to every published asset.

This is an integrity and disclosure gate. It does NOT validate the clinical content of any audit.
"""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUB_ROOT = HERE.parent  # docs/design/research-original-contract-comparison
LANES = ("sonnet-xhigh", "opus-high")
CASES = (1, 2, 3, 4, 5)

ALLOWED_TOP = {"README.md", "manifest.json", "report.csv", "SHA256SUMS", ".gitattributes"}
ALLOWED_DIRS = {"assets", "audits", "scripts"}

CSV_HEADER = [
    "case", "case_id", "lane", "model_requested", "effort_requested", "wall_time_s",
    "web_search_requests_stream", "web_fetch_requests", "tool_flagged_error", "http_403",
    "http_other_4xx", "redirect_not_followed", "captcha_cookie_wall", "non_access_total",
    "haiku_refusals", "content_bearing_upper_bound", "outcomes_in_audit", "caveat",
]
FORBIDDEN_CSV_COLUMNS = re.compile(r"cost|usd|session|token|stream_path|stderr|stdout|prompt", re.I)

# Patterns are assembled from fragments so this file does not contain (and flag) its own forbidden literals.
_P = lambda *parts: "".join(parts)  # noqa: E731
_ROOTS = [("ho", "me"), ("Us", "ers"), ("ro", "ot"), ("t", "mp"), ("v", "ar"), ("o", "pt"), ("m", "nt"),
          ("e", "tc"), ("s", "rv"), ("u", "sr"), ("Vol", "umes")]
HOST_PATH = re.compile(_P(
    r"(?<![A-Za-z0-9_.\-])/(?:", "|".join(a + b for a, b in _ROOTS), r")/[A-Za-z0-9_.-]",
    r"|fi", r"le:/{2,3}[A-Za-z0-9_.-]",
    r"|[A-Za-z]:\\{1,2}(?:Us", "ers|Win", "dows|Program Fi", "les|Documents and Set", "tings)",
    r"|\\\\{1,2}[A-Za-z0-9_.-]+\\{1,2}[A-Za-z0-9$_.-]+"))
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+")
SECRETISH = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}"
    r"|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|" + _P("service", "_role") + "|" + _P("SUPA", "BASE_[A-Z_]*KEY") + ")"
)

README_REQUIRED = [
    "not clinical advice",
    "no provider winner",
    "311",
    "116",
    "21",
    "174",
    "upper bound",
    "Haiku",
    "DO_NOT_GRADE",
    "W4",
    "W6",
    "Retained audit",
    "SLA",
    "not an end-to-end photo scan",
    "audit-v0.4",
    "OBSOLETE",
    "LF checkout",
    "unverified",
]


# ----------------------------------------------------------------------------- helpers
def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Report:
    def __init__(self) -> None:
        self.results: list[tuple[str, bool, str]] = []

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        self.results.append((name, bool(ok), detail))
        return bool(ok)

    @property
    def failed(self) -> list[tuple[str, bool, str]]:
        return [r for r in self.results if not r[1]]


def jpeg_info(data: bytes) -> dict:
    """Parse JPEG structure with the stdlib: SOI, marker walk to SOF, EOI. Raises ValueError."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("missing SOI")
    if data[-2:] != b"\xff\xd9":
        raise ValueError("missing EOI at end of file")
    i, n = 2, len(data)
    meta: list[str] = []
    sof = None
    while i < n:
        if data[i] != 0xFF:
            raise ValueError(f"marker expected at {i}")
        while i < n and data[i] == 0xFF:
            i += 1
        marker = data[i]
        i += 1
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            continue
        if marker == 0xD9:
            raise ValueError("EOI before SOF")
        if i + 2 > n:
            raise ValueError("truncated segment length")
        (seglen,) = struct.unpack(">H", data[i:i + 2])
        if seglen < 2 or i + seglen > n:
            raise ValueError("bad segment length")
        if marker == 0xFE or 0xE0 <= marker <= 0xEF:  # COM or APPn: record what it is
            head = data[i + 2:i + 2 + 12]
            if marker == 0xE0 and head.startswith(b"JFIF\x00"):
                meta.append("JFIF")
            elif marker == 0xE2 and head.startswith(b"ICC_PROFILE\x00"):
                meta.append("ICC")
            else:
                meta.append(f"{'COM' if marker == 0xFE else 'APP' + str(marker - 0xE0)}:{head[:6]!r}")
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            precision, height, width, ncomp = struct.unpack(">BHHB", data[i + 2:i + 8])
            if width == 0 or height == 0:
                raise ValueError("zero dimension")
            sof = {"width": width, "height": height, "precision": precision, "components": ncomp,
                   "progressive": marker in (0xC2, 0xC6, 0xCA, 0xCE)}
        if marker == 0xDA:  # start of scan: everything before the image data has been walked
            if sof is None:
                raise ValueError("no SOF marker before SOS")
            return {**sof, "metadata": meta}
        i += seglen
    raise ValueError("no SOS marker")


# ----------------------------------------------------------------------------- JSON Schema (2020-12 subset)
_ANNOTATIONS = {"$schema", "title", "description", "$defs"}
_SUPPORTED = _ANNOTATIONS | {"type", "additionalProperties", "required", "properties", "$ref", "enum",
                             "items", "minItems", "maxItems", "maxLength", "minimum", "maximum"}


def _is_type(v, t: str) -> bool:
    if t == "object":
        return isinstance(v, dict)
    if t == "array":
        return isinstance(v, list)
    if t == "string":
        return isinstance(v, str)
    if t == "boolean":
        return isinstance(v, bool)
    if t == "null":
        return v is None
    if t == "integer":
        return (isinstance(v, int) and not isinstance(v, bool)) or (isinstance(v, float) and v.is_integer())
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    raise ValueError(f"unsupported type {t!r}")


def unsupported_keywords(schema, path: str = "") -> list[str]:
    """Walk EVERY subschema (not just the ones an instance happens to reach) and report any keyword this
    validator does not implement. Property names, $defs names and enum values are data, not keywords."""
    found: list[str] = []
    if not isinstance(schema, dict):
        return found
    for k in schema:
        if k not in _SUPPORTED:
            found.append(f"{path or '/'}:{k}")
    for name, sub in (schema.get("properties") or {}).items():
        found += unsupported_keywords(sub, f"{path}/properties/{name}")
    for name, sub in (schema.get("$defs") or {}).items():
        found += unsupported_keywords(sub, f"{path}/$defs/{name}")
    if isinstance(schema.get("items"), dict):
        found += unsupported_keywords(schema["items"], f"{path}/items")
    if isinstance(schema.get("additionalProperties"), dict):
        found += unsupported_keywords(schema["additionalProperties"], f"{path}/additionalProperties")
    return found


def schema_errors(instance, schema: dict, root: dict, path: str = "") -> list[str]:
    """Validate `instance` against the keyword subset the canonical schema uses. Unknown keywords raise
    (fail closed) rather than being skipped, so a changed schema cannot silently pass."""
    unknown = set(schema) - _SUPPORTED
    if unknown:
        raise ValueError(f"unsupported schema keyword(s) {sorted(unknown)} at {path or '/'}")
    errs: list[str] = []
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/$defs/"):
            raise ValueError(f"unsupported $ref {ref!r}")
        target = root["$defs"][ref[len("#/$defs/"):]]
        errs += schema_errors(instance, target, root, path)
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_is_type(instance, t) for t in types):
            return errs + [f"{path or '/'}: expected type {types}, got {type(instance).__name__}"]
    if "enum" in schema and instance not in schema["enum"]:
        errs.append(f"{path or '/'}: {instance!r} not in enum")
    if isinstance(instance, str) and "maxLength" in schema and len(instance) > schema["maxLength"]:
        errs.append(f"{path or '/'}: string length {len(instance)} > maxLength {schema['maxLength']}")
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errs.append(f"{path or '/'}: {instance} < minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errs.append(f"{path or '/'}: {instance} > maximum {schema['maximum']}")
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errs.append(f"{path or '/'}: {len(instance)} items < minItems {schema['minItems']}")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errs.append(f"{path or '/'}: {len(instance)} items > maxItems {schema['maxItems']}")
        if "items" in schema:
            for idx, item in enumerate(instance):
                errs += schema_errors(item, schema["items"], root, f"{path}/{idx}")
    if isinstance(instance, dict):
        props = schema.get("properties", {})
        for req in schema.get("required", []):
            if req not in instance:
                errs.append(f"{path or '/'}: missing required property {req!r}")
        if schema.get("additionalProperties") is False:
            for k in instance:
                if k not in props:
                    errs.append(f"{path or '/'}: additional property {k!r} not allowed")
        for k, sub in props.items():
            if k in instance:
                errs += schema_errors(instance[k], sub, root, f"{path}/{k}")
    return errs


# ----------------------------------------------------------------------------- verification
def published_files(root: Path) -> list[str]:
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and "__pycache__" not in p.parts:
            out.append(p.relative_to(root).as_posix())
    return out


def verify(root: Path, repo_root: Path | None, source_dir: Path | None = None) -> Report:
    rep = Report()
    root = root.resolve()
    try:
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        rep.check("A0.manifest_parses", False, repr(e))
        return rep
    rep.check("A0.manifest_parses", True, f"manifest_version={manifest.get('manifest_version')}")

    # ---- A. hash list + allow-list of files
    files = published_files(root)
    unexpected = []
    for f in files:
        parts = f.split("/")
        if len(parts) == 1:
            if f not in ALLOWED_TOP:
                unexpected.append(f)
        elif parts[0] not in ALLOWED_DIRS:
            unexpected.append(f)
    rep.check("A1.no_unexpected_files", not unexpected, f"unexpected={unexpected[:6]}")
    forbid = [f for f in files if re.search(r"(raw-stream|stderr|stdout|system-prompt|request\.txt|report\.json|\.jsonl$|\.log$|\.env)", f)]
    rep.check("A2.no_private_capture_artifacts", not forbid, f"found={forbid[:6]}")

    sums_path = root / "SHA256SUMS"
    listed: dict[str, str] = {}
    sums_ok = sums_path.exists()
    if sums_ok:
        for line in sums_path.read_text(encoding="utf-8").splitlines():
            m = re.fullmatch(r"([0-9a-f]{64})  (\S.*)", line)
            if not m:
                sums_ok = False
                break
            listed[m.group(2)] = m.group(1)
    rep.check("A3.sha256sums_wellformed", sums_ok, f"{len(listed)} entries")
    expected_listed = sorted(f for f in files if f != "SHA256SUMS")
    rep.check("A4.sha256sums_covers_exactly_the_published_files", sorted(listed) == expected_listed,
              f"missing={sorted(set(expected_listed) - set(listed))[:4]} extra={sorted(set(listed) - set(expected_listed))[:4]}")
    bad = [f for f in expected_listed if f in listed and sha256_file(root / f) != listed[f]]
    rep.check("A5.sha256sums_all_match_disk", not bad, f"mismatch={bad[:4]}")

    # ---- B. images
    imgs = manifest.get("images", {}).get("compositions", [])
    rep.check("B1.image_count_16", len(imgs) == 16, f"{len(imgs)}")
    kinds = sorted(i.get("kind") for i in imgs)
    rep.check("B2.image_kinds_1_overview_5_side_by_side_10_individual",
              kinds == ["individual"] * 10 + ["overview"] + ["side-by-side"] * 5, f"{kinds}")
    on_disk_imgs = sorted(f for f in files if f.startswith("assets/"))
    rep.check("B3.images_on_disk_equal_manifest", on_disk_imgs == sorted(i["path"] for i in imgs), f"{len(on_disk_imgs)}")
    want = {("individual", lane, c) for lane in LANES for c in CASES} | {("side-by-side", None, c) for c in CASES} | {("overview", None, None)}
    have = {(i["kind"], i.get("lane"), i.get("case")) for i in imgs}
    rep.check("B4.image_lane_case_matrix_complete", want == have, f"missing={sorted(map(str, want - have))[:3]}")
    img_bad: list[str] = []
    meta_bad_img: list[str] = []
    for i in imgs:
        p = root / i["path"]
        if not p.is_file():
            img_bad.append(f"{i['path']}: missing")
            continue
        data = p.read_bytes()
        try:
            info = jpeg_info(data)
        except ValueError as e:
            img_bad.append(f"{i['path']}: {e}")
            continue
        extra_meta = [m for m in info.get("metadata", []) if m not in ("JFIF", "ICC")]
        if extra_meta:
            meta_bad_img.append(f"{i['path']}: {extra_meta[:2]}")
        if len(data) != i["bytes"]:
            img_bad.append(f"{i['path']}: bytes {len(data)} != {i['bytes']}")
        if sha256_bytes(data) != i["sha256"]:
            img_bad.append(f"{i['path']}: sha256 mismatch")
        if (info["width"], info["height"]) != (i["pixel_width"], i["pixel_height"]):
            img_bad.append(f"{i['path']}: dims {info['width']}x{info['height']} != {i['pixel_width']}x{i['pixel_height']}")
    rep.check("B5.every_jpeg_wellformed_with_manifest_bytes_dims_sha256", not img_bad, "; ".join(img_bad[:4]))
    rep.check("B6.jpegs_carry_only_jfif_and_icc_no_exif_xmp_iptc_or_comments", not meta_bad_img, "; ".join(meta_bad_img[:3]))

    # ---- C. audits
    audits = manifest.get("audits", [])
    rep.check("C1.audit_count_10", len(audits) == 10, f"{len(audits)}")
    have_a = {(a["lane"], a["case"]) for a in audits}
    rep.check("C2.audit_lane_case_matrix_complete", have_a == {(l, c) for l in LANES for c in CASES}, f"{sorted(have_a)[:3]}")
    on_disk_aud = sorted(f for f in files if f.startswith("audits/"))
    rep.check("C3.audits_on_disk_equal_manifest", on_disk_aud == sorted(a["path"] for a in audits), f"{len(on_disk_aud)}")

    schema_rel = manifest.get("contract", {}).get("canonical_schema", {}).get("repo_path", "schemas/research_audit.json")
    schema_path = (repo_root / schema_rel) if repo_root else None
    schema = None
    if schema_path and schema_path.is_file():
        schema_bytes = schema_path.read_bytes()
        schema = json.loads(schema_bytes)
        rep.check("D1.canonical_schema_sha256_matches_manifest",
                  sha256_bytes(schema_bytes) == manifest["contract"]["canonical_schema"]["sha256"], sha256_bytes(schema_bytes)[:12])
        # wire schema = canonical minus the single "$schema" line, nothing else
        text = schema_bytes.decode("utf-8")
        lines = text.split("\n")
        kept = [ln for ln in lines if not re.fullmatch(r'\s*"\$schema":\s*"[^"]*",?', ln)]
        removed = len(lines) - len(kept)
        wire = "\n".join(kept)
        rep.check("D2.wire_schema_is_canonical_minus_only_dollar_schema",
                  removed == 1 and sha256_bytes(wire.encode("utf-8")) == manifest["contract"]["wire_schema"]["sha256"]
                  and {k for k in schema} - {k for k in json.loads(wire)} == {"$schema"},
                  f"removed_lines={removed} sha={sha256_bytes(wire.encode('utf-8'))[:12]}")
        rep.check("D3.schema_dialect_2020_12", schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema", str(schema.get("$schema")))
        unsup = unsupported_keywords(schema)
        rep.check("D5.every_schema_keyword_is_implemented_by_the_validator", not unsup, f"unsupported={unsup[:4]}")
    else:
        rep.check("D1.canonical_schema_present", False, f"not found at {schema_rel} (run from inside the repository)")
    prompt_rel = manifest.get("contract", {}).get("prompt", {}).get("repo_path", "prompts/research_audit.md")
    if repo_root and (repo_root / prompt_rel).is_file():
        rep.check("D4.prompt_sha256_matches_manifest",
                  sha256_file(repo_root / prompt_rel) == manifest["contract"]["prompt"]["sha256"],
                  sha256_file(repo_root / prompt_rel)[:12])
    else:
        rep.check("D4.prompt_present", False, f"not found at {prompt_rel}")

    audit_bad: list[str] = []
    schema_bad: list[str] = []
    source_bad: list[str] = []
    meta_bad: list[str] = []
    outcome_counts: dict[tuple[str, int], int] = {}
    for a in audits:
        p = root / a["path"]
        if not p.is_file():
            audit_bad.append(f"{a['path']}: missing")
            continue
        data = p.read_bytes()
        if sha256_bytes(data) != a["sha256"] or len(data) != a["bytes"]:
            audit_bad.append(f"{a['path']}: bytes/sha256 differ from manifest")
        if sha256_bytes(data) != a["recorded_source_sha256"]:
            source_bad.append(f"{a['path']}: differs from the immutable capture's recorded hash")
        try:
            doc = json.loads(data)
        except Exception as e:  # noqa: BLE001
            audit_bad.append(f"{a['path']}: not JSON ({e})")
            continue
        outcome_counts[(a["lane"], a["case"])] = len(doc.get("outcomes", [])) if isinstance(doc.get("outcomes"), list) else -1
        if doc.get("meta", {}).get("prompt") != manifest["contract"]["prompt"]["version"]:
            meta_bad.append(f"{a['path']}: meta.prompt != audit-v0.4")
        if a["model_requested"] not in str(doc.get("meta", {}).get("model", "")):
            meta_bad.append(f"{a['path']}: meta.model does not name {a['model_requested']}")
        if schema is not None:
            try:
                errs = schema_errors(doc, schema, schema)
            except ValueError as e:
                errs = [f"validator refused: {e}"]
            if errs:
                schema_bad.append(f"{a['path']}: {errs[0]} (+{len(errs) - 1} more)")
    rep.check("C4.audits_match_manifest_bytes_and_sha256", not audit_bad, "; ".join(audit_bad[:4]))
    rep.check("C5.audits_equal_recorded_immutable_source_hashes", not source_bad, "; ".join(source_bad[:4]))
    if schema is not None:
        rep.check("C6.audits_validate_against_canonical_2020_12_schema", not schema_bad, "; ".join(schema_bad[:3]))
    rep.check("C7.audits_declare_audit_v0_4_and_requested_model", not meta_bad, "; ".join(meta_bad[:3]))
    if source_dir is not None:
        sd_bad = []
        for a in audits:
            sp = source_dir / a["lane"] / f"case{a['case']}" / "audit.json"
            if not sp.is_file() or sha256_file(sp) != a["sha256"]:
                sd_bad.append(a["path"])
        rep.check("C8.audits_equal_files_in_supplied_source_dir", not sd_bad, f"differs={sd_bad[:3]}")

    # ---- E. report.csv
    csv_path = root / "report.csv"
    rows: list[dict] = []
    if csv_path.is_file():
        with open(csv_path, newline="", encoding="utf-8") as f:
            rd = csv.DictReader(f)
            hdr = rd.fieldnames or []
            rows = list(rd)
        rep.check("E1.csv_header_exact", hdr == CSV_HEADER, f"{hdr}")
        rep.check("E2.csv_no_cost_session_stream_columns", not [h for h in hdr if FORBIDDEN_CSV_COLUMNS.search(h)], f"{hdr}")
    else:
        rep.check("E1.csv_present", False)
    rep.check("E3.csv_10_rows_full_matrix", {(r.get("lane"), r.get("case")) for r in rows} == {(l, str(c)) for l in LANES for c in CASES} and len(rows) == 10, f"{len(rows)} rows")
    arith_bad: list[str] = []
    tot = dict(req=0, non=0, ref=0, ub=0)
    try:
        for r in rows:
            n = {k: int(r[k]) for k in CSV_HEADER if k not in ("case_id", "lane", "model_requested", "effort_requested", "caveat", "wall_time_s")}
            classes = n["tool_flagged_error"] + n["http_403"] + n["http_other_4xx"] + n["redirect_not_followed"] + n["captcha_cookie_wall"]
            if classes != n["non_access_total"]:
                arith_bad.append(f"{r['lane']}/case{r['case']}: classes {classes} != non_access_total {n['non_access_total']}")
            if n["non_access_total"] + n["haiku_refusals"] + n["content_bearing_upper_bound"] != n["web_fetch_requests"]:
                arith_bad.append(f"{r['lane']}/case{r['case']}: parts do not add to web_fetch_requests")
            if n["outcomes_in_audit"] != outcome_counts.get((r["lane"], int(r["case"]))):
                arith_bad.append(f"{r['lane']}/case{r['case']}: outcomes_in_audit {n['outcomes_in_audit']} != published audit")
            float(r["wall_time_s"])
            if "SLA" not in r["caveat"] or "upper bound" not in r["caveat"]:
                arith_bad.append(f"{r['lane']}/case{r['case']}: caveat column lacks SLA/upper-bound wording")
            tot["req"] += n["web_fetch_requests"]; tot["non"] += n["non_access_total"]
            tot["ref"] += n["haiku_refusals"]; tot["ub"] += n["content_bearing_upper_bound"]
    except (KeyError, ValueError) as e:
        arith_bad.append(f"unparseable row: {e!r}")
    rep.check("E4.csv_row_arithmetic_and_outcome_counts", not arith_bad, "; ".join(arith_bad[:3]))
    want_tot = manifest.get("totals_all_10_captures", {})
    col_bad: list[str] = []
    for col, key in (("web_search_requests_stream", "web_search_requests_stream"), ("tool_flagged_error", "tool_flagged_error"),
                     ("http_403", "http_403"), ("http_other_4xx", "http_other_4xx"),
                     ("redirect_not_followed", "redirect_not_followed"), ("captcha_cookie_wall", "captcha_cookie_wall")):
        try:
            got = sum(int(r[col]) for r in rows)
        except (KeyError, ValueError):
            got = None
        if got != want_tot.get(key):
            col_bad.append(f"{col}: csv {got} != manifest {want_tot.get(key)}")
    rep.check("E6.csv_class_and_search_column_totals_equal_manifest_totals", not col_bad and len(rows) == 10, "; ".join(col_bad[:3]))
    rep.check("E5.csv_totals_311_eq_116_plus_21_plus_174",
              (tot["req"], tot["non"], tot["ref"], tot["ub"]) == (311, 116, 21, 174) == (
                  want_tot.get("web_fetch_requests"), want_tot.get("non_access"), want_tot.get("haiku_refusals"),
                  want_tot.get("content_bearing_upper_bound")), f"{tot}")

    # ---- F. public-safety scan of every published text file
    scan_bad: list[str] = []
    for f in files:
        if f.endswith((".jpg", ".jpeg")):
            continue
        txt = (root / f).read_text(encoding="utf-8", errors="strict")
        if txt.startswith("#!"):  # a leading interpreter (shebang) line is not a leaked host path
            txt = txt.split("\n", 1)[1] if "\n" in txt else ""
        for label, rx in (("host-path", HOST_PATH), ("email", EMAIL), ("credential-like", SECRETISH)):
            m = rx.search(txt)
            if m:
                scan_bad.append(f"{f}: {label} {m.group(0)[:30]!r}")
    rep.check("F1.no_host_paths_emails_or_credentials_in_published_text", not scan_bad, "; ".join(scan_bad[:4]))
    mtxt = json.dumps(manifest)
    rep.check("F2.manifest_has_no_cost_session_or_overlay_text", not re.search(r"total_cost|session_id|overlay_text\"", mtxt) and "overlay_text_sha256" in mtxt, "")

    # ---- G. README disclosures + links
    readme = (root / "README.md").read_text(encoding="utf-8") if (root / "README.md").is_file() else ""
    missing = [s for s in README_REQUIRED if s not in readme]
    rep.check("G1.readme_mandatory_limitation_phrases", not missing, f"missing={missing}")
    targets = set(re.findall(r"\]\(([^)#\s]+)(?:#[^)]*)?\)", readme))
    local = sorted(t for t in targets if not re.match(r"[a-z]+://", t))
    dead = [t for t in local if not (root / t).exists() and not (t.startswith("..") and root != PUB_ROOT.resolve())]
    rep.check("G2.readme_relative_links_resolve", not dead, f"dead={dead[:4]}")
    unlinked = [f for f in files if f.startswith(("assets/", "audits/")) and f not in {urlq(t) for t in local}]
    rep.check("G3.readme_links_every_published_image_and_audit", not unlinked, f"unlinked={unlinked[:4]}")
    return rep


def urlq(t: str) -> str:
    return t.replace("%20", " ")


# ----------------------------------------------------------------------------- self-test (mutations)
def self_test(root: Path, repo_root: Path | None) -> int:
    base = verify(root, repo_root)
    if base.failed:
        print("self-test: the unmodified publication does not verify:")
        for n, _, d in base.failed:
            print(f"  FAIL {n}: {d}")
        return 1
    print(f"self-test: baseline PASS ({len(base.results)} checks)")

    mutations = []

    def m(name, fn, expect_prefix, exclusive=False):
        mutations.append((name, fn, expect_prefix, exclusive))

    def flip_audit_byte(d: Path):
        p = d / "audits/sonnet-xhigh/case1/audit.json"
        b = bytearray(p.read_bytes()); b[100] ^= 0x01; p.write_bytes(bytes(b))

    def add_audit_property(d: Path):
        p = d / "audits/opus-high/case2/audit.json"
        doc = json.loads(p.read_text()); doc["extra"] = 1
        p.write_text(json.dumps(doc))

    def drop_required(d: Path):
        p = d / "audits/opus-high/case3/audit.json"
        doc = json.loads(p.read_text()); doc.pop("self_confidence")
        p.write_text(json.dumps(doc))

    def bad_enum(d: Path):
        p = d / "audits/sonnet-xhigh/case4/audit.json"
        doc = json.loads(p.read_text()); doc["outcomes"][0]["ledger"]["effectPoints"] = "9"
        p.write_text(json.dumps(doc))

    def long_string(d: Path):
        p = d / "audits/sonnet-xhigh/case2/audit.json"
        doc = json.loads(p.read_text()); doc["outcomes"][0]["name"] = "x" * 80
        p.write_text(json.dumps(doc))

    def rehash_after_audit_mutation(d: Path):
        # Attacker edits an audit AND fixes SHA256SUMS + manifest: must still fail the recorded-source check.
        p = d / "audits/sonnet-xhigh/case5/audit.json"
        doc = json.loads(p.read_text()); doc["confidence_note"] = doc["confidence_note"] + " "
        nb = json.dumps(doc).encode(); p.write_bytes(nb)
        mf = json.loads((d / "manifest.json").read_text())
        for a in mf["audits"]:
            if a["path"].endswith("sonnet-xhigh/case5/audit.json"):
                a["sha256"] = sha256_bytes(nb); a["bytes"] = len(nb)
        (d / "manifest.json").write_text(json.dumps(mf, indent=2))
        _rewrite_sums(d)

    def truncate_jpeg(d: Path):
        p = d / "assets/overview__10-actual-card-crops.jpg"
        p.write_bytes(p.read_bytes()[:-500])

    def wrong_dims(d: Path):
        mf = json.loads((d / "manifest.json").read_text())
        mf["images"]["compositions"][0]["pixel_width"] += 1
        (d / "manifest.json").write_text(json.dumps(mf, indent=2)); _rewrite_sums(d)

    def stray_stream(d: Path):
        (d / "audits/raw-stream.jsonl").write_text("{}\n"); _rewrite_sums(d)

    def host_path_in_readme(d: Path):
        p = d / "README.md"; p.write_text(p.read_text() + "\nsee " + "/ho" + "me/someone/private\n"); _rewrite_sums(d)

    def var_path_in_manifest(d: Path):
        p = d / "manifest.json"; p.write_text(p.read_text().replace('"kind":', '"note": "' + "/v" + 'ar/lib/x", "kind":', 1)); _rewrite_sums(d)

    def win_path_in_manifest(d: Path):
        drive = "C" + ":" + "\\\\" + "Us" + "ers\\\\someone"  # JSON-escaped Windows path
        p = d / "manifest.json"; p.write_text(p.read_text().replace('"kind":', '"note": "' + drive + '", "kind":', 1)); _rewrite_sums(d)

    def com_after_sof(d: Path):
        rel = "assets/individual/case2__sonnet-xhigh.jpg"
        p = d / rel; b = p.read_bytes()
        sos = b.index(b"\xff\xda")  # first start-of-scan marker (baseline JPEG, one scan)
        seg = b"hidden comment"
        nb = b[:sos] + b"\xff\xfe" + struct.pack(">H", len(seg) + 2) + seg + b[sos:]
        p.write_bytes(nb)
        mf = json.loads((d / "manifest.json").read_text())
        for i in mf["images"]["compositions"]:
            if i["path"] == rel:
                i["bytes"] = len(nb); i["sha256"] = sha256_bytes(nb)
        (d / "manifest.json").write_text(json.dumps(mf, indent=2)); _rewrite_sums(d)

    def exif_in_jpeg(d: Path):
        # Insert an APP1 (EXIF) segment and fix the manifest + hash list, so ONLY the metadata check can catch it.
        rel = "assets/individual/case1__opus-high.jpg"
        p = d / rel; b = p.read_bytes()
        seg = b"Exif\x00\x00" + b"0123456789"
        nb = b[:2] + b"\xff\xe1" + struct.pack(">H", len(seg) + 2) + seg + b[2:]
        p.write_bytes(nb)
        mf = json.loads((d / "manifest.json").read_text())
        for i in mf["images"]["compositions"]:
            if i["path"] == rel:
                i["bytes"] = len(nb); i["sha256"] = sha256_bytes(nb)
        (d / "manifest.json").write_text(json.dumps(mf, indent=2)); _rewrite_sums(d)

    def csv_search_total_off(d: Path):
        p = d / "report.csv"; rd = list(csv.reader(open(p, newline="")))
        idx = rd[0].index("web_search_requests_stream"); rd[1][idx] = str(int(rd[1][idx]) + 1)
        with open(p, "w", newline="") as f: csv.writer(f).writerows(rd)
        _rewrite_sums(d)

    def schema_with_unvisited_keyword(d: Path):
        # A copy of the repository's schema gains an UNREFERENCED $defs entry that uses a keyword this validator does
        # not implement; the manifest's schema and wire hashes are rewritten to match, so every audit still validates
        # and ONLY the keyword-coverage check (D5) can object.
        rr = d.parent / "fake-repo"; (rr / "schemas").mkdir(parents=True); (rr / "prompts").mkdir()
        sc = json.loads((repo_root / "schemas/research_audit.json").read_text())
        sc["$defs"]["neverReferenced"] = {"type": "string", "pattern": "^[0-4]$"}
        text = json.dumps(sc, indent=2, ensure_ascii=True) + "\n"
        (rr / "schemas/research_audit.json").write_text(text)
        shutil.copyfile(repo_root / "prompts/research_audit.md", rr / "prompts/research_audit.md")
        wire = "\n".join(ln for ln in text.split("\n") if not re.fullmatch(r'\s*"\$schema":\s*"[^"]*",?', ln))
        mf = json.loads((d / "manifest.json").read_text())
        mf["contract"]["canonical_schema"]["sha256"] = sha256_bytes(text.encode("utf-8"))
        mf["contract"]["wire_schema"]["sha256"] = sha256_bytes(wire.encode("utf-8"))
        (d / "manifest.json").write_text(json.dumps(mf, indent=2)); _rewrite_sums(d)
        return rr

    def csv_cost_column(d: Path):
        p = d / "report.csv"; t = p.read_text().splitlines()
        t[0] += ",total_cost_usd"
        for i in range(1, len(t)): t[i] += ",1.0"
        p.write_text("\n".join(t) + "\n"); _rewrite_sums(d)

    def csv_total_off(d: Path):
        p = d / "report.csv"; rd = list(csv.reader(open(p, newline="")))
        idx = rd[0].index("haiku_refusals"); rd[1][idx] = str(int(rd[1][idx]) + 1)
        with open(p, "w", newline="") as f: csv.writer(f).writerows(rd)
        _rewrite_sums(d)

    def drop_caveat(d: Path):
        p = d / "README.md"; p.write_text(p.read_text().replace("DO_NOT_GRADE", "NOT-GRADED")); _rewrite_sums(d)

    def sums_missing_line(d: Path):
        p = d / "SHA256SUMS"; ls = p.read_text().splitlines(); p.write_text("\n".join(ls[1:]) + "\n")

    def delete_image(d: Path):
        os.remove(d / "assets/side-by-side/case3__sonnet-xhigh_vs_opus-high.jpg"); _rewrite_sums(d)

    m("flip one audit byte", flip_audit_byte, "A5")
    m("audit gains an additional property", add_audit_property, "C6")
    m("audit loses a required property", drop_required, "C6")
    m("audit has an out-of-enum effectPoints", bad_enum, "C6")
    m("audit string exceeds maxLength", long_string, "C6")
    m("audit edited and hash lists rewritten", rehash_after_audit_mutation, "C5")
    m("jpeg truncated", truncate_jpeg, "B5")
    m("manifest dimensions wrong", wrong_dims, "B5")
    m("raw stream file added", stray_stream, "A2")
    m("absolute host path added to README", host_path_in_readme, "F1", True)
    m("var-style host path added to manifest", var_path_in_manifest, "F1", True)
    m("Windows-style escaped host path added to manifest", win_path_in_manifest, "F1", True)
    m("EXIF segment inserted into a JPEG (hashes rewritten)", exif_in_jpeg, "B6", True)
    m("COM segment inserted between SOF and SOS (hashes rewritten)", com_after_sof, "B6", True)
    m("report.csv search-request column off by one", csv_search_total_off, "E6", True)
    m("schema gains an unreferenced $defs entry with an unimplemented keyword", schema_with_unvisited_keyword, "D5", True)
    m("cost column added to report.csv", csv_cost_column, "E2")
    m("report.csv refusal count off by one", csv_total_off, "E4")
    m("README loses DO_NOT_GRADE", drop_caveat, "G1")
    m("SHA256SUMS line removed", sums_missing_line, "A4")
    m("a published image deleted", delete_image, "B3")

    failures = 0
    for name, fn, prefix, exclusive in mutations:
        tmp = Path(tempfile.mkdtemp(prefix="pubverify-"))
        try:
            d = tmp / PUB_ROOT.name
            shutil.copytree(root, d, ignore=shutil.ignore_patterns("__pycache__"))
            override = fn(d)
            rep = verify(d, override if isinstance(override, Path) else repo_root)
            caught = bool(rep.failed)
            tag = ",".join(n.split(".")[0] for n, _, _ in rep.failed)[:60]
            expected = any(n.startswith(prefix) for n, _, _ in rep.failed)
            if exclusive:  # only the intended check may object, so the mutation proves THAT check bites
                expected = expected and all(n.startswith(prefix) for n, _, _ in rep.failed)
            print(f"  {'caught ' if caught and expected else 'MISSED '} {name}  -> failed: {tag}{' (exclusive)' if exclusive else ''}")
            if not (caught and expected):
                failures += 1
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f"self-test: {len(mutations) - failures}/{len(mutations)} mutations caught")
    return 0 if failures == 0 else 1


def _rewrite_sums(d: Path) -> None:
    lines = []
    for f in published_files(d):
        if f == "SHA256SUMS":
            continue
        lines.append(f"{sha256_file(d / f)}  {f}")
    (d / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")


def find_repo_root(start: Path) -> Path | None:
    for p in [start, *start.parents]:
        if (p / "schemas" / "research_audit.json").is_file() and (p / "prompts" / "research_audit.md").is_file():
            return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", type=Path, default=PUB_ROOT, help="publication directory (default: this script's parent)")
    ap.add_argument("--repo-root", type=Path, default=None, help="repository root holding schemas/ and prompts/ (auto-detected)")
    ap.add_argument("--source-dir", type=Path, default=None,
                    help="optional: the immutable capture directory (<lane>/case<N>/audit.json) to compare byte-for-byte")
    ap.add_argument("--self-test", action="store_true", help="mutate a temp copy 21 ways and require each to be caught")
    ap.add_argument("--json", action="store_true", help="print a machine-readable summary")
    a = ap.parse_args()
    repo_root = a.repo_root or find_repo_root(a.root.resolve())
    if a.self_test:
        return self_test(a.root.resolve(), repo_root)
    rep = verify(a.root, repo_root, a.source_dir)
    if a.json:
        print(json.dumps({"pass": not rep.failed, "checks": len(rep.results),
                          "failed": [{"check": n, "detail": d} for n, _, d in rep.failed]}, indent=2))
    else:
        for n, ok, d in rep.results:
            print(f"{'PASS' if ok else 'FAIL'}  {n}" + (f"  — {d}" if d and not ok else ""))
        print(f"\n{'VERIFIED' if not rep.failed else 'NOT VERIFIED'}: {len(rep.results) - len(rep.failed)}/{len(rep.results)} checks passed")
    return 0 if not rep.failed else 1


if __name__ == "__main__":
    sys.exit(main())
