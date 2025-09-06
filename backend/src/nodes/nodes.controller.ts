import { Controller, Get, UseGuards } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('nodes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private service: NodesService) {}

  @Get()
  async list() {
    return this.service.list();
  }
}