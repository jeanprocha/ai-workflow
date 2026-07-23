import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Criptografia de secrets (ADR-007): AES-256-GCM com chave mestre vinda de
 * env var. O valor descriptografado nunca deve ser persistido em log/export.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const secret = process.env.SECRETS_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error('SECRETS_ENCRYPTION_KEY nao configurada.');
    }
    this.key = scryptSync(secret, 'workflow-ai-secrets-salt', 32);
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted]
      .map((buffer) => buffer.toString('base64'))
      .join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, authTagB64, dataB64] = payload.split('.');
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error('Payload criptografado invalido.');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }
}
