import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../../common/security/security.module';
import { ObservabilityModule } from '../../common/observability/observability.module';

@Module({
  imports: [
    UsersModule,
    SecurityModule,
    ObservabilityModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: 'JWT_REFRESH_SERVICE',
      useFactory: (configService: ConfigService) =>
        new JwtService({
          secret: configService.get<string>('jwt.refreshSecret'),
          signOptions: {
            expiresIn: configService.get<string>('jwt.refreshExpiresIn'),
          },
        }),
      inject: [ConfigService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
