import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskFilterDto } from './dto/task-filter.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { TaskBatchAction, TaskBatchOperationDto } from './dto/task-batch.dto';
import { TaskPriority } from './enums/task-priority.enum';
import { ObservabilityService } from '../../common/observability/observability.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private observability: ObservabilityService,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksRepository.manager.transaction(async (manager) => {
      const task = manager.create(Task, createTaskDto);
      const savedTask = await manager.save(Task, task);
      await this.enqueueStatusUpdates([{ taskId: savedTask.id, status: savedTask.status }]);
      this.observability.record('task.created', { taskId: savedTask.id });
      return savedTask;
    });
  }

  async findAll(filter: TaskFilterDto = {} as TaskFilterDto): Promise<PaginatedResult<Task>> {
    const normalized = this.normalizePagination(filter);
    const query = this.buildTasksQuery(normalized);
    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page: normalized.page,
        limit: normalized.limit,
        hasNext: normalized.page * normalized.limit < total,
      },
    };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return this.tasksRepository.manager.transaction(async (manager) => {
      const task = await manager.findOne(Task, { where: { id } });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const previousStatus = task.status;
      manager.merge(Task, task, updateTaskDto);
      const updatedTask = await manager.save(Task, task);

      if (previousStatus !== updatedTask.status) {
        await this.enqueueStatusUpdates([
          { taskId: updatedTask.id, status: updatedTask.status },
        ]);
      }

      this.observability.record('task.updated', {
        taskId: updatedTask.id,
        previousStatus,
        newStatus: updatedTask.status,
      });

      return updatedTask;
    });
  }

  async remove(id: string): Promise<void> {
    const deleteResult = await this.tasksRepository.delete(id);

    if (!deleteResult.affected) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    this.observability.record('task.deleted', { taskId: id });
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository.find({ where: { status } });
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    const updateResult = await this.tasksRepository
      .createQueryBuilder()
      .update(Task)
      .set({ status: status as TaskStatus })
      .where('id = :id', { id })
      .returning('*')
      .execute();

    if (!updateResult.affected) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return updateResult.raw[0] as Task;
  }

  async getStatistics() {
    const result = await this.tasksRepository
      .createQueryBuilder('task')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN task.status = :completed THEN 1 ELSE 0 END)`, 'completed')
      .addSelect(
        `SUM(CASE WHEN task.status = :inProgress THEN 1 ELSE 0 END)`,
        'inProgress',
      )
      .addSelect(`SUM(CASE WHEN task.status = :pending THEN 1 ELSE 0 END)`, 'pending')
      .addSelect(
        `SUM(CASE WHEN task.priority = :highPriority THEN 1 ELSE 0 END)`,
        'highPriority',
      )
      .setParameters({
        completed: TaskStatus.COMPLETED,
        inProgress: TaskStatus.IN_PROGRESS,
        pending: TaskStatus.PENDING,
        highPriority: TaskPriority.HIGH,
      })
      .getRawOne();

    return {
      total: Number(result?.total ?? 0),
      completed: Number(result?.completed ?? 0),
      inProgress: Number(result?.inProgress ?? 0),
      pending: Number(result?.pending ?? 0),
      highPriority: Number(result?.highPriority ?? 0),
    };
  }

  async processBatch(operation: TaskBatchOperationDto) {
    const taskIds = Array.from(new Set(operation.tasks));

    if (!taskIds.length) {
      return { action: operation.action, updated: 0, deleted: 0 };
    }

    switch (operation.action) {
      case TaskBatchAction.COMPLETE: {
        const response = await this.bulkUpdateStatus(taskIds, TaskStatus.COMPLETED, operation.action);
        this.observability.record('task.batch', {
          action: operation.action,
          updated: response.updated,
        });
        return response;
      }
      case TaskBatchAction.DELETE: {
        const response = await this.bulkDelete(taskIds, operation.action);
        this.observability.record('task.batch', {
          action: operation.action,
          deleted: response.deleted,
        });
        return response;
      }
      default:
        throw new BadRequestException(`Unsupported action: ${operation.action}`);
    }
  }

  private async bulkUpdateStatus(
    taskIds: string[],
    status: TaskStatus,
    action: TaskBatchAction,
  ) {
    return this.tasksRepository.manager.transaction(async (manager) => {
      const updateResult = await manager
        .createQueryBuilder()
        .update(Task)
        .set({ status })
        .where('id IN (:...ids)', { ids: taskIds })
        .returning(['id', 'status'])
        .execute();

      const updatedRows = (updateResult.raw ?? []) as Array<{ id: string; status: TaskStatus }>;
      if (updatedRows.length) {
        await this.enqueueStatusUpdates(
          updatedRows.map((row) => ({
            taskId: row.id,
            status: row.status,
          })),
        );
      }

      return {
        action,
        updated: updatedRows.length,
        deleted: 0,
      };
    });
  }

  private async bulkDelete(taskIds: string[], action: TaskBatchAction) {
    const deleteResult = await this.tasksRepository
      .createQueryBuilder()
      .delete()
      .from(Task)
      .where('id IN (:...ids)', { ids: taskIds })
      .execute();

    return {
      action,
      updated: 0,
      deleted: deleteResult.affected ?? 0,
    };
  }

  private buildTasksQuery(filter: TaskFilterDto) {
    const query = this.tasksRepository.createQueryBuilder('task');

    if (filter.includeUser) {
      query.leftJoinAndSelect('task.user', 'user');
    }

    if (filter.status) {
      query.andWhere('task.status = :status', { status: filter.status });
    }

    if (filter.priority) {
      query.andWhere('task.priority = :priority', { priority: filter.priority });
    }

    if (filter.userId) {
      query.andWhere('task.userId = :userId', { userId: filter.userId });
    }

    if (filter.dueDateFrom) {
      query.andWhere('task.dueDate >= :dueDateFrom', { dueDateFrom: filter.dueDateFrom });
    }

    if (filter.dueDateTo) {
      query.andWhere('task.dueDate <= :dueDateTo', { dueDateTo: filter.dueDateTo });
    }

    if (filter.search) {
      query.andWhere(
        '(LOWER(task.title) LIKE :search OR LOWER(task.description) LIKE :search)',
        { search: `%${filter.search.toLowerCase()}%` },
      );
    }

    const sortFieldMap: Record<string, string> = {
      createdAt: 'task.createdAt',
      updatedAt: 'task.updatedAt',
      dueDate: 'task.dueDate',
      priority: 'task.priority',
    };

    const sortColumn = sortFieldMap[filter.sortBy ?? 'createdAt'] ?? 'task.createdAt';
    query.orderBy(sortColumn, filter.sortDirection ?? 'DESC');

    query.skip((filter.page - 1) * filter.limit).take(filter.limit);

    return query;
  }

  private normalizePagination(filter: TaskFilterDto = {} as TaskFilterDto): TaskFilterDto {
    const page = Math.max(1, Number(filter?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filter?.limit ?? 25)));

    return {
      ...filter,
      page,
      limit,
      sortDirection: filter?.sortDirection ?? 'DESC',
      includeUser: filter?.includeUser ?? true,
    } as TaskFilterDto;
  }

  private async enqueueStatusUpdates(
    updates: Array<{ taskId: string; status: TaskStatus }>,
  ) {
    if (!updates.length) {
      return;
    }

    await this.taskQueue.addBulk(
      updates.map((update) => ({
        name: 'task-status-update',
        data: update,
      })),
    );
  }
}
