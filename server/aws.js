// Servicios de AWS. Se cargan solo si su variable de entorno existe.
// En EC2 las credenciales salen del rol de la instancia, nunca del código.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const env = process.env;
const region = env.AWS_REGION || 'us-east-1';
const memo = (fn) => { let p; return () => (p ??= fn()); };

const s3 = memo(async () => {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({ region });
});

const sns = memo(async () => {
  const { SNSClient } = await import('@aws-sdk/client-sns');
  return new SNSClient({ region });
});

export const storage = env.S3_BUCKET_EVIDENCIAS ? 's3' : 'local';

export async function dbSecret() {
  if (!env.DB_SECRET_ID) return {};
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const out = await new SecretsManagerClient({ region }).send(new GetSecretValueCommand({ SecretId: env.DB_SECRET_ID }));
  const s = JSON.parse(out.SecretString);
  return { user: s.username, password: s.password, host: s.host, port: s.port };
}

export async function saveFile(key, body, contentType) {
  if (storage === 'local') {
    const file = join('uploads', key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    return `local://${key}`;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await (await s3()).send(new PutObjectCommand({
    Bucket: env.S3_BUCKET_EVIDENCIAS, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256',
  }));
  return `s3://${env.S3_BUCKET_EVIDENCIAS}/${key}`;
}

// Devuelve una URL temporal de S3 o el contenido local.
export async function openFile(url) {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(url);
  if (m) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return { redirect: await getSignedUrl(await s3(), new GetObjectCommand({ Bucket: m[1], Key: m[2] }), { expiresIn: 300 }) };
  }
  if (url.startsWith('local://')) return { body: await readFile(join('uploads', url.slice(8))) };
  return null;
}

export async function notify(subject, message) {
  if (!env.SNS_TOPIC_ARN) return;
  try {
    const { PublishCommand } = await import('@aws-sdk/client-sns');
    await (await sns()).send(new PublishCommand({ TopicArn: env.SNS_TOPIC_ARN, Subject: subject.slice(0, 99), Message: message }));
  } catch (e) {
    console.error('SNS:', e.message);
  }
}
