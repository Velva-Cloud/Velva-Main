import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(dto.email, dto.password);
    await this.prisma.log.create({
      data: { action: 'login', userId: null, metadata: { event: 'register', email: dto.email } },
    });
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto.email, dto.password);
    await this.prisma.log.create({
      data: { action: 'login', userId: null, metadata: { event: 'login', email: dto.email } },
    });
    return result;
  }

  @Get('oauth/google')
  async oauthGoogle() {
    return this.auth.oauthLogin('google');
  }

  @Get('oauth/discord')
  async oauthDiscord() {
    return this.auth.oauthLogin('discord');
  }
}