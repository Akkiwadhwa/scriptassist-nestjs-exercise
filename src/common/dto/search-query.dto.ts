import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive search term applied to relevant fields' })
  @IsOptional()
  @IsString()
  search?: string;
}
