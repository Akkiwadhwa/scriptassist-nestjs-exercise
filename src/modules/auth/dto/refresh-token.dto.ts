import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned during login/register' })
  @IsString()
  @Length(20, 512)
  refreshToken: string;
}
