import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { Role as PanelRole } from '../common/roles.enum';
import { RolesGuard } from '../common/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private plans: PlansService) {}

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
  async listAll() {
    return this.plans.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const resources = dto.resources ? JSON.parse(dto.resources) : {};
    return this.plans.create({
      name: dto.name,
      pricePerMonth: dto.pricePerMonth,
      resources,
      isActive: dto.isActive ?? true,
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const patch: any = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.pricePerMonth !== undefined) patch.pricePerMonth = dto.pricePerMonth;
    if (dto.resources !== undefined) patch.resources = JSON.parse(dto.resources);
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    return this.plans.update(id, patch);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(PanelRole.ADMIN, PanelRole.OWNER)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.plans.delete(id);
  }
}