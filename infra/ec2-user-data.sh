#!/bin/bash
# Arranque de la instancia EC2 (Amazon Linux 2023): instala Node 22, clona la app y la deja como servicio.
set -euo pipefail
dnf install -y git
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs
useradd -r -m -d /opt/ecoraee ecoraee || true
sudo -u ecoraee git clone https://github.com/edison010/ecoraee-cloud /opt/ecoraee/app
cd /opt/ecoraee/app && sudo -u ecoraee npm ci --omit=dev
curl -fsSL -o /opt/ecoraee/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
cp infra/ecoraee.service /etc/systemd/system/ecoraee.service
# Editar /etc/ecoraee.env con los valores reales antes de iniciar (ver .env.example)
touch /etc/ecoraee.env && chmod 600 /etc/ecoraee.env
systemctl daemon-reload && systemctl enable ecoraee
