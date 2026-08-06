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

Optional (CI / if login fails in headless):

```bash
export XAI_API_KEY='xai-...'   # from console.x.ai
```

API key **overrides** browser login when both are present.

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
# optional: --limit 60   if weekly quota allows
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

- Default batch **40** studies (~6–8 calls each). Raise with `--limit` if quota allows.
- Grok weekly limits apply to subscription usage; stop and resume with a higher
  offset later if needed (future: resume cursor).
- Not a substitute for Claude production `--bare` until anchor eval agrees.
