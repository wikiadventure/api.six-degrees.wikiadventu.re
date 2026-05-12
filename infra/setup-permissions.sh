#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Configuration variables
PROJECT_DIR="/opt/wikiadventu.re/api.six-degrees.wikiadventu.re"
SECRETS_FILE="$PROJECT_DIR/infra/.env.secrets"
BUILDER_USER="wiki-builder"
BUILDER_GROUP="wiki-builder"

echo "=== Securing Six Degrees API Deployment Permissions ==="

# 1. Verify the user exists
if ! id "$BUILDER_USER" &>/dev/null; then
    echo "[ERROR] User $BUILDER_USER does not exist!"
    echo "Run: sudo useradd -m -s /bin/bash wiki-builder && sudo usermod -aG docker wiki-builder"
    exit 1
fi

# 2. Grant full directory access to the wiki-builder user
if [ -d "$PROJECT_DIR" ]; then
    echo "[1/2] Changing ownership of $PROJECT_DIR to $BUILDER_USER:$BUILDER_GROUP..."
    chown -R $BUILDER_USER:$BUILDER_GROUP "$PROJECT_DIR"
    
    # Ensure sane default read/write/execute permissions for directories, read/write for files
    chmod -R u+rwX,go+rX,go-w "$PROJECT_DIR"
else
    echo "[ERROR] Project directory $PROJECT_DIR does not exist!"
    exit 1
fi

# 3. Secure the secrets file exclusively for root/systemd
if [ -f "$SECRETS_FILE" ]; then
    echo "[2/2] Locking down $SECRETS_FILE..."
    
    # systemd reads EnvironmentFile BEFORE dropping privileges to User=wiki-builder
    # This means we can lock the file entirely to root, making it impossible for 
    # anyone (even wiki-builder) to read the secret directly, but the node app will
    # still get it injected securely into its process memory!
    chown root:root "$SECRETS_FILE"
    chmod 600 "$SECRETS_FILE"
    
    echo "      Secrets are now locked (600) and owned by root."
else
    echo "[WARNING] $SECRETS_FILE does not exist."
    echo "Please create it, add your DOCKER_USERNAME and DOCKER_PAT, and run this script again."
fi

echo "=== Permission setup successfully completed ==="