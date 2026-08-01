import { Test } from '@nestjs/testing';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const originalEnv = process.env.SECRETS_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = originalEnv;
  });

  async function buildService(): Promise<CryptoService> {
    const moduleRef = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();
    return moduleRef.get(CryptoService);
  }

  it('lança se SECRETS_ENCRYPTION_KEY nao estiver configurada', async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    await expect(buildService()).rejects.toThrow(
      'SECRETS_ENCRYPTION_KEY nao configurada.',
    );
  });

  describe('com chave configurada', () => {
    beforeEach(() => {
      process.env.SECRETS_ENCRYPTION_KEY = 'test-secret-key-para-os-testes';
    });

    it('faz roundtrip encrypt -> decrypt preservando o texto original', async () => {
      const service = await buildService();
      const plainText = 'super-secreto-123';
      const encrypted = service.encrypt(plainText);
      expect(service.decrypt(encrypted)).toBe(plainText);
    });

    it('gera IV diferente a cada chamada (mesmo texto -> ciphertexts diferentes)', async () => {
      const service = await buildService();
      const a = service.encrypt('mesmo-valor');
      const b = service.encrypt('mesmo-valor');
      expect(a).not.toBe(b);
      expect(service.decrypt(a)).toBe('mesmo-valor');
      expect(service.decrypt(b)).toBe('mesmo-valor');
    });

    it('lança em payload malformado (sem os 3 segmentos)', async () => {
      const service = await buildService();
      expect(() => service.decrypt('so-um-pedaco')).toThrow(
        'Payload criptografado invalido.',
      );
      expect(() => service.decrypt('a.b')).toThrow(
        'Payload criptografado invalido.',
      );
    });

    it('lança se o authTag (GCM) foi adulterado', async () => {
      const service = await buildService();
      const encrypted = service.encrypt('valor-integro');
      const [iv, authTag, data] = encrypted.split('.');
      const tamperedAuthTag = Buffer.from(authTag, 'base64');
      tamperedAuthTag[0] = tamperedAuthTag[0] ^ 0xff;
      const tampered = [iv, tamperedAuthTag.toString('base64'), data].join('.');
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('lança se o ciphertext foi adulterado', async () => {
      const service = await buildService();
      const encrypted = service.encrypt('valor-integro');
      const [iv, authTag, data] = encrypted.split('.');
      const tamperedData = Buffer.from(data, 'base64');
      tamperedData[0] = tamperedData[0] ^ 0xff;
      const tampered = [iv, authTag, tamperedData.toString('base64')].join('.');
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('duas instancias com a MESMA chave conseguem descriptografar uma a outra', async () => {
      const serviceA = await buildService();
      const serviceB = await buildService();
      const encrypted = serviceA.encrypt('compartilhado');
      expect(serviceB.decrypt(encrypted)).toBe('compartilhado');
    });

    it('instancia com chave DIFERENTE nao consegue descriptografar', async () => {
      const serviceA = await buildService();
      const encrypted = serviceA.encrypt('compartilhado');
      process.env.SECRETS_ENCRYPTION_KEY =
        'outra-chave-completamente-diferente';
      const serviceB = await buildService();
      expect(() => serviceB.decrypt(encrypted)).toThrow();
    });
  });
});
