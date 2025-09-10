import { IsIn, IsInt, IsIP, IsOptional, IsString, Min } from 'class-validator';

export class UpdateNodeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIP()
  ip?: string;

  @IsOptional()
  @IsString()
  @IsIn(['online', 'offline'])
  status?: 'online' | 'offline';

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}