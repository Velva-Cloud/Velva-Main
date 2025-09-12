import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// Use CommonJS require to avoid ESM/CJS interop issues in runtime bundles
// eslint-disable-next-line @typescript-eslint/no-var-requires
const forge = require('node-forge');

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

@Injectable()
export class PkiService {
  private readonly logger = new Logger(PkiService.name);
  private caKeyPath = process.env.CA_KEY_PATH || path.resolve(process.cwd(), 'data/ca.key');
  private caCertPath = process.env.CA_CERT_PATH || path.resolve(process.cwd(), 'data/ca.crt');

  private caKeyPem?: string;
  private caCertPem?: string;

  constructor() {
    this.loadOrCreateCA();
  }

  private loadOrCreateCA() {
    try {
      if (fs.existsSync(this.caKeyPath) && fs.existsSync(this.caCertPath)) {
        this.caKeyPem = fs.readFileSync(this.caKeyPath, 'utf8');
        this.caCertPem = fs.readFileSync(this.caCertPath, 'utf8');
        return;
      }
      this.logger.warn('CA not found. Generating a new CA (development default). Provide CA_KEY_PATH/CA_CERT_PATH in production.');
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = (Date.now()).toString();
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
      const attrs = [{ name: 'commonName', value: 'VelvaCloud-CA' }];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.setExtensions([
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true },
        { name: 'subjectKeyIdentifier' },
      ]);
      cert.sign(keys.privateKey, forge.md.sha256.create());

      const caKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
      const caCertPem = forge.pki.certificateToPem(cert);

      ensureDir(this.caKeyPath);
      fs.writeFileSync(this.caKeyPath, caKeyPem, { mode: 0o600 });
      fs.writeFileSync(this.caCertPath, caCertPem, { mode: 0o644 });

      this.caKeyPem = caKeyPem;
      this.caCertPem = caCertPem;
    } catch (e: any) {
      this.logger.error('Failed to generate/load CA', e?.message || e);
      throw e;
    }
  }

  getCaCertPem() {
    return this.caCertPem!;
  }

  private getCaKey() {
    return forge.pki.privateKeyFromPem(this.caKeyPem!);
  }

  signCsr(csrPem: string, days = 825): string {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) {
      throw new Error('Invalid CSR (verification failed)');
    }

    const cert = forge.pki.createCertificate();
    cert.serialNumber = String(Math.floor(Math.random() * 1e16));
    cert.publicKey = csr.publicKey;
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);

    // Subject from CSR
    cert.setSubject(csr.subject.attributes);
    // Issuer from CA
    const caCert = forge.pki.certificateFromPem(this.caCertPem!);
    cert.setIssuer(caCert.subject.attributes);

    // Copy extensions from CSR if present
    const extReq = csr.getAttribute({ name: 'extensionRequest' }) as any;
    if (extReq && extReq.extensions) {
      cert.setExtensions(extReq.extensions);
    } else {
      cert.setExtensions([{ name: 'basicConstraints', cA: false }]);
    }

    cert.sign(this.getCaKey(), forge.md.sha256.create());
    return forge.pki.certificateToPem(cert);
  }

  // Extract a simple fingerprint string from CSR public key
  fingerprintFromCsr(csrPem: string): string {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const asn1 = forge.pki.publicKeyToAsn1(csr.publicKey);
    const der = forge.asn1.toDer(asn1).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    return md.digest().toHex();
  }

  // Verify a signature (base64) over a message using CSR public key
  verifySignature(csrPem: string, message: string, signatureBase64: string): boolean {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const pkey = csr.publicKey as forge.pki.rsa.PublicKey;
    const sigBytes = forge.util.decode64(signatureBase64);
    const md = forge.md.sha256.create();
    md.update(message, 'utf8');
    try {
      return pkey.verify(md.digest().bytes(), sigBytes);
    } catch {
      return false;
    }
  }
}