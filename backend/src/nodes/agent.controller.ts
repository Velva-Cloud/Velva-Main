import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { PkiService } from '../common/pki.service';

// Node.js < 19 workaround for crypto.getRandomValues
import * as nodeCrypto from 'crypto';
function randomNonceNode() {
  return nodeCrypto.randomBytes(16).toString('hex');
}

@ApiTags('nodes-agent')
@Controller('nodes/agent')
export class NodesAgentController {
  constructor(private prisma: PrismaService, private pki: PkiService) {}

  @ApiOperation({ summary: 'Daemon registration (supports one-time join codes)' })
  @Post('register')
  async register(
    @Headers('x-registration-secret') secret: string | undefined,
    @Headers('x-join-code') joinCodeHeader: string | undefined,
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
    if (!body || !body.apiUrl || !body.csrPem) throw new BadRequestException('Missing apiUrl or csrPem');

    // Prefer one-time join code if provided
    let joinCode: { id: number; code: string } | null = null;
    if (joinCodeHeader) {
      const now = new Date();
      const jc = await this.prisma.nodeJoinCode.findUnique({ where: { code: joinCodeHeader } });
      if (!jc || jc.used || jc.expiresAt <= now) {
        throw new BadRequestException('Invalid or expired join code');
      }
      joinCode = { id: jc.id, code: jc.code };
    } else {
      // Fallback to static registration secret (legacy)
      const REG = process.env.NODE_REGISTRATION_SECRET || '';
      if (!REG) throw new BadRequestException('Registration not enabled');
      if (!secret || secret !== REG) throw new BadRequestException('Invalid registration secret');
    }

    const fingerprint = this.pki.fingerprintFromCsr(body.csrPem);
    const nonce = randomNonceNode();

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

    // Consume join code if used
    if (joinCode) {
      await this.prisma.nodeJoinCode.update({
        where: { id: joinCode.id },
        data: { used: true, usedAt: new Date(), usedNodeId: node.id },
      });
    }

    // Optional: auto-approve nodes in development for easier local testing
    if (process.env.AUTO_APPROVE_NODES === 'true') {
      try {
        const nodeCertPem = this.pki.signCsr(body.csrPem);
        await this.prisma.node.update({
          where: { id: node.id },
          data: { approved: true, nodeCertPem },
        });
        node.approved = true;
      } catch {
        // If signing fails, leave node pending
      }
    }

    await this.prisma.log.create({
      data: { userId: null, action: 'plan_change', metadata: { event: 'node_register', nodeId: node.id, apiUrl: body.apiUrl, method: joinCode ? 'join_code' : 'secret' } },
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
    const ok = this.pki.verifySignature(node.csrPem, node.registrationNonce, body.signatureBase64);
    if (!ok) throw new BadRequestException('Signature verification failed');

    if (!node.approved) return { approved: false };

    const caCertPem = this.pki.getCaCertPem();
    if (!node.nodeCertPem) throw new BadRequestException('Node is approved but certificate is not ready yet');

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