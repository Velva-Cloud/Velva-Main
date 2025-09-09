import { IsBoolean, IsNumberString, IsOptional, IsString } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumberString()
  pricePerMonth?: string;

  @IsOptional()
  @IsString()
  resources?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}