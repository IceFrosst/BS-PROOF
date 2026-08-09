# Grok Build CLI — pure-function extraction (on your machine)

This is BS-PROOF’s **Grok** path, analogous to Claude’s `--bare` pure subagents:
one shot, JSON out, no tools, max-turns 1, empty working directory.

## 1. Install Grok CLI (WSL Ubuntu)

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
# ensure ~/.grok/bin is on PATH (installer usually does this)
echo 'export PATH="$HOME/.grok/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
grok version
```

## 2. Authenticate (subscription)

You have **X Premium+** / SuperGrok-style access for Grok Build:

```bash
grok login
# browser or device auth
```

Browser login is the supported path and the only one this project uses — the
Grok backend runs on the subscription, same as Claude. There is no metered
model spend in this pipeline.

If `grok login` cannot complete on a headless box, fix it there (device auth,
or run the login on a machine with a browser and copy the credential) rather
than introducing a billed credential into the run.

## 3. Preflight + smoke

```bash
cd ~/BS-PROOF
git pull
source .venv/bin/activate   # if used

python3 grok_adapter.py           # preflight
python3 grok_adapter.py smoke     # one S8 funding call
```

## 4. Full batch (default 40 RCT-rank studies)

```bash
python3 run_pipeline.py creatine --form creatine_monohydrate --grok
# add --per-outcome for one query per outcome, and --dose <mg elemental>
# for the dose arc; --with-sr also mines review tables
# optional: --supplement-scope
```

Writes to **`out/grok_creatine.sqlite`** (never mixed with Claude pilot DB).

## 5. Compare vs Claude (separately)

```bash
python3 run_pipeline.py creatine --form creatine_monohydrate --pilot   # Claude
python3 run_pipeline.py creatine --form creatine_monohydrate --grok    # Grok
# Do NOT merge scores. Archive both under reports/runs/
```

## How pure-function is enforced

| Flag / practice | Role |
|-----------------|------|
| `grok -p` | Headless one-shot |
| `--max-turns 1` | No agent loop |
| `--no-memory --no-subagents --no-plan` | No ambient agent features |
| `--output-format json` | Machine-readable |
| Empty `--cwd` temp dir | Avoid AGENTS.md / project rule leak |
| Shared `prompts/` + `schemas/` + `PROMPT_VERSION` | Same contract as Claude |

## Limits

- Default batch: **100** studies on `--grok`, **40** on `--pilot`
  (`run_pipeline.DEFAULT_GROK_LIMIT` / `DEFAULT_PILOT_LIMIT`). Change with
  `--limit`. A study costs ~10 model calls, and about half of those are S6,
  which fires once per extracted claim.
- Grok weekly limits apply to subscription usage; stop and resume with a higher
  offset later if needed (future: resume cursor).
- Not a substitute for Claude production `--bare` until anchor eval agrees.
