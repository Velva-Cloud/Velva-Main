import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ example: 2, description: 'Target plan id' })
  @Transform(({ value }) => (value === null || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  planId?: number;

  @ApiPropertyOptional({ example: 1, description: 'Assign to node id (leave unset to keep unchanged)' })
  @Transform(({ value }) => (value === null || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  nodeId?: number;

  @ApiPropertyOptional({ example: 5, description: 'Transfer ownership to another user id' })
  @Transform(({ value }) => (value === null || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}