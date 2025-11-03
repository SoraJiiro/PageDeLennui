#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mkdir -p data

if [[ ! -f ./gen_sid_key.sh ]]; then
  echo "Erreur: gen_sid_key.sh introuvable à la racine." >&2
  exit 1
fi

CLE_SID="$(bash ./gen_sid_key.sh)"
if [[ -z "${CLE_SID}" ]]; then
  echo "Erreur: génération de CLE_SID a échoué." >&2
  exit 1
fi

cat > .env <<EOF
PORT=7750
CLE_SID=${CLE_SID}
EOF

echo "> Dossier data/ créé"
echo "> Fichier .env créé"
