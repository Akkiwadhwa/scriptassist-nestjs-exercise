import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { ObservabilityService } from '../../common/observability/observability.service';

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject('JWT_REFRESH_SERVICE')
    private readonly refreshJwtService: JwtService,
    private readonly observability: ObservabilityService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const response = this.buildAuthResponse(user);
    this.observability.record('auth.login', { userId: user.id });
    return response;
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    const user = await this.usersService.create(registerDto);

    const response = this.buildAuthResponse(user);
    this.observability.record('auth.register', { userId: user.id });
    return response;
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(refreshTokenDto.refreshToken);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findOne(payload.sub);

    if (!user.refreshTokenHash || !payload.jti) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const matches = await bcrypt.compare(payload.jti, user.refreshTokenHash);

    if (!matches) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const response = this.buildAuthResponse(user);
    this.observability.record('auth.refresh', { userId: user.id });
    return response;
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    if (!requiredRoles?.length) {
      return true;
    }

    const user = await this.usersService.findOne(userId);
    return requiredRoles.includes(user.role);
  }

  private async buildAuthResponse(user: User) {
    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  private sanitizeUser(user: User) {
    const { id, email, name, role } = user;
    return { id, email, name, role };
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.rotateRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async rotateRefreshToken(userId: string) {
    const tokenId = randomUUID();
    await this.usersService.setCurrentRefreshToken(userId, tokenId);

    return this.refreshJwtService.sign({
      sub: userId,
      jti: tokenId,
      type: 'refresh',
    });
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return (await this.refreshJwtService.verifyAsync(token)) as RefreshTokenPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
