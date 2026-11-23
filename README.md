# EcoRAEE Cloud

Trazabilidad de RAEE con frontend React, API en Express y base de datos SQL. Corre en local con SQLite o en AWS con S3, EC2, RDS (SQL Server), IAM y SNS.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/` | Frontend React, separado en pantallas, componentes, servicios y estilos |
| `index.html`, `vite.config.js` | Punto de entrada y configuración de Vite |
| `server/` | Backend: API REST con Express, validaciones y reglas de negocio |
| `dist/` | Frontend de producción generado al compilar |
| `database/sqlite.sql` | Esquema y datos de prueba para SQLite (se crea solo al primer arranque) |
| `database/sqlserver.sql` | Mismo modelo para SQL Server (el script del avance anterior) |
| `server/aws.js` | S3, SNS y Secrets Manager; se activan con variables de entorno |
| `server/migrate.js` | Copia los datos de SQLite a SQL Server en RDS |
| `infra/` | Políticas IAM, arranque de EC2 y servicio systemd |

## Ejecutar con SQLite (lo más simple)

Requiere Node.js 22.13 o superior.

```
npm install
npm start
```

`npm start` compila React con Vite y luego inicia Express. Abre http://localhost:3000. La base se crea en `database/ecoraee.db`. Para reiniciar los datos, borra ese archivo.

Para desarrollo con recarga en caliente, ejecuta en dos terminales:

```
npm run dev:api
npm run dev
```

Vite sirve el frontend en http://127.0.0.1:5173 y reenvía las solicitudes `/api` al backend local en el puerto 3000.

## Ejecutar con SQL Server

1. Abre `database/sqlserver.sql` en SSMS y ejecútalo (crea la base `EcoRAEE` con datos de prueba).
2. Habilita el inicio de sesión con usuario y contraseña de SQL Server y el protocolo TCP/IP (puerto 1433).
3. En PowerShell:

```
$env:DB_DRIVER="mssql"; $env:DB_USER="sa"; $env:DB_PASSWORD="tu_clave"
npm install
npm start
```

Variables opcionales: `DB_HOST` (localhost), `DB_PORT` (1433), `DB_NAME` (EcoRAEE), `PORT` (3000).

## Qué hace cada parte

- **Frontend:** React + Vite; 11 pantallas más el panel. Cada una lista, busca, crea, edita y elimina. Los formularios validan antes de enviar y muestran el error junto al campo. Los dispositivos incluyen historial y registro de movimientos.
- **Backend:** `GET/POST/PUT/DELETE /api/<tabla>` para cada entidad. Valida tipos, rangos, formatos y listas de valores. Responde 400 (datos), 404 (no existe), 409 (duplicado o relación) y 500 (error interno) con mensajes claros.
- **Reglas de negocio:**
  - Un traslado no puede superar la capacidad mensual de su ruta ni usar una ruta inactiva.
  - Una ruta no puede tener el mismo origen y destino.
  - El estado de un dispositivo solo cambia por transiciones válidas y cada cambio crea un evento de trazabilidad en la misma transacción.
  - Un dispositivo no pasa a Evaluado sin una evaluación técnica registrada.
- **Base de datos:** 13 tablas con llaves primarias y foráneas, UNIQUE, CHECK y valores por defecto, iguales al modelo físico del avance.

## Pruebas rápidas para el video (5 minutos)

1. Panel: muestra en qué etapa está cada equipo.
2. Dispositivos > Nuevo dispositivo: envía vacío para ver las validaciones, luego guarda uno.
3. Trazabilidad del dispositivo nuevo: intenta pasarlo a Evaluado (falla por falta de evaluación), crea la evaluación en Evaluaciones y repite.
4. Traslados > Nuevo traslado con un peso mayor a la capacidad de la ruta: muestra el rechazo.
5. Organizaciones: intenta eliminar una con sedes y muestra el error de relación.
6. Trazabilidad de un dispositivo > Adjuntar evidencia: sube una foto y ábrela desde Evidencias.
7. Muestra en SSMS (o en la tabla `evento_trazabilidad`) que los registros quedaron guardados.

## Despliegue en AWS (Parte III)

Arquitectura: el frontend compilado vive en un bucket S3 con hosting estático. El navegador llama a la API en EC2 (puerto 3000). La API guarda los datos en RDS SQL Server Express, las evidencias en un segundo bucket S3 privado y publica en SNS cada cambio de estado. EC2 usa un rol IAM, así que el código no tiene claves.

```
Navegador ──> S3 (frontend)
    │
    └──> EC2: Express :3000 ──> RDS SQL Server (subred privada)
                  ├──> S3 evidencias (privado, URL temporal al descargar)
                  ├──> Secrets Manager (usuario y clave de RDS)
                  └──> SNS ecoraee-movimientos (correo al cambiar de estado)
```

Orden sugerido, probando cada etapa antes de pasar a la siguiente:

1. **S3 frontend.** Bucket con hosting estático y la política `infra/s3-web-bucket-policy.json`. Compila con `VITE_API_URL=http://<ip-o-dns-de-ec2>:3000 npm run build` y sube `dist/`.
2. **S3 evidencias.** Bucket privado (bloqueo de acceso público activo, cifrado SSE-S3). Solo EC2 lo usa.
3. **IAM.** Rol `ecoraee-ec2-role` con `infra/iam/ec2-trust-policy.json` y la política propia `infra/iam/ec2-backend-policy.json` (reemplaza BUCKET, REGION y CUENTA). Grupos para el equipo con políticas administradas por AWS (por ejemplo `AmazonEC2ReadOnlyAccess`) y la política propia `infra/iam/frontend-deploy-policy.json` para quien publica el frontend.
4. **RDS.** SQL Server Express, sin acceso público, con un security group que solo acepta el 1433 desde el security group de EC2. Guarda usuario y clave en Secrets Manager como `ecoraee/rds`.
5. **EC2.** Amazon Linux 2023 con el rol del paso 3 y `infra/ec2-user-data.sh` como datos de usuario. Security group: 3000 abierto y 22 solo desde tu IP. Completa `/etc/ecoraee.env` (ver `.env.example`) y ejecuta `sudo systemctl start ecoraee`. Prueba con `curl http://localhost:3000/api/health`.
6. **Datos.** Ejecuta `database/sqlserver.sql` en RDS y luego `npm run migrate -- database/ecoraee.db` para copiar la base local (sube también a S3 las evidencias guardadas en local).
7. **SNS (opcional).** Tema `ecoraee-movimientos` con una suscripción de correo. Define `SNS_TOPIC_ARN` y reinicia el servicio.

`CORS_ORIGIN` debe tener la dirección exacta del sitio de S3; la API rechaza otros orígenes del navegador.
