import { IsBoolean, IsJSON, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // Accept decimal as string (e.g., "9.99")
  @IsNumberString()
  pricePerMonth!: string;

  // Accept JSON string; frontend can send stringified JSON, or an object in Update
  @IsString()
  resources!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}