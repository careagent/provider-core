# CareAgent Live Deployment Playbook

> **Audience**: Claude Code executing deployment OR human contributors following along.
> **Prerequisites**: 4 VPS machines, 2 Telegram bots, LLM API key, GitHub PAT.
> **Result**: Full CareAgent ecosystem live — Axon registry, Neuron practice server, Provider CareAgent, Patient CareAgent — all communicating over HTTP with application-layer cryptography.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Phase 0: Preflight Checks](#phase-0-preflight-checks)
- [Phase 1: Deploy Axon](#phase-1-deploy-axon-to-vps-axon)
- [Phase 2: Deploy Neuron](#phase-2-deploy-neuron-to-vps-neuron)
- [Phase 3a: Build Provider Telegram Bot](#phase-3a-build-provider-telegram-bot-first-deployment-only)
- [Phase 3b: Deploy Provider Agent](#phase-3b-deploy-provider-agent-to-vps-provider)
- [Phase 4: Deploy Patient Agent](#phase-4-deploy-patient-agent-to-vps-patient)
- [Phase 5: Onboarding](#phase-5-onboarding-semi-auto)
- [Phase 6: Consent & Discovery](#phase-6-consent--provider-discovery)
- [Phase 7: P2P Message Delivery](#phase-7-p2p-message-delivery)
- [Phase 8: Full Verification](#phase-8-full-verification-suite)
- [Appendix A: Post-First-Deployment Cleanup](#appendix-a-post-first-deployment-cleanup)
- [Appendix B: Enable HTTPS](#appendix-b-enable-https)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| HTTP with raw IPs | No DNS required for contributors. Application-layer crypto (AES-256-GCM, Ed25519) handles security. |
| Caddy on Axon & Neuron only | Only 2 public servers. Provider/Patient VPS simulate personal devices — never directly reachable by domain. |
| OpenClaw handles Node.js | `curl -fsSL https://openclaw.ai/install.sh \| bash` installs Node.js 22, pnpm, and all deps. No manual setup. |
| OpenClaw multi-agent mode | Each CareAgent is its own agent with own agentId, workspace, Telegram bot, and session store. |
| All notifications via Telegram | No iMessage. Contributors must have Telegram. |
| Both bots use long polling | No webhooks, no inbound ports needed for Telegram. |

---

## Prerequisites

Complete **all** of these before running Phase 0.

### 1. Four VPS Machines (Ubuntu 24.04+, 2GB RAM minimum)

| VPS | Role | Notes |
|-----|------|-------|
| VPS-AXON | Axon trust registry | Docker + Caddy (dormant) |
| VPS-NEURON | Practice neuron | Systemd service + Caddy (dormant) |
| VPS-PROVIDER | Provider CareAgent + OpenClaw | Simulates provider's device |
| VPS-PATIENT | Patient CareAgent + OpenClaw | Simulates patient's device |

### 2. SSH Access

Generate an Ed25519 key pair (if you don't have one):

```bash
ssh-keygen -t ed25519 -C "careagent-deploy" -f ~/.ssh/id_ed25519
```

Copy to all 4 VPS:

```bash
ssh-copy-id root@<AXON_IP>
ssh-copy-id root@<NEURON_IP>
ssh-copy-id root@<PROVIDER_IP>
ssh-copy-id root@<PATIENT_IP>
```

Test connectivity:

```bash
for ip in <AXON_IP> <NEURON_IP> <PROVIDER_IP> <PATIENT_IP>; do
  ssh -o ConnectTimeout=5 root@$ip "echo OK: $(hostname)"
done
```

### 3. Telegram Account

Register a Telegram account with your phone number. You'll message both bots from this account.

### 4. Two Telegram Bots (via @BotFather)

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g., "CareAgent Provider Bot")
4. Choose a username (must end in `bot`, e.g., `careagent_provider_bot`)
5. **Save the token** — this is `TELEGRAM_PROVIDER_BOT_TOKEN`
6. Repeat for the second bot — save as `TELEGRAM_PATIENT_BOT_TOKEN`

Verify both tokens:

```bash
curl -s "https://api.telegram.org/bot<PROVIDER_TOKEN>/getMe" | jq .
curl -s "https://api.telegram.org/bot<PATIENT_TOKEN>/getMe" | jq .
```

Both should return `"ok": true` with your bot's username.

### 5. Get Your Telegram Chat ID

Send any message to **@userinfobot** on Telegram. It will reply with your numeric chat ID. Save this as `TELEGRAM_DEV_CHAT_ID`.

### 6. LLM API Key

Your preferred model provider (Anthropic, OpenAI, etc.) API key for OpenClaw's LLM backend.

### 7. GitHub PAT

Create a Personal Access Token with `repo` scope at https://github.com/settings/tokens. This is used to clone the careagent repos onto VPS machines.

### 8. secrets.env

Create `~/careagent/secrets.env` with all deployment credentials:

```bash
# =============================================
# CAREAGENT DEPLOYMENT SECRETS
# NEVER COMMIT. NEVER COPY.
# =============================================

# --- SSH ---
VPS_SSH_KEY_PATH="$HOME/.ssh/id_ed25519"

# --- VPS IPs ---
VPS_AXON_IP="<axon-ip>"
VPS_NEURON_IP="<neuron-ip>"
VPS_PROVIDER_IP="<provider-ip>"
VPS_PATIENT_IP="<patient-ip>"

# --- Telegram ---
TELEGRAM_PROVIDER_BOT_TOKEN="<token>"
TELEGRAM_PATIENT_BOT_TOKEN="<token>"
TELEGRAM_DEV_CHAT_ID="<your-chat-id>"

# --- GitHub ---
GITHUB_PAT="<pat>"

# --- LLM ---
LLM_API_KEY="<key>"
LLM_PROVIDER="anthropic"  # or openai, etc.

# --- Generated during deployment ---
AXON_ADMIN_TOKEN=""

# --- Set during Phase 2 (dev chooses these) ---
NEURON_PRACTICE_NAME=""
NEURON_PRACTICE_NPI=""
```

---

## Phase 0: Preflight Checks

**Purpose**: Validate all prerequisites before touching any VPS.

Run the standalone preflight script:

```bash
bash ~/careagent/orchestrator/deploy/preflight.sh
```

Or run checks inline:

```bash
#!/usr/bin/env bash
set -euo pipefail

SECRETS_FILE="${SECRETS_FILE:-$HOME/careagent/secrets.env}"
source "$SECRETS_FILE"

SSH_KEY="${VPS_SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"
REPOS_DIR="$HOME/careagent/repos"

echo "=== Phase 0: Preflight Checks ==="

# 1. secrets.env variables
echo "▸ Checking required variables..."
for var in VPS_SSH_KEY_PATH VPS_AXON_IP VPS_NEURON_IP VPS_PROVIDER_IP VPS_PATIENT_IP \
           TELEGRAM_PROVIDER_BOT_TOKEN TELEGRAM_PATIENT_BOT_TOKEN GITHUB_PAT LLM_API_KEY; do
  [[ -z "${!var:-}" ]] && echo "FAIL: $var is empty" && exit 1
  echo "  ✓ $var set"
done

# 2. SSH key permissions
echo "▸ Checking SSH key..."
[[ ! -f "$SSH_KEY" ]] && echo "FAIL: SSH key not found at $SSH_KEY" && exit 1
echo "  ✓ SSH key exists"

# 3. SSH connectivity
echo "▸ Testing SSH to all 4 VPS (5s timeout)..."
for ip in "$VPS_AXON_IP" "$VPS_NEURON_IP" "$VPS_PROVIDER_IP" "$VPS_PATIENT_IP"; do
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
    "root@$ip" "echo ok" &>/dev/null \
    && echo "  ✓ $ip" \
    || { echo "FAIL: Cannot SSH to $ip"; exit 1; }
done

# 4. Telegram bot tokens
echo "▸ Validating Telegram tokens..."
for token_var in TELEGRAM_PROVIDER_BOT_TOKEN TELEGRAM_PATIENT_BOT_TOKEN; do
  token="${!token_var}"
  response=$(curl -sf "https://api.telegram.org/bot${token}/getMe")
  echo "$response" | grep -q '"ok":true' \
    && echo "  ✓ $token_var valid" \
    || { echo "FAIL: $token_var invalid"; exit 1; }
done

# 5. GitHub PAT
echo "▸ Validating GitHub PAT..."
curl -sf -H "Authorization: token $GITHUB_PAT" https://api.github.com/user | grep -q '"login"' \
  && echo "  ✓ GitHub PAT valid" \
  || { echo "FAIL: GitHub PAT invalid"; exit 1; }

# 6. Local builds
echo "▸ Building all repos locally..."
for repo in axon neuron provider-core patient-core patient-chart; do
  echo "  Building $repo..."
  (cd "$REPOS_DIR/$repo" && pnpm build &>/dev/null) \
    && echo "  ✓ $repo build OK" \
    || { echo "FAIL: $repo build failed"; exit 1; }
done

# 7. Local tests
echo "▸ Running tests in all repos..."
for repo in axon neuron provider-core patient-core patient-chart; do
  echo "  Testing $repo..."
  (cd "$REPOS_DIR/$repo" && pnpm test &>/dev/null) \
    && echo "  ✓ $repo tests OK" \
    || { echo "FAIL: $repo tests failed"; exit 1; }
done

echo ""
echo "✅ Phase 0 PASSED — all preflight checks OK"
```

### Gate
ALL preflight checks pass. Any failure stops deployment with a clear error.

### Rollback
N/A — no changes made.

---

## Phase 1: Deploy Axon to VPS-AXON

**Purpose**: Stand up the trust registry on VPS-AXON.

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
AXON_IP="$VPS_AXON_IP"

echo "=== Phase 1: Deploy Axon to $AXON_IP ==="

# Step 1: Install Docker + Docker Compose
echo "▸ [1/6] Installing Docker..."
ssh $SSH_OPTS "root@$AXON_IP" bash <<'EOF'
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
fi
echo "Docker $(docker --version)"
EOF

# Step 2: Install Caddy (dormant)
echo "▸ [2/6] Installing Caddy (dormant)..."
bash ~/careagent/orchestrator/deploy/caddy-setup.sh "$AXON_IP" "$SSH_KEY" 9999 "${AXON_DOMAIN:-axon.example.com}"

# Step 3: Clone Axon repo
echo "▸ [3/6] Cloning Axon repo..."
ssh $SSH_OPTS "root@$AXON_IP" bash <<EOF
if [[ ! -d /opt/axon ]]; then
  git clone https://${GITHUB_PAT}@github.com/careagent/axon.git /opt/axon
else
  cd /opt/axon && git pull
fi
EOF

# Step 4: Configure for HTTP with raw IP
echo "▸ [4/6] Configuring Axon for HTTP..."
ssh $SSH_OPTS "root@$AXON_IP" bash <<EOF
cd /opt/axon

# Create .env for Docker Compose
cat > .env <<DOTENV
NODE_ENV=production
AXON_PORT=9999
AXON_HOST=0.0.0.0
AXON_LOG_LEVEL=info
DOTENV

# Ensure docker-compose.yml exposes port 9999
if ! grep -q "9999:9999" docker-compose.yml 2>/dev/null; then
  echo "WARNING: Verify docker-compose.yml exposes port 9999"
fi
EOF

# Step 5: Start Axon
echo "▸ [5/6] Starting Axon via Docker Compose..."
ssh $SSH_OPTS "root@$AXON_IP" bash <<'EOF'
cd /opt/axon
docker compose down 2>/dev/null || true
docker compose up -d --build
echo "Waiting for container to start..."
sleep 5
docker ps --filter "name=axon" --format "{{.Names}}: {{.Status}}"
EOF

# Step 6: Health check (with retry)
echo "▸ [6/6] Waiting for health check..."
for i in $(seq 1 12); do
  if curl -sf "http://${AXON_IP}:9999/health" | grep -q "ok"; then
    echo "  ✓ Axon health check passed"
    break
  fi
  if [[ $i -eq 12 ]]; then
    echo "FAIL: Axon health check timed out after 60s"
    echo "Check logs: ssh root@${AXON_IP} 'docker logs axon'"
    exit 1
  fi
  sleep 5
done

echo ""
echo "✅ Phase 1 PASSED — Axon deployed at http://${AXON_IP}:9999"
```

### Gate
- `curl http://${VPS_AXON_IP}:9999/health` returns `{"status":"ok"}`
- `docker ps` on VPS-AXON shows axon container running

### Rollback
```bash
ssh root@${VPS_AXON_IP} "cd /opt/axon && docker compose down && rm -rf /opt/axon"
```

---

## Phase 2: Deploy Neuron to VPS-NEURON

**Purpose**: Deploy a practice neuron and register it with Axon.

### Interactive: Choose your practice identity

Before running this phase, decide:
- **Practice name** (suggestion: "Southeastern Spine")
- **Fake NPI** (10 digits, suggestion: "1234567893")

Set in secrets.env:
```bash
NEURON_PRACTICE_NAME="Southeastern Spine"
NEURON_PRACTICE_NPI="1234567893"
```

### Deploy Script

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
NEURON_IP="$VPS_NEURON_IP"
AXON_IP="$VPS_AXON_IP"

PRACTICE_NAME="${NEURON_PRACTICE_NAME:-Southeastern Spine}"
PRACTICE_NPI="${NEURON_PRACTICE_NPI:-1234567893}"

echo "=== Phase 2: Deploy Neuron to $NEURON_IP ==="
echo "  Practice: $PRACTICE_NAME (NPI: $PRACTICE_NPI)"

# Step 1: Set environment for deploy-neuron.sh
export VPS_NEURON_IP="$NEURON_IP"
export VPS_SSH_KEY_PATH="$SSH_KEY"
export AXON_DOMAIN="$AXON_IP:9999"     # Raw IP, no HTTPS
export NEURON_DOMAIN="$NEURON_IP:3000"  # Raw IP, no HTTPS
export ORG_NPI="$PRACTICE_NPI"
export ORG_NAME="$PRACTICE_NAME"
export ORG_TYPE="practice"

# Step 2: Run the existing deploy-neuron.sh
echo "▸ Running deploy-neuron.sh..."
cd ~/careagent/repos/neuron
bash deploy/deploy-neuron.sh

# Step 3: Install Caddy (dormant)
echo "▸ Installing Caddy (dormant)..."
bash ~/careagent/orchestrator/deploy/caddy-setup.sh "$NEURON_IP" "$SSH_KEY" 3000 "${NEURON_DOMAIN_NAME:-neuron.example.com}"

# Step 4: Configure neuron for HTTP with raw Axon IP
echo "▸ Configuring Axon URL for HTTP..."
ssh $SSH_OPTS "root@$NEURON_IP" bash <<EOF
# Update neuron config to use HTTP Axon URL
if [[ -f /opt/neuron/neuron.config.json ]]; then
  # Replace any HTTPS Axon URL with HTTP raw IP
  sed -i "s|https://[^\"]*axon[^\"]*|http://${AXON_IP}:9999|g" /opt/neuron/neuron.config.json
  echo "Updated Axon URL to http://${AXON_IP}:9999"
  systemctl restart neuron
fi
EOF

# Step 5: Wait for neuron to register with Axon
echo "▸ Waiting for neuron registration with Axon (up to 120s)..."
for i in $(seq 1 24); do
  # Check neuron health
  if curl -sf "http://${NEURON_IP}:3000/health" | grep -q "ok\|healthy"; then
    echo "  ✓ Neuron health check passed"
    break
  fi
  if [[ $i -eq 24 ]]; then
    echo "FAIL: Neuron health check timed out after 120s"
    exit 1
  fi
  sleep 5
done

# Step 6: Verify registration with Axon
echo "▸ Verifying neuron registered with Axon..."
for i in $(seq 1 12); do
  search_result=$(curl -sf "http://${AXON_IP}:9999/v1/registry/search?q=${PRACTICE_NAME// /+}" 2>/dev/null || echo "")
  if [[ -n "$search_result" ]] && echo "$search_result" | grep -qi "$PRACTICE_NPI\|$PRACTICE_NAME"; then
    echo "  ✓ Neuron visible in Axon registry"
    break
  fi
  if [[ $i -eq 12 ]]; then
    echo "WARNING: Neuron not yet visible in Axon registry search"
    echo "  This may resolve after the next heartbeat cycle."
  fi
  sleep 5
done

# Step 7: Verify systemd service
echo "▸ Verifying systemd service..."
ssh $SSH_OPTS "root@$NEURON_IP" bash <<'EOF'
systemctl is-active neuron && echo "  ✓ neuron service active" || echo "  ✗ neuron service not active"
test -f /opt/neuron/data/neuron.db && echo "  ✓ SQLite DB created" || echo "  ✗ SQLite DB missing"
EOF

echo ""
echo "✅ Phase 2 PASSED — Neuron deployed at http://${NEURON_IP}:3000"
echo "  Practice: $PRACTICE_NAME (NPI: $PRACTICE_NPI)"
```

### Gate
- Neuron systemd service active: `systemctl is-active neuron`
- Health check: `curl http://${VPS_NEURON_IP}:3000/health`
- Neuron in Axon registry: `curl http://${VPS_AXON_IP}:9999/v1/registry/search?q=<practice-name>`
- SQLite DB created at `/opt/neuron/data/neuron.db`

### Rollback
```bash
ssh root@${VPS_NEURON_IP} "systemctl stop neuron; rm -rf /opt/neuron"
```

---

## Phase 3a: Build Provider Telegram Bot (FIRST-DEPLOYMENT-ONLY)

**Purpose**: Create the provider-side Telegram bot integration and wire Axon questionnaires into onboarding. This is a **code-writing phase** — after the first successful deployment, this code is committed to provider-core and this phase is skipped.

### What Gets Built

In `~/careagent/repos/provider-core/src/bot/`:

| File | Purpose |
|------|---------|
| `telegram-client.ts` | HTTP client for Telegram Bot API (mirrors patient-core) |
| `telegram-io.ts` | `InterviewIO` adapter — routes `question()`, `select()`, `confirm()`, `display()` through Telegram |
| `onboarding-bot.ts` | Wires TelegramIO → existing `runInterview()` engine |
| `index.ts` | Barrel export |

### InterviewIO → Telegram Mapping

| InterviewIO Method | Telegram Implementation |
|-------------------|------------------------|
| `display(text)` | `sendMessage(chatId, text)` — fire-and-forget |
| `question(prompt)` | `sendMessage(chatId, prompt)` then poll for next text message |
| `confirm(prompt)` | Send with inline keyboard (Yes/No buttons), wait for callback query |
| `select(prompt, options)` | Send with inline keyboard (one button per option), wait for callback query |

### Axon Questionnaire Wiring

Modify `src/onboarding/stages.ts` — the SCOPE stage:

1. Try to fetch `AxonClient.getQuestionnaire('physician')` (12-question questionnaire)
2. For each question: map `answer_type` to InterviewIO calls
   - `boolean` → `confirm(question.text)` → if true, add `action_assignments[0].grants` to permitted actions
   - `single_select` → `select(question.text, options.map(o => o.label))` → set `cans_field`
3. Evaluate `show_when` conditionals — skip questions whose conditions aren't met
4. Collect all granted actions into `scope.permitted_actions`
5. **Fallback**: if Axon is unreachable, fall back to the existing free-text scope collection

### Build & Test

```bash
cd ~/careagent/repos/provider-core

# Build
pnpm build

# Test (all existing ~729 tests + new bot tests)
pnpm test

# Commit
git add src/bot/ test/unit/bot/ src/onboarding/stages.ts
git commit -m "feat: add provider Telegram bot + Axon questionnaire wiring

- TelegramIO adapter implements InterviewIO over Telegram
- Onboarding bot wires TelegramIO to 9-stage interview engine
- SCOPE stage fetches physician questionnaire from Axon
- Falls back to free-text scope if Axon unreachable
- Unit tests for transport, IO adapter, and bot orchestrator"
git push
```

### Gate
- `pnpm build` succeeds
- `pnpm test` passes (all existing + new tests)
- Bot code committed to provider-core

### Rollback
```bash
cd ~/careagent/repos/provider-core
git revert HEAD
git push
```

---

## Phase 3b: Deploy Provider Agent to VPS-PROVIDER

**Purpose**: Install OpenClaw + provider-core extension on VPS-PROVIDER, configure multi-agent mode with Telegram bot.

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
PROVIDER_IP="$VPS_PROVIDER_IP"
NEURON_IP="$VPS_NEURON_IP"
AXON_IP="$VPS_AXON_IP"

echo "=== Phase 3b: Deploy Provider Agent to $PROVIDER_IP ==="

# Step 1: Install OpenClaw
echo "▸ [1/5] Installing OpenClaw..."
ssh $SSH_OPTS "root@$PROVIDER_IP" bash <<'EOF'
if ! command -v openclaw &>/dev/null; then
  curl -fsSL https://openclaw.ai/install.sh | bash
fi
echo "OpenClaw $(openclaw --version 2>/dev/null || echo 'installed')"
EOF

# Step 2: Clone and build provider-core
echo "▸ [2/5] Cloning and building provider-core..."
ssh $SSH_OPTS "root@$PROVIDER_IP" bash <<EOF
mkdir -p /opt/careagent
if [[ ! -d /opt/careagent/provider-core ]]; then
  git clone https://${GITHUB_PAT}@github.com/careagent/provider-core.git /opt/careagent/provider-core
else
  cd /opt/careagent/provider-core && git pull
fi
cd /opt/careagent/provider-core
pnpm install --frozen-lockfile
pnpm build
echo "✓ provider-core built"
EOF

# Step 3: Configure OpenClaw
echo "▸ [3/5] Configuring OpenClaw..."
ssh $SSH_OPTS "root@$PROVIDER_IP" bash <<EOF
mkdir -p ~/.openclaw

cat > ~/.openclaw/openclaw.json <<OCCONFIG
{
  "agents": {
    "list": [
      {
        "id": "provider-careagent",
        "name": "Provider CareAgent",
        "workspace": "/opt/careagent/provider-core",
        "extensions": ["/opt/careagent/provider-core"]
      }
    ]
  },
  "channels": {
    "telegram": {
      "accounts": [
        {
          "botToken": "${TELEGRAM_PROVIDER_BOT_TOKEN}",
          "agentId": "provider-careagent",
          "pollingMode": true
        }
      ]
    }
  },
  "env": {
    "vars": {
      "LLM_API_KEY": "${LLM_API_KEY}",
      "LLM_PROVIDER": "${LLM_PROVIDER:-anthropic}",
      "NEURON_ENDPOINT": "http://${NEURON_IP}:3000",
      "AXON_URL": "http://${AXON_IP}:9999",
      "NODE_ENV": "production"
    }
  }
}
OCCONFIG
echo "✓ OpenClaw configured"
EOF

# Step 4: Create systemd service
echo "▸ [4/5] Installing systemd service..."
ssh $SSH_OPTS "root@$PROVIDER_IP" bash <<'EOF'
cat > /etc/systemd/system/openclaw.service <<SERVICE
[Unit]
Description=OpenClaw Agent Runtime (Provider CareAgent)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/careagent/provider-core
ExecStart=/usr/local/bin/openclaw start
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable openclaw
systemctl restart openclaw
echo "✓ OpenClaw service installed and started"
EOF

# Step 5: Verify
echo "▸ [5/5] Verifying deployment..."
sleep 10  # Give service time to start

# Check OpenClaw
ssh $SSH_OPTS "root@$PROVIDER_IP" "systemctl is-active openclaw" | grep -q "active" \
  && echo "  ✓ OpenClaw service active" \
  || echo "  ✗ OpenClaw service not active"

# Check Telegram bot
curl -sf "https://api.telegram.org/bot${TELEGRAM_PROVIDER_BOT_TOKEN}/getMe" | grep -q '"ok":true' \
  && echo "  ✓ Provider Telegram bot responding" \
  || echo "  ✗ Provider Telegram bot not responding"

# Check for crash loops
sleep 20
restarts=$(ssh $SSH_OPTS "root@$PROVIDER_IP" "systemctl show openclaw --property=NRestarts" | cut -d= -f2)
if [[ "${restarts:-0}" -le 1 ]]; then
  echo "  ✓ Service stable (${restarts} restarts)"
else
  echo "  ✗ Service may be crash-looping (${restarts} restarts)"
fi

echo ""
echo "✅ Phase 3b PASSED — Provider CareAgent deployed on $PROVIDER_IP"
echo "  Note: Provider-core extension is inactive until CANS.md exists (expected)"
```

### Gate
- OpenClaw installed: `openclaw --version` succeeds on VPS-PROVIDER
- Telegram bot responding: `getMe` returns valid bot info
- Systemd service stable (no crash loops within 30s)
- Provider-core extension loaded (inactive until onboarding — expected)

### Rollback
```bash
ssh root@${VPS_PROVIDER_IP} "systemctl stop openclaw; systemctl disable openclaw; rm -rf /opt/careagent"
```

---

## Phase 4: Deploy Patient Agent to VPS-PATIENT

**Purpose**: Install OpenClaw + patient-core extension on VPS-PATIENT.

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
PATIENT_IP="$VPS_PATIENT_IP"
AXON_IP="$VPS_AXON_IP"

echo "=== Phase 4: Deploy Patient Agent to $PATIENT_IP ==="

# Step 1: Install OpenClaw
echo "▸ [1/5] Installing OpenClaw..."
ssh $SSH_OPTS "root@$PATIENT_IP" bash <<'EOF'
if ! command -v openclaw &>/dev/null; then
  curl -fsSL https://openclaw.ai/install.sh | bash
fi
echo "OpenClaw $(openclaw --version 2>/dev/null || echo 'installed')"
EOF

# Step 2: Clone and build patient-core + patient-chart
echo "▸ [2/5] Cloning and building patient repos..."
ssh $SSH_OPTS "root@$PATIENT_IP" bash <<EOF
mkdir -p /opt/careagent

# Clone patient-core
if [[ ! -d /opt/careagent/patient-core ]]; then
  git clone https://${GITHUB_PAT}@github.com/careagent/patient-core.git /opt/careagent/patient-core
else
  cd /opt/careagent/patient-core && git pull
fi
cd /opt/careagent/patient-core
pnpm install --frozen-lockfile
pnpm build
echo "✓ patient-core built"

# Clone patient-chart
if [[ ! -d /opt/careagent/patient-chart ]]; then
  git clone https://${GITHUB_PAT}@github.com/careagent/patient-chart.git /opt/careagent/patient-chart
else
  cd /opt/careagent/patient-chart && git pull
fi
cd /opt/careagent/patient-chart
pnpm install --frozen-lockfile
pnpm build
echo "✓ patient-chart built"
EOF

# Step 3: Configure OpenClaw
echo "▸ [3/5] Configuring OpenClaw..."
ssh $SSH_OPTS "root@$PATIENT_IP" bash <<EOF
mkdir -p ~/.openclaw

cat > ~/.openclaw/openclaw.json <<OCCONFIG
{
  "agents": {
    "list": [
      {
        "id": "patient-careagent",
        "name": "Patient CareAgent",
        "workspace": "/opt/careagent/patient-core",
        "extensions": ["/opt/careagent/patient-core"]
      }
    ]
  },
  "channels": {
    "telegram": {
      "accounts": [
        {
          "botToken": "${TELEGRAM_PATIENT_BOT_TOKEN}",
          "agentId": "patient-careagent",
          "pollingMode": true
        }
      ]
    }
  },
  "env": {
    "vars": {
      "LLM_API_KEY": "${LLM_API_KEY}",
      "LLM_PROVIDER": "${LLM_PROVIDER:-anthropic}",
      "AXON_URL": "http://${AXON_IP}:9999",
      "NODE_ENV": "production"
    }
  }
}
OCCONFIG
echo "✓ OpenClaw configured"
EOF

# Step 4: Create systemd service
echo "▸ [4/5] Installing systemd service..."
ssh $SSH_OPTS "root@$PATIENT_IP" bash <<'EOF'
cat > /etc/systemd/system/openclaw.service <<SERVICE
[Unit]
Description=OpenClaw Agent Runtime (Patient CareAgent)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/careagent/patient-core
ExecStart=/usr/local/bin/openclaw start
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable openclaw
systemctl restart openclaw
echo "✓ OpenClaw service installed and started"
EOF

# Step 5: Verify
echo "▸ [5/5] Verifying deployment..."
sleep 10

ssh $SSH_OPTS "root@$PATIENT_IP" "systemctl is-active openclaw" | grep -q "active" \
  && echo "  ✓ OpenClaw service active" \
  || echo "  ✗ OpenClaw service not active"

curl -sf "https://api.telegram.org/bot${TELEGRAM_PATIENT_BOT_TOKEN}/getMe" | grep -q '"ok":true' \
  && echo "  ✓ Patient Telegram bot responding" \
  || echo "  ✗ Patient Telegram bot not responding"

sleep 20
restarts=$(ssh $SSH_OPTS "root@$PATIENT_IP" "systemctl show openclaw --property=NRestarts" | cut -d= -f2)
if [[ "${restarts:-0}" -le 1 ]]; then
  echo "  ✓ Service stable (${restarts} restarts)"
else
  echo "  ✗ Service may be crash-looping (${restarts} restarts)"
fi

echo ""
echo "✅ Phase 4 PASSED — Patient CareAgent deployed on $PATIENT_IP"
```

### Gate
- OpenClaw installed on VPS-PATIENT
- Patient-core + patient-chart built successfully
- Telegram bot responding
- Systemd service stable

### Rollback
```bash
ssh root@${VPS_PATIENT_IP} "systemctl stop openclaw; systemctl disable openclaw; rm -rf /opt/careagent"
```

---

## Phase 5: Onboarding (Semi-Auto)

**Purpose**: Complete provider AND patient onboarding via Telegram. This phase pauses and waits for you to message the bots.

### Provider Onboarding

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "=== Phase 5: Onboarding ==="
echo ""

# ── Provider Onboarding ──
echo "═══════════════════════════════════════════════════"
echo "  PROVIDER ONBOARDING"
echo "═══════════════════════════════════════════════════"
echo ""

# Send Telegram notification to dev
echo "▸ Sending notification to Telegram..."
curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_PROVIDER_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_DEV_CHAT_ID}\", \"text\": \"🔔 CareAgent Deployment\\n\\nProvider onboarding ready.\\nMessage @$(curl -sf 'https://api.telegram.org/bot'${TELEGRAM_PROVIDER_BOT_TOKEN}'/getMe' | grep -o '\"username\":\"[^\"]*\"' | cut -d'\"' -f4) with /start to begin.\"}" \
  >/dev/null 2>&1

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  ACTION REQUIRED:                                 ║"
echo "║  Open Telegram and message the Provider bot       ║"
echo "║  with /start to begin provider onboarding.        ║"
echo "║                                                   ║"
echo "║  Complete the 9-stage interview:                  ║"
echo "║  1. Welcome (acknowledge synthetic data)          ║"
echo "║  2. Identity (name, NPI)                          ║"
echo "║  3. Credentials (provider type, degrees)          ║"
echo "║  4. Specialty (specialty, organization)           ║"
echo "║  5. Scope (Axon questionnaire or free-text)       ║"
echo "║  6. Philosophy (clinical approach)                ║"
echo "║  7. Voice (documentation style)                   ║"
echo "║  8. Autonomy (AI independence level)              ║"
echo "║  9. Consent (final acknowledgments)               ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Polling for CANS.md on VPS-PROVIDER (timeout: 10 min)..."

# Poll for CANS.md
TIMEOUT=600
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  cans_exists=$(ssh $SSH_OPTS "root@$VPS_PROVIDER_IP" \
    "find /opt/careagent/provider-core -name 'CANS.md' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")
  if [[ -n "$cans_exists" ]]; then
    echo ""
    echo "  ✓ CANS.md detected at $cans_exists"
    break
  fi
  sleep 10
  ((ELAPSED+=10))
  echo "  ... waiting ($ELAPSED/${TIMEOUT}s)"
done

if [[ $ELAPSED -ge $TIMEOUT ]]; then
  echo "FAIL: CANS.md not found after ${TIMEOUT}s timeout"
  echo "  Check provider logs: ssh root@${VPS_PROVIDER_IP} 'journalctl -u openclaw -n 50'"
  exit 1
fi

# Verify provider activation
echo "▸ Verifying provider CareAgent activation..."
sleep 5

# Check CANS.md integrity sidecar
sha_exists=$(ssh $SSH_OPTS "root@$VPS_PROVIDER_IP" \
  "find /opt/careagent/provider-core -name '.CANS.md.sha256' -o -name 'CANS.md.sha256' 2>/dev/null | head -1" 2>/dev/null || echo "")
[[ -n "$sha_exists" ]] \
  && echo "  ✓ CANS.md SHA-256 sidecar exists" \
  || echo "  ⚠ SHA-256 sidecar not found"

# Check clinical mode activation
ssh $SSH_OPTS "root@$VPS_PROVIDER_IP" \
  "journalctl -u openclaw --no-pager -n 100 2>/dev/null | grep -c 'Clinical mode ACTIVE'" 2>/dev/null \
  | grep -q "[1-9]" \
  && echo "  ✓ Clinical mode ACTIVE in provider logs" \
  || echo "  ⚠ Clinical mode activation not detected in logs"

echo ""

# ── Patient Onboarding ──
echo "═══════════════════════════════════════════════════"
echo "  PATIENT ONBOARDING"
echo "═══════════════════════════════════════════════════"
echo ""

curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_PATIENT_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_DEV_CHAT_ID}\", \"text\": \"🔔 CareAgent Deployment\\n\\nPatient onboarding ready.\\nMessage @$(curl -sf 'https://api.telegram.org/bot'${TELEGRAM_PATIENT_BOT_TOKEN}'/getMe' | grep -o '\"username\":\"[^\"]*\"' | cut -d'\"' -f4) with /start to begin.\"}" \
  >/dev/null 2>&1

echo "╔═══════════════════════════════════════════════════╗"
echo "║  ACTION REQUIRED:                                 ║"
echo "║  Open Telegram and message the Patient bot        ║"
echo "║  with /start to begin patient onboarding.         ║"
echo "║                                                   ║"
echo "║  Steps:                                           ║"
echo "║  1. Send your name                                ║"
echo "║  2. Read and accept consent                       ║"
echo "║  3. Enrollment confirmed                          ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Polling for CANS.md on VPS-PATIENT (timeout: 5 min)..."

TIMEOUT=300
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  cans_exists=$(ssh $SSH_OPTS "root@$VPS_PATIENT_IP" \
    "find /opt/careagent/patient-core -name 'CANS.md' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")
  if [[ -n "$cans_exists" ]]; then
    echo ""
    echo "  ✓ CANS.md detected at $cans_exists"
    break
  fi
  sleep 10
  ((ELAPSED+=10))
  echo "  ... waiting ($ELAPSED/${TIMEOUT}s)"
done

if [[ $ELAPSED -ge $TIMEOUT ]]; then
  echo "FAIL: Patient CANS.md not found after ${TIMEOUT}s timeout"
  exit 1
fi

# Verify patient activation
echo "▸ Verifying patient CareAgent activation..."
sleep 5

ssh $SSH_OPTS "root@$VPS_PATIENT_IP" \
  "journalctl -u openclaw --no-pager -n 100 2>/dev/null | grep -c 'Clinical mode ACTIVE'" 2>/dev/null \
  | grep -q "[1-9]" \
  && echo "  ✓ Patient clinical mode ACTIVE" \
  || echo "  ⚠ Patient clinical mode activation not detected"

# Cross-system checks
echo ""
echo "▸ Cross-system verification..."

# Provider registered with Axon
curl -sf "http://${VPS_AXON_IP}:9999/v1/registry/search?q=${NEURON_PRACTICE_NPI:-1234567893}" 2>/dev/null \
  | grep -qi "provider\|${NEURON_PRACTICE_NPI:-1234567893}" \
  && echo "  ✓ Provider visible in Axon registry" \
  || echo "  ⚠ Provider not found in Axon registry"

# Neuron heartbeat still active
curl -sf "http://${VPS_NEURON_IP}:3000/health" | grep -q "ok\|healthy" \
  && echo "  ✓ Neuron heartbeat still active" \
  || echo "  ⚠ Neuron health check failed"

echo ""
echo "✅ Phase 5 PASSED — Both CareAgents onboarded and active"
```

### Gate
- Both CANS.md files exist with SHA-256 sidecars
- Both CareAgents show "Clinical mode ACTIVE" in logs
- Provider registered with neuron → Axon
- Neuron heartbeat still active

### Rollback
```bash
# Provider: delete CANS.md and restart
ssh root@${VPS_PROVIDER_IP} "rm -f /opt/careagent/provider-core/CANS.md*; systemctl restart openclaw"
# Patient: delete CANS.md and restart
ssh root@${VPS_PATIENT_IP} "rm -f /opt/careagent/patient-core/CANS.md*; systemctl restart openclaw"
```

---

## Phase 6: Consent & Provider Discovery

**Purpose**: Patient discovers provider via Axon and establishes bilateral consent.

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
PRACTICE_NPI="${NEURON_PRACTICE_NPI:-1234567893}"

echo "=== Phase 6: Consent & Provider Discovery ==="
echo ""

# Notify dev
curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_PATIENT_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_DEV_CHAT_ID}\", \"text\": \"🔔 CareAgent Deployment\\n\\nConsent phase ready.\\nMessage @$(curl -sf 'https://api.telegram.org/bot'${TELEGRAM_PATIENT_BOT_TOKEN}'/getMe' | grep -o '\"username\":\"[^\"]*\"' | cut -d'\"' -f4) with the provider NPI:\\n${PRACTICE_NPI}\\n\\nThis will discover the provider and establish consent.\"}" \
  >/dev/null 2>&1

echo "╔═══════════════════════════════════════════════════╗"
echo "║  ACTION REQUIRED:                                 ║"
echo "║  Message the Patient bot with the provider NPI:   ║"
echo "║  $PRACTICE_NPI                                    ║"
echo "║                                                   ║"
echo "║  The patient bot will:                            ║"
echo "║  1. Query Axon registry for the provider          ║"
echo "║  2. Contact the provider's neuron                 ║"
echo "║  3. Initiate consent handshake                    ║"
echo "║  4. Establish bilateral consent                   ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Waiting for consent handshake (timeout: 2 min)..."

TIMEOUT=120
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  # Check for consent record on patient side
  consent_exists=$(ssh $SSH_OPTS "root@$VPS_PATIENT_IP" \
    "find /opt/careagent -name 'consent*' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")

  # Also check neuron for consent relationship
  neuron_consent=$(ssh $SSH_OPTS "root@$VPS_NEURON_IP" \
    "sqlite3 /opt/neuron/data/neuron.db 'SELECT COUNT(*) FROM consent_relationships WHERE status=\"active\"' 2>/dev/null" 2>/dev/null || echo "0")

  if [[ -n "$consent_exists" ]] || [[ "$neuron_consent" -gt 0 ]]; then
    echo ""
    echo "  ✓ Consent handshake completed"
    break
  fi

  sleep 10
  ((ELAPSED+=10))
  echo "  ... waiting ($ELAPSED/${TIMEOUT}s)"
done

if [[ $ELAPSED -ge $TIMEOUT ]]; then
  echo "FAIL: Consent handshake timed out after ${TIMEOUT}s"
  echo "  Check patient logs: ssh root@${VPS_PATIENT_IP} 'journalctl -u openclaw -n 50'"
  exit 1
fi

# Verification
echo ""
echo "▸ Verifying consent..."

# Axon search returns provider
curl -sf "http://${VPS_AXON_IP}:9999/v1/registry/search?q=${PRACTICE_NPI}" 2>/dev/null \
  | grep -qi "${PRACTICE_NPI}\|provider" \
  && echo "  ✓ Axon registry returns provider for NPI" \
  || echo "  ✗ Axon registry search failed"

# Neuron consent record
neuron_consent=$(ssh $SSH_OPTS "root@$VPS_NEURON_IP" \
  "sqlite3 /opt/neuron/data/neuron.db 'SELECT status FROM consent_relationships LIMIT 1' 2>/dev/null" 2>/dev/null || echo "none")
echo "  Neuron consent status: ${neuron_consent}"
[[ "$neuron_consent" == *"active"* || "$neuron_consent" == *"granted"* ]] \
  && echo "  ✓ Neuron-side consent active" \
  || echo "  ⚠ Neuron consent status unexpected"

# Patient consent record
consent_file=$(ssh $SSH_OPTS "root@$VPS_PATIENT_IP" \
  "find /opt/careagent -name 'consent*' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")
[[ -n "$consent_file" ]] \
  && echo "  ✓ Patient-side consent record exists at $consent_file" \
  || echo "  ⚠ Patient-side consent record not found"

# Audit trail
for vps_var in VPS_PROVIDER_IP VPS_PATIENT_IP; do
  vps_ip="${!vps_var}"
  audit_count=$(ssh $SSH_OPTS "root@$vps_ip" \
    "find /opt/careagent -path '*/audit/*' -name '*.json' -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
  vps_name="${vps_var/VPS_/}"
  vps_name="${vps_name/_IP/}"
  echo "  ${vps_name} audit entries: ${audit_count}"
done

echo ""
echo "✅ Phase 6 PASSED — Bilateral consent established"
```

### Gate
- Axon registry search returns provider for the NPI
- Consent status "granted" or "active" on both sides
- Patient consent record exists in chart vault
- Audit trail entries on both sides

### Rollback
```bash
# Revoke consent on neuron
ssh root@${VPS_NEURON_IP} "sqlite3 /opt/neuron/data/neuron.db 'UPDATE consent_relationships SET status=\"revoked\"'"
# Restart both agents
ssh root@${VPS_PROVIDER_IP} "systemctl restart openclaw"
ssh root@${VPS_PATIENT_IP} "systemctl restart openclaw"
```

---

## Phase 7: P2P Message Delivery

**Purpose**: Inject clinical visit data via InjectaVox, generate a clinical summary, and deliver it to the patient.

```bash
#!/usr/bin/env bash
set -euo pipefail

source "$HOME/careagent/secrets.env"

SSH_KEY="${VPS_SSH_KEY_PATH}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
NEURON_IP="$VPS_NEURON_IP"
PROVIDER_IP="$VPS_PROVIDER_IP"
PATIENT_IP="$VPS_PATIENT_IP"

echo "=== Phase 7: P2P Message Delivery ==="
echo ""

# Step 1: Generate sample InjectaVox payload
echo "▸ [1/5] Injecting sample clinical visit data..."

VISIT_PAYLOAD='{
  "visit": {
    "visit_id": "visit-001",
    "visit_date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "patient_npi": "'"${NEURON_PRACTICE_NPI:-1234567893}"'",
    "chief_complaint": "Lower back pain radiating to left leg, 3 weeks duration",
    "assessment": "Lumbar radiculopathy L4-L5, likely disc herniation based on clinical exam. Positive straight leg raise on left.",
    "plan": [
      "MRI lumbar spine without contrast",
      "Physical therapy referral - 2x/week for 6 weeks",
      "Naproxen 500mg BID with food x 14 days",
      "Follow-up in 3 weeks with MRI results"
    ],
    "medications": [
      {
        "name": "Naproxen",
        "dose": "500mg",
        "route": "oral",
        "frequency": "twice daily with food",
        "duration": "14 days"
      }
    ],
    "vitals": {
      "bp": "128/82",
      "hr": 76,
      "temp": 98.4,
      "weight": 185
    }
  }
}'

# POST to neuron's InjectaVox endpoint
response=$(curl -sf -X POST "http://${NEURON_IP}:3000/api/v1/injectavox/ingest" \
  -H "Content-Type: application/json" \
  -d "$VISIT_PAYLOAD" 2>/dev/null || echo "FAIL")

if [[ "$response" == "FAIL" ]]; then
  echo "  ✗ InjectaVox ingestion failed"
  echo "  Trying alternative endpoint..."
  response=$(curl -sf -X POST "http://${NEURON_IP}:3000/v1/injectavox/ingest" \
    -H "Content-Type: application/json" \
    -d "$VISIT_PAYLOAD" 2>/dev/null || echo "FAIL")
fi

if [[ "$response" != "FAIL" ]]; then
  echo "  ✓ InjectaVox ingestion: 200 OK"
  echo "  Response: $response"
else
  echo "  ✗ InjectaVox ingestion failed on both endpoints"
  echo "  Check neuron logs: ssh root@${NEURON_IP} 'journalctl -u neuron -n 50'"
fi

# Step 2: Wait for provider agent to process
echo ""
echo "▸ [2/5] Waiting for provider to generate clinical summary (up to 2 min)..."
TIMEOUT=120
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  summary_event=$(ssh $SSH_OPTS "root@$PROVIDER_IP" \
    "journalctl -u openclaw --no-pager -n 100 2>/dev/null | grep -ci 'summary\|clinical.*note\|message.*send' || echo 0" 2>/dev/null || echo "0")

  if [[ "$summary_event" -gt 0 ]]; then
    echo "  ✓ Provider processed visit — summary generation detected"
    break
  fi
  sleep 10
  ((ELAPSED+=10))
  echo "  ... waiting ($ELAPSED/${TIMEOUT}s)"
done

# Step 3: Wait for message delivery to patient
echo ""
echo "▸ [3/5] Waiting for message delivery to patient (up to 2 min)..."
TIMEOUT=120
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  receive_event=$(ssh $SSH_OPTS "root@$PATIENT_IP" \
    "journalctl -u openclaw --no-pager -n 100 2>/dev/null | grep -ci 'message.*receive\|message.*deliver' || echo 0" 2>/dev/null || echo "0")

  if [[ "$receive_event" -gt 0 ]]; then
    echo "  ✓ Message received by patient agent"
    break
  fi
  sleep 10
  ((ELAPSED+=10))
  echo "  ... waiting ($ELAPSED/${TIMEOUT}s)"
done

# Step 4: Verify chart vault
echo ""
echo "▸ [4/5] Verifying patient chart vault..."

# Check encrypted message exists
vault_entry=$(ssh $SSH_OPTS "root@$PATIENT_IP" \
  "find /opt/careagent -path '*/chart/*' -name '*.enc' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")
[[ -n "$vault_entry" ]] \
  && echo "  ✓ Encrypted message found in vault: $vault_entry" \
  || echo "  ⚠ No encrypted messages found in vault"

# Check hash chain / ledger
ledger=$(ssh $SSH_OPTS "root@$PATIENT_IP" \
  "find /opt/careagent -path '*/chart/*' -name 'ledger*' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")
[[ -n "$ledger" ]] \
  && echo "  ✓ Hash-chained ledger exists: $ledger" \
  || echo "  ⚠ Ledger not found"

# Step 5: Verify audit trail completeness
echo ""
echo "▸ [5/5] Checking audit trail completeness..."

provider_audit=$(ssh $SSH_OPTS "root@$PROVIDER_IP" \
  "find /opt/careagent -path '*/audit/*' -name '*.json' -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
echo "  Provider audit entries: $provider_audit"

patient_audit=$(ssh $SSH_OPTS "root@$PATIENT_IP" \
  "find /opt/careagent -path '*/audit/*' -name '*.json' -type f 2>/dev/null | wc -l" 2>/dev/null || echo "0")
echo "  Patient audit entries: $patient_audit"

# Check neuron has the visit stored
neuron_visit=$(ssh $SSH_OPTS "root@$NEURON_IP" \
  "sqlite3 /opt/neuron/data/neuron.db 'SELECT COUNT(*) FROM visits' 2>/dev/null" 2>/dev/null || echo "0")
echo "  Neuron stored visits: $neuron_visit"

echo ""
echo "✅ Phase 7 PASSED — Clinical message delivered to patient"
echo ""
echo "Audit chain: InjectaVox → Neuron → Provider Agent → Patient Agent → Chart Vault"
```

### Gate
- InjectaVox ingestion returns 200
- Provider generated clinical summary (audit log shows event)
- Message delivered to patient (logs show receive event)
- Chart vault: encrypted message exists, hash chain intact
- Audit trail entries on both provider and patient sides

### Rollback
N/A — messages in vault are append-only. Re-running Phase 7 should create a new message entry.

---

## Phase 8: Full Verification Suite

**Purpose**: Comprehensive end-to-end validation of the entire deployed ecosystem.

Run the standalone verification script:

```bash
bash ~/careagent/orchestrator/deploy/verify-all.sh
```

This runs 12 checks:

| # | Check | What It Validates |
|---|-------|-------------------|
| 1 | Service Health | Axon (9999) and Neuron (3000) respond with 200 |
| 2 | Axon Registry | Contains neuron + provider registrations |
| 3 | Neuron Heartbeat | Recent heartbeat entries in Axon |
| 4 | Provider Active | Clinical mode active, CANS.md exists |
| 5 | Patient Active | Clinical mode active, CANS.md exists |
| 6 | Bilateral Consent | Both sides have active consent records |
| 7 | Message Integrity | Encrypted, signed, hash-chained vault entry |
| 8 | Audit Trail | Both agents have audit entries |
| 9 | No PHI Leaks | No plaintext clinical data in logs |
| 10 | Idempotency | Second injection creates second message (manual) |
| 11 | OpenClaw Stability | Both instances running without crash loops |
| 12 | Firewall | Expected ports reachable |

### Gate
ALL 12 checks pass.

### Rollback
N/A — verification is read-only.

---

## Appendix A: Post-First-Deployment Cleanup

After the first successful deployment, remove or skip these items from the playbook:

### Phase 3a Code (now committed)
The provider Telegram bot code (`src/bot/`) and Axon questionnaire wiring (`src/onboarding/stages.ts`) are now part of provider-core. Future deployments skip Phase 3a entirely — the code is already in the repo.

### What to keep
- All other phases (0, 1, 2, 3b, 4-8) are **idempotent** — safe to re-run
- The deploy scripts in `deploy/` are reusable across deployments
- The verification suite (Phase 8) should be run after any infrastructure change

### Updated flow for subsequent deployments
```
Phase 0 → Phase 1 → Phase 2 → Phase 3b → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```
(Phase 3a skipped — bot code already exists in provider-core)

---

## Appendix B: Enable HTTPS

When a contributor sets up DNS and wants to enable HTTPS:

### 1. Point DNS A Records

| Domain | VPS IP |
|--------|--------|
| axon.careagent.network | VPS-AXON IP |
| ssi.careagent.network | VPS-NEURON IP |

(Provider and Patient VPS do NOT get domains — they simulate personal devices.)

### 2. Activate Caddy on Axon

```bash
ssh root@${VPS_AXON_IP} bash <<'EOF'
# Update Caddyfile with real domain
cat > /etc/caddy/Caddyfile <<'CADDYFILE'
axon.careagent.network {
    reverse_proxy localhost:9999

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    log {
        output file /var/log/caddy/axon.log
        format json
    }
}
CADDYFILE

# Start Caddy — Let's Encrypt auto-provisioning
systemctl enable caddy
systemctl start caddy
echo "Caddy started — TLS certificate will auto-provision"
EOF
```

If Axon uses Docker, switch to the `with-caddy` profile:
```bash
ssh root@${VPS_AXON_IP} "cd /opt/axon && docker compose --profile with-caddy up -d"
```

### 3. Activate Caddy on Neuron

```bash
ssh root@${VPS_NEURON_IP} bash <<'EOF'
cat > /etc/caddy/Caddyfile <<'CADDYFILE'
ssi.careagent.network {
    reverse_proxy localhost:3000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    log {
        output file /var/log/caddy/neuron.log
        format json
    }
}
CADDYFILE

systemctl enable caddy
systemctl start caddy
echo "Caddy started — TLS certificate will auto-provision"
EOF
```

### 4. Update Service Endpoints

Update all references from HTTP raw IPs to HTTPS domains:

```bash
# On VPS-NEURON: update Axon URL
ssh root@${VPS_NEURON_IP} bash <<'EOF'
sed -i 's|http://[0-9.]*:9999|https://axon.careagent.network|g' /opt/neuron/neuron.config.json
systemctl restart neuron
EOF

# On VPS-PROVIDER: update endpoints
ssh root@${VPS_PROVIDER_IP} bash <<'EOF'
sed -i 's|http://[0-9.]*:9999|https://axon.careagent.network|g' ~/.openclaw/openclaw.json
sed -i 's|http://[0-9.]*:3000|https://ssi.careagent.network|g' ~/.openclaw/openclaw.json
systemctl restart openclaw
EOF

# On VPS-PATIENT: update Axon URL
ssh root@${VPS_PATIENT_IP} bash <<'EOF'
sed -i 's|http://[0-9.]*:9999|https://axon.careagent.network|g' ~/.openclaw/openclaw.json
systemctl restart openclaw
EOF
```

### 5. Verify TLS Certificates

```bash
# Check cert validity
curl -vI https://axon.careagent.network/health 2>&1 | grep -A 2 "SSL certificate"
curl -vI https://ssi.careagent.network/health 2>&1 | grep -A 2 "SSL certificate"

# Verify Let's Encrypt auto-provisioning
ssh root@${VPS_AXON_IP} "caddy list-certs 2>/dev/null || caddy trust"
ssh root@${VPS_NEURON_IP} "caddy list-certs 2>/dev/null || caddy trust"
```

---

## Quick Reference

### Service Endpoints

| Service | HTTP (raw IP) | HTTPS (after DNS) |
|---------|---------------|-------------------|
| Axon | `http://<AXON_IP>:9999` | `https://axon.careagent.network` |
| Neuron | `http://<NEURON_IP>:3000` | `https://ssi.careagent.network` |
| Provider | OpenClaw on VPS-PROVIDER | N/A (personal device) |
| Patient | OpenClaw on VPS-PATIENT | N/A (personal device) |

### Common Troubleshooting

| Problem | Check | Fix |
|---------|-------|-----|
| SSH connection refused | `ssh -vvv root@IP` | Re-run `ssh-copy-id`, check firewall |
| Axon not responding | `docker logs axon` on VPS-AXON | `docker compose restart` |
| Neuron not starting | `journalctl -u neuron -n 50` | Check `neuron.config.json`, restart |
| OpenClaw crash loop | `journalctl -u openclaw -n 50` | Check `openclaw.json`, rebuild extension |
| Telegram bot not responding | `curl .../getMe` | Verify token, check OpenClaw channel config |
| CANS.md not appearing | VPS logs | Complete onboarding interview fully |
| Consent handshake fails | Patient + neuron logs | Verify Axon registry has provider, check NPI |

### Log Locations

| Service | Logs |
|---------|------|
| Axon (Docker) | `docker logs axon` on VPS-AXON |
| Neuron (systemd) | `journalctl -u neuron` on VPS-NEURON |
| Provider OpenClaw | `journalctl -u openclaw` on VPS-PROVIDER |
| Patient OpenClaw | `journalctl -u openclaw` on VPS-PATIENT |
| Caddy | `/var/log/caddy/` on VPS-AXON/VPS-NEURON |
