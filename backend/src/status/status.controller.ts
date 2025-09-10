import { Controller, Get } from '@nestjs/common';
import { StatusService } from './status.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(private service: StatusService) {}

  @Get('system')
  async system() {
    return this.service.getSystemStatus();
  }
}