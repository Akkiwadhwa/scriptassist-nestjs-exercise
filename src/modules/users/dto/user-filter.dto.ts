import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { SearchQueryDto } from '../../../common/dto/search-query.dto';

export class UserFilterDto extends SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Filter users by role',
    enum: ['user', 'admin'],
  })
  @IsOptional()
  @IsIn(['user', 'admin'], { message: 'role must be either "user" or "admin"' })
  role?: string;
}
