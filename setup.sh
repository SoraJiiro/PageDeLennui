#!/usr/bin/env bash
set -euo pipefail

# Go to repo root (directory of this script)
cd "$(dirname "$0")"

# 1) Create data directory
mkdir -p data

# 2) Generate CLE_SID using the provided generator script
if [[ ! -f ./gen_sid_key.sh ]]; then
  echo "Erreur: gen_sid_key.sh introuvable à la racine." >&2
  exit 1
fi

CLE_SID="$(bash ./gen_sid_key.sh)"
if [[ -z "${CLE_SID}" ]]; then
  echo "Erreur: génération de CLE_SID a échoué." >&2
  exit 1
fi

# 3) Write .env file
cat > .env <<EOF
PORT=7750
CLE_SID=${CLE_SID}
EOF

echo "✔ Dossier data/ créé (ou déjà présent)"
echo "✔ Fichier .env créé avec PORT=7750 et CLE_SID générée"
