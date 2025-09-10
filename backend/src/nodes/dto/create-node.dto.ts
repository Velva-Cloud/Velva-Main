import { IsIn, IsInt, IsIP, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateNodeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  location!: string;

  @IsIP()
  ip!: string;

  @IsOptional()
  @IsString()
  @IsIn(['online', 'offline'])
  status?: 'online' | 'offline';

  @IsInt()
  @Min(1)
  capacity!: number;
}