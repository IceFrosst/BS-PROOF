#!/usr/bin/env bash
# Build / install / roll back an ISOLATED, VERSIONED runtime of the research worker.
#
#   deploy/pc_research_worker_release.sh build                 # on the laptop, from a clean commit
#   deploy/pc_research_worker_release.sh install <tgz> <sha256> # on the mainPC, ONLY after reviewed integration
#   deploy/pc_research_worker_release.sh rollback               # on the mainPC
#   deploy/pc_research_worker_release.sh list
#
# The runtime contains eight files and nothing else: the worker, the adapter, the pure
# lead-accounting module the adapter imports, the live prompt, the audit schema, the two
# receipt schemas and the requirements (must equal deploy/pc_research_supervisor.RUNTIME_FILES). It never touches an app
# checkout, never writes a secret, never enables or starts a service.
#
# Restarting after `rollback` is a separate OWNER step for whichever unit is installed:
#   system unit (preferred on the mainPC): sudo systemctl restart bsproof-research-worker.service
#   user unit (only if `systemctl --user` works): systemctl --user restart bsproof-research-worker
# Never restart user@1000, dbus, WSL or a session for this. See docs/research/pc-research-worker.md.
set -euo pipefail

ROOT="${BS_PROOF_RESEARCH_ROOT:-$HOME/.local/share/bsproof-research-worker}"
FILES=(scripts/pc_research_worker.py scripts/pc_research_worker.requirements.txt
       pipeline/claude_research_adapter.py pipeline/research_leads.py prompts/research_audit_live.md
       schemas/research_audit.json schemas/source_access_v2.json schemas/source_access_v3.json)

die() { echo "error: $*" >&2; exit 1; }

case "${1:-}" in
build)
  repo="$(git rev-parse --show-toplevel)"; cd "$repo"
  [ -z "$(git status --porcelain --untracked-files=no -- "${FILES[@]}")" ] || die "uncommitted changes in runtime files"
  commit="$(git rev-parse --short=12 HEAD)"
  stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
  name="bsproof-research-worker-$commit"
  mkdir -p "$stage/$name"
  for f in "${FILES[@]}"; do mkdir -p "$stage/$name/$(dirname "$f")"; git show "HEAD:$f" > "$stage/$name/$f"; done
  ( cd "$stage/$name" && sha256sum "${FILES[@]}" > SHA256SUMS )
  printf '{"name":"%s","commit":"%s","built_utc":"%s"}\n' "$name" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$stage/$name/RELEASE.json"
  mkdir -p dist; tar -C "$stage" -czf "dist/$name.tgz" "$name"
  echo "built dist/$name.tgz"; sha256sum "dist/$name.tgz"
  ;;
install)
  tgz="${2:?tarball}"; want="${3:?expected sha256 of the tarball}"
  got="$(sha256sum "$tgz" | cut -d' ' -f1)"; [ "$got" = "$want" ] || die "sha256 mismatch ($got)"
  names="$(tar -tzf "$tgz" | cut -d/ -f1 | sort -u)"   # no `head -1`: SIGPIPE + pipefail makes it flaky
  [ "$(printf '%s\n' "$names" | wc -l)" = 1 ] || die "archive must contain exactly one top-level directory"
  name="$names"
  case "$name" in bsproof-research-worker-*) ;; *) die "unexpected archive layout";; esac
  [ ! -e "$ROOT/releases/$name" ] || die "release $name already installed"
  mkdir -p "$ROOT/releases" "$ROOT/data" "$HOME/.config/bsproof-research-worker"
  chmod 700 "$ROOT" "$ROOT/data" "$HOME/.config/bsproof-research-worker"
  tar -C "$ROOT/releases" -xzf "$tgz"
  rel="$ROOT/releases/$name"
  ( cd "$rel" && sha256sum -c SHA256SUMS >/dev/null ) || die "file checksums differ inside archive"
  python3 -m venv "$rel/venv"
  "$rel/venv/bin/pip" install --quiet --disable-pip-version-check -r "$rel/scripts/pc_research_worker.requirements.txt"
  "$rel/venv/bin/python" -c 'import importlib.metadata as m, sys; sys.exit(0 if m.version("jsonschema").split(".")[0] == "4" else 1)' \
    || die "the runtime venv must carry jsonschema 4.x (Draft 2020-12 receipts); see scripts/pc_research_worker.requirements.txt"
  "$rel/venv/bin/python" -m py_compile "$rel/scripts/pc_research_worker.py" "$rel/pipeline/claude_research_adapter.py" "$rel/pipeline/research_leads.py"
  [ -L "$ROOT/current" ] && ln -sfn "$(readlink "$ROOT/current")" "$ROOT/previous"
  ln -sfn "releases/$name" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"
  echo "installed $name -> $ROOT/current (service NOT enabled or started; no token written)"
  echo "next: create ~/.config/bsproof-research-worker/worker.env (0600), then: $ROOT/current/venv/bin/python $ROOT/current/scripts/pc_research_worker.py check"
  ;;
rollback)
  [ -L "$ROOT/previous" ] || die "no previous release recorded"
  prev="$(readlink "$ROOT/previous")"; cur="$(readlink "$ROOT/current" || true)"
  ln -sfn "$prev" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"
  [ -n "$cur" ] && ln -sfn "$cur" "$ROOT/previous"
  echo "current -> $prev (was $cur). Restart is an owner step for the installed unit; see docs/research/pc-research-worker.md (system unit: sudo systemctl restart bsproof-research-worker.service)"
  ;;
list)
  ls -1 "$ROOT/releases" 2>/dev/null || true
  echo "current: $(readlink "$ROOT/current" 2>/dev/null || echo none)"
  echo "previous: $(readlink "$ROOT/previous" 2>/dev/null || echo none)"
  ;;
*) die "usage: $0 build | install <tgz> <sha256> | rollback | list" ;;
esac
