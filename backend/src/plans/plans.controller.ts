import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role as PanelRole } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private plans: PlansService, private prisma: PrismaService, private stripe: StripeService) {}

  // Public - list active plans
  @Get()
  async list() {
    return this.plans.listActive();
  }

  // Admin endpoints
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Get('admin')
  async listAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    return this.plans.listAllPaged(p, ps);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Post()
  async create(@Body() dto: CreatePlanDto, @Req() req: any) {
    const resources = dto.resources ? JSON.parse(dto.resources) : {};
    const created = await this.plans.create({
      name: dto.name,
      pricePerMonth: dto.pricePerMonth,
      resources,
      isActive: dto.isActive ?? true,
    });
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'plan_create', planId: created.id } },
    });
    return created;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto, @Req() req: any) {
    const patch: any = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.pricePerMonth !== undefined) patch.pricePerMonth = dto.pricePerMonth;
    if (dto.resources !== undefined) patch.resources = JSON.parse(dto.resources);
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    const updated = await this.plans.update(id, patch);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'plan_update', planId: id, patch } },
    });
    return updated;
  }

  // Update pricePerGB and rotate Stripe per-GB price
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Post(':id/pergb')
  async setPerGB(@Param('id', ParseIntPipe) id: number, @Body() body: { pricePerGB: number; deactivateOld?: boolean }, @Req() req: any) {
    const perGB = Number(body?.pricePerGB);
    if (!perGB || perGB <= 0 || perGB > 100000) {
      throw new BadRequestException('pricePerGB must be a positive number');
    }
    const result = await this.stripe.setPerGBPrice(id, perGB, !!body?.deactivateOld);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'plan_set_pergb', planId: id, pricePerGB: perGB } },
    });
    return result;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const deleted = await this.plans.delete(id);
    const userId = req?.user?.userId ?? null;
    await this.prisma.log.create({
      data: { userId, action: 'plan_change', metadata: { event: 'plan_delete', planId: id } },
    });
    return deleted;
  }
}