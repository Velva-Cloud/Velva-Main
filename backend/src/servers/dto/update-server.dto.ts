import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateServerDto {
  @ApiPropertyOptional({ example: 'new-name-01', description: '3-32 chars, letters/numbers/dash/underscore' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'name can only contain letters, numbers, dash and underscore',
  })
  name?: string;

  @ApiPropertyOptional({ example: 'stopped', enum: ['running', 'stopped', 'suspended'] })
  @IsOptional()
  @IsString()
  @IsIn(['running', 'stopped', 'suspended'])
  status?: 'running' | 'stopped' | 'suspended';
}