# BS-PROOF — build the whole thing on your machine (step by step)

Do these **in order**. GitHub is source of truth: `git pull` first, `git push` after each completed unit.

---

## Step 0 — Open the right terminal

Use **WSL Ubuntu** (not plain PowerShell for the pipeline).

```bash
cd ~/BS-PROOF
git pull
source .venv/bin/activate   # create venv first if missing: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt 2>/dev/null; true
```

If the repo is not cloned yet:

```bash
cd ~
git clone https://github.com/IceFrosst/BS-PROOF.git
cd BS-PROOF
python3 -m venv .venv && source .venv/bin/activate
```

---

## Step 1 — Deterministic health check (no AI)

```bash
python3 -m pipeline.selftest
```

Expect: `ALL PASSED`. If not, stop and fix before anything else.

---

## Step 2 — Wiring demo (synthetic, no AI)

Proves retrieve → score → table without models.

```bash
python3 run_pipeline.py creatine --form creatine_monohydrate --wiring
```

Optional archive for GitHub viewing:

```bash
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
git add reports/
git commit -m "Report: creatine wiring audit"
git push
```

---

## Step 3 — Install Grok Build CLI

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
echo 'export PATH="$HOME/.grok/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
grok version
```

---

## Step 4 — Log in (subscription)

```bash
grok login
```

Browser login is the whole step. Confirm with `grok models` before a batch.

---

## Step 5 — Grok adapter preflight + smoke

```bash
cd ~/BS-PROOF && source .venv/bin/activate
python3 grok_adapter.py
python3 grok_adapter.py smoke
```

- Preflight must find `grok` and 8 subagents.
- Smoke runs **one** S8 funding extraction. Fix auth/flags if it fails before a full batch.

---

## Step 6 — Full Grok batch (default 40 RCTs)

```bash
python3 run_pipeline.py creatine --form creatine_monohydrate --grok
# more studies if quota allows:
# python3 run_pipeline.py creatine --form creatine_monohydrate --grok --limit 60
```

Writes: `out/grok_creatine.sqlite` (separate from Claude).

---

## Step 7 — Claude pilot (optional, separate)

```bash
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot
```

Writes: `out/pilot_creatine.sqlite`. **Do not merge** with Grok scores.

---

## Step 8 — Archive results on GitHub

```bash
python3 scripts/write_demo_report.py --wiring --ingredient creatine --form creatine_monohydrate
git add reports/
git commit -m "Report: post-grok run notes"
git push
```

(Improve the report script later to dump `out/grok_*.sqlite` ECU tables the same way as pilot.)

---

## Mode cheat sheet

| Command | AI | Store |
|---------|----|-------|
| `--wiring` | No (fake) | `out/wiring_demo.sqlite` |
| `--pilot` | Claude subscription (superseded) | `out/pilot_<ingredient>.sqlite` |
| `--grok` | Grok CLI | `out/grok_<ingredient>.sqlite` |
| production (no flag) | Claude subscription | `out/bsproof.sqlite` |

---

## If something breaks

| Symptom | Fix |
|---------|-----|
| `grok: command not found` | PATH + reinstall CLI |
| auth / not logged in | `grok login` (Grok) · `claude auth status` then `/login` (Claude) |
| smoke unparseable JSON | Share stdout; adapter flag variants may need a tweak |
| selftest red | Fix pipeline before extraction |
| rate limit | Lower `--limit` or wait for weekly reset |
