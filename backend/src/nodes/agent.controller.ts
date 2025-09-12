import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { PkiService } from '../common/pki.service';

function randomNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Node.js < 19 workaround
import * as nodeCrypto from 'crypto';
function randomNonceNode() {
  return nodeCrypto.randomBytes(16).toString('hex');
}

@ApiTags('nodes-agent')
@Controller('nodes/agent')
export class NodesAgentController {
  constructor(private prisma: PrismaService, private pki: PkiService) {}

  @ApiOperation({ summary: 'Daemon registration' })
  @Post('register')
  async register(
    @Headers('x-registration-secret') secret: string | undefined,
    @Body()
    body: {
      name?: string;
      location?: string;
      apiUrl: string;
      publicIp?: string;
      capacity?: { cpuCores?: number; memoryMb?: number; diskMb?: number };
      csrPem: string;
    },
  ) {
    const REG = process.env.NODE_REGISTRATION_SECRET || '';
    if (!REG) throw new BadRequestException('Registration not enabled');
    if (!secret || secret !== REG) throw new BadRequestException('Invalid registration secret');
    if (!body || !body.apiUrl || !body.csrPem) throw new BadRequestException('Missing apiUrl or csrPem');

    const fingerprint = this.pki.fingerprintFromCsr(body.csrPem);
    const nonce = (globalThis.crypto && (randomNonce as any)()) || randomNonceNode();

    // Either update existing by apiUrl/fingerprint or create new
    const existing = await this.prisma.node.findFirst({
      where: { OR: [{ apiUrl: body.apiUrl }, { csrFingerprint: fingerprint }] },
    });

    let node;
    if (existing) {
      node = await this.prisma.node.update({
        where: { id: existing.id },
        data: {
          name: body.name || existing.name,
          location: body.location || existing.location,
          publicIp: body.publicIp || existing.publicIp,
          apiUrl: body.apiUrl,
          capacityCpuCores: body.capacity?.cpuCores ?? existing.capacityCpuCores,
          capacityMemoryMb: body.capacity?.memoryMb ?? existing.capacityMemoryMb,
          capacityDiskMb: body.capacity?.diskMb ?? existing.capacityDiskMb,
          csrPem: body.csrPem,
          csrFingerprint: fingerprint,
          registrationNonce: nonce,
          approved: existing.approved || false,
          status: 'offline',
        },
        select: { id: true, approved: true, registrationNonce: true },
      });
    } else {
      node = await this.prisma.node.create({
        data: {
          name: body.name || 'New node',
          location: body.location || 'Unknown',
          ip: body.publicIp || '0.0.0.0',
          status: 'offline',
          capacity: 0,
          publicIp: body.publicIp || null,
          apiUrl: body.apiUrl,
          capacityCpuCores: body.capacity?.cpuCores ?? null,
          capacityMemoryMb: body.capacity?.memoryMb ?? null,
          capacityDiskMb: body.capacity?.diskMb ?? null,
          csrPem: body.csrPem,
          csrFingerprint: fingerprint,
          approved: false,
          registrationNonce: nonce,
        },
        select: { id: true, approved: true, registrationNonce: true },
      });
    }

    await this.prisma.log.create({
      data: { userId: null, action: 'plan_change', metadata: { event: 'node_register', nodeId: node.id, apiUrl: body.apiUrl } },
    });

    return { nodeId: node.id, approved: node.approved, nonce: node.registrationNonce };
  }

  @ApiOperation({ summary: 'Daemon poll for approval and certificates' })
  @Post('poll')
  async poll(
    @Body()
    body: {
      nodeId: number;
      signatureBase64: string;
    },
  ) {
    const node = await this.prisma.node.findUnique({ where: { id: Number(body.nodeId) } });
    if (!node || !node.csrPem || !node.registrationNonce) throw new BadRequestException('Invalid node');
    // Verify signature over nonce using CSR public key
    const ok = this.pki.verifySignature(node.csrPem, node.registrationNonce, body.signatureBase64);
    if (!ok) throw new BadRequestException('Signature verification failed');

    if (!node.approved) {
      return { approved: false };
    }

    const caCertPem = this.pki.getCaCertPem();
    if (!node.nodeCertPem) {
      throw new BadRequestException('Node is approved but certificate is not ready yet');
    }

    // rotate nonce
    const nextNonce = randomNonceNode();
    await this.prisma.node.update({ where: { id: node.id }, data: { registrationNonce: nextNonce } });

    return { approved: true, caCertPem, nodeCertPem: node.nodeCertPem, nonce: nextNonce };
  }

  @ApiOperation({ summary: 'Daemon heartbeat' })
  @Post('heartbeat')
  async heartbeat(
    @Body()
    body: {
      nodeId: number;
      signatureBase64: string;
    },
  ) {
    const node = await this.prisma.node.findUnique({ where: { id: Number(body.nodeId) } });
    if (!node || !node.csrPem || !node.registrationNonce) throw new BadRequestException('Invalid node');

    const ok = this.pki.verifySignature(node.csrPem, node.registrationNonce, body.signatureBase64);
    if (!ok) throw new BadRequestException('Signature verification failed');

    const nextNonce = randomNonceNode();
    await this.prisma.node.update({
      where: { id: node.id },
      data: { lastSeenAt: new Date(), status: 'online', registrationNonce: nextNonce },
    });

    return { ok: true, nonce: nextNonce, serverTime: new Date().toISOString() };
  }
}