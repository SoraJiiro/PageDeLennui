#!/bin/bash

SERVICE_NAME="anti-clicker.service"
SCRIPT_PATH="/usr/local/bin/anti_clicker.sh"

# Vérifie root
if [ "$EUID" -ne 0 ]; then
  echo "Lance ce script avec sudo."
  exit 1
fi

echo "Installation de l'anti-clicker..."

# Crée le script principal
cat << 'EOF' > $SCRIPT_PATH
#!/bin/bash
while true
do
    pkill -fi clicker
    sleep 2
done
EOF

chmod +x $SCRIPT_PATH

# Crée le service systemd
cat << EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=Anti Clicker Blocker
After=network.target

[Service]
ExecStart=$SCRIPT_PATH
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

# Recharge systemd
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo "Installation terminée."
echo "Le service démarre maintenant automatiquement au boot."