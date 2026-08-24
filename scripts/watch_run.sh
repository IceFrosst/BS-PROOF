#!/usr/bin/env bash
# Live progress bar for a BS-PROOF pipeline run.
# Usage: scripts/watch_run.sh [logfile]   (defaults to newest out/run_*.log)
LOG="${1:-$(ls -t out/run_*.log | head -1)}"
echo "watching: $LOG   (Ctrl-C to stop; the run keeps going)"
while true; do
  LINE=$(grep -a "progress:" "$LOG" | tail -1)
  if [[ $LINE =~ progress:\ +([0-9]+)/([0-9]+) ]]; then
    DONE=${BASH_REMATCH[1]}; TOTAL=${BASH_REMATCH[2]}
    PCT=$(( DONE * 100 / TOTAL ))
    FILL=$(( DONE * 40 / TOTAL ))
    BAR=$(printf '%*s' "$FILL" '' | tr ' ' '#')$(printf '%*s' $((40-FILL)) '' | tr ' ' '-')
    EXTRA=$(sed -E 's/.*fail_partial=([0-9]+).*~([0-9]+)s left.*/fail=\1 ~\2s left/' <<<"$LINE")
    printf '\r[%s] %3d%%  %d/%d  %s   ' "$BAR" "$PCT" "$DONE" "$TOTAL" "$EXTRA"
  fi
  if ! pgrep -f "run_pipeline.py" >/dev/null; then
    printf '\nrun process exited — check the end of the log:\n'
    tail -5 "$LOG"; break
  fi
  sleep 5
done
