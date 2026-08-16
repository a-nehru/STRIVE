import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, RoleToPermission } from '../../database/entity';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { ACLController } from './acl.controller';
import { ACLService } from './acl.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, RoleToPermission])],
  controllers: [ACLController],
  providers: [ACLService, PermissionsGuard],
  exports: [ACLService],
})
export class ACLModule {}
