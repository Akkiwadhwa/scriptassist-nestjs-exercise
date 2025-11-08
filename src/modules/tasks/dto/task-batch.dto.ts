import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum, IsUUID } from 'class-validator';

export enum TaskBatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
}

export class TaskBatchOperationDto {
  @ApiProperty({ enum: TaskBatchAction, description: 'Action to apply to every task' })
  @IsEnum(TaskBatchAction)
  action: TaskBatchAction;

  @ApiProperty({ type: [String], description: 'Task UUIDs to process' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  tasks: string[];
}
