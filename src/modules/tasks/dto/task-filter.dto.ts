import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { SearchQueryDto } from '../../../common/dto/search-query.dto';

export class TaskFilterDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filter by task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority, description: 'Filter by task priority' })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Return tasks created by a specific user (UUID)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Return tasks due after this date (ISO string)' })
  @IsOptional()
  @Type(() => Date)
  dueDateFrom?: Date;

  @ApiPropertyOptional({ description: 'Return tasks due before this date (ISO string)' })
  @IsOptional()
  @Type(() => Date)
  dueDateTo?: Date;

  @ApiPropertyOptional({
    description: 'Include related user entity in the response',
    default: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUser = true;
}
