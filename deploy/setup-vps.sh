#!/bin/bash
set -e

echo "=========================================="
echo "  Sales Machine CRM — VPS Setup"
echo "=========================================="

export DEBIAN_FRONTEND=noninteractive

# 1. System update
echo "[1/8] Mise à jour système..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install essentials
echo "[2/8] Installation des dépendances système..."
apt-get install -y -qq \
  curl wget git unzip software-properties-common \
  build-essential libssl-dev libffi-dev \
  nginx certbot python3-certbot-nginx \
  ca-certificates gnupg lsb-release

# 3. Install Python 3.12
echo "[3/8] Installation Python 3.12..."
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -qq
apt-get install -y -qq python3.12 python3.12-venv python3.12-dev python3-pip

# 4. Install Node.js 20 LTS
echo "[4/8] Installation Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# 5. Install Docker
echo "[5/8] Installation Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

# Install Docker Compose plugin
if ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

# 6. Install ODBC Driver 17 for SQL Server
echo "[6/8] Installation ODBC Driver 17..."
if ! odbcinst -q -d -n "ODBC Driver 17 for SQL Server" &>/dev/null; then
  curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/$(lsb_release -rs)/prod $(lsb_release -cs) main" > /etc/apt/sources.list.d/mssql-release.list
  apt-get update -qq
  ACCEPT_EULA=Y apt-get install -y -qq msodbcsql17 unixodbc-dev
fi

# 7. Install Tailscale
echo "[7/8] Installation Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "[8/8] Dépendances installées."

echo ""
echo "=========================================="
echo "  Dépendances OK — prêt pour le déploiement"
echo "=========================================="
