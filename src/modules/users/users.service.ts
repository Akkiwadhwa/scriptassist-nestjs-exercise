import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserFilterDto } from './dto/user-filter.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    return this.usersRepository.save(user);
  }

  async findAll(filter: UserFilterDto = {} as UserFilterDto): Promise<PaginatedResult<User>> {
    const normalized = this.normalizePagination(filter);
    const query = this.usersRepository.createQueryBuilder('user');

    if (normalized.search) {
      query.andWhere(
        '(LOWER(user.name) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search: `%${normalized.search.toLowerCase()}%` },
      );
    }

    if (normalized.role) {
      query.andWhere('user.role = :role', { role: normalized.role });
    }

    const sortFieldMap: Record<string, string> = {
      createdAt: 'user.createdAt',
      updatedAt: 'user.updatedAt',
      name: 'user.name',
    };

    const sortColumn = sortFieldMap[normalized.sortBy ?? 'createdAt'] ?? 'user.createdAt';
    query.orderBy(sortColumn, normalized.sortDirection ?? 'DESC');

    query.skip((normalized.page - 1) * normalized.limit).take(normalized.limit);

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

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    
    this.usersRepository.merge(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  async setCurrentRefreshToken(userId: string, refreshTokenId: string): Promise<void> {
    const hash = await bcrypt.hash(refreshTokenId, 10);
    await this.usersRepository.update(userId, {
      refreshTokenHash: hash,
    });
  }

  async removeRefreshToken(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      refreshTokenHash: null,
    });
  }

  private normalizePagination(filter: UserFilterDto = {} as UserFilterDto): UserFilterDto {
    const page = Math.max(1, Number(filter?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filter?.limit ?? 25)));

    return {
      ...filter,
      page,
      limit,
      sortDirection: filter?.sortDirection ?? 'DESC',
    } as UserFilterDto;
  }
}
