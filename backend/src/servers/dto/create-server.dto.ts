import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength, IsObject } from 'class-validator';

export class CreateServerDto {
  @ApiProperty({ example: 1 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  planId!: number;

  @ApiProperty({ example: 'my-server-01', description: '3-32 chars, letters/numbers/dash/underscore' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'name can only contain letters, numbers, dash and underscore',
  })
  name!: string;

  @ApiProperty({ example: 'ghcr.io/library/nginx:alpine', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ description: 'Optional environment variables specific to the selected game image', required: false, type: Object })
  @IsObject()
  @IsOptional()
  env?: Record<string, string>;

  @ApiProperty({
    required: false,
    description: 'SteamCMD settings for Steam-based servers (e.g., GMod, CS:GO). If provided, the server will be provisioned via SteamCMD automatically.',
    type: Object,
    example: { appId: 4020, branch: 'public', args: ['-tickrate', '66'] },
  })
  @IsObject()
  @IsOptional()
  steam?: { appId: number; branch?: string; args?: string[] };

  @ApiProperty({
    required: false,
    description: 'For ADMIN/OWNER only: create the server for this user id.',
    example: 123,
  })
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @IsOptional()
  userId?: number;
}