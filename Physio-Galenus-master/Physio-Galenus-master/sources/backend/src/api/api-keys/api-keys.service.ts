import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { CreateApiKeyDto } from '@common-request-dto/create-api-key.dto';
import { FilterApiKeysDto } from '@common-request-dto/filter-api-keys.dto';
import { UpdateApiKeyDto } from '@common-request-dto/update-api-key.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { isDefined } from '@common-utils/is-defined';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { getValueOrDefault } from '@common-utils/variable-utils';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiKey } from 'src/database/entity';
import { QueryRelationJoiner } from 'src/database/query-relation-joiner';
import { OrderByCondition, Repository } from 'typeorm';
import { AppError } from '../errors/app-error.exception';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeysRepo: Repository<ApiKey>,
  ) {}

  async list(query?: FilterApiKeysDto): Promise<IPaginatedEntities<ApiKey>> {
    const qb = this.apiKeysRepo.createQueryBuilder('apiKey');
    const joiner = new QueryRelationJoiner('apiKey', ['user']).join(
      qb.leftJoinAndSelect.bind(qb),
    );

    if (query && query.data) {
      const { key, username, is_revoked, quota_reset } = query.data;

      qb.where(isDefined(key) ? `apiKey.key = '${key}'` : '1=1');
      qb.andWhere(
        isDefined(username)
          ? `${joiner.alias('user')}.username = '${username}'`
          : '1=1',
      );
      qb.andWhere(
        isDefined(is_revoked) ? `apiKey.is_revoked IS ${is_revoked}` : '1=1',
      );
      qb.andWhere(
        isDefined(quota_reset)
          ? `apiKey.quota_reset = '${quota_reset}'`
          : '1=1',
      );
    }

    const defaultOrderBy: OrderByCondition = {
      [`${joiner.alias('user')}.username`]: 'ASC',
    };
    qb.orderBy(defaultOrderBy);
    if (query && query.metadata) {
      const { orderBy } = query.metadata;
      qb.orderBy(orderBy || defaultOrderBy);
    }

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }

  async get(data: {
    where: 'id' | 'key';
    id?: string;
    key?: string;
  }): Promise<ApiKey> {
    const qb = this.apiKeysRepo.createQueryBuilder('apiKey');
    new QueryRelationJoiner('apiKey', [
      'user.roles.role_to_permissions.permission.permission_category',
      'user.user_to_permissions.permission.permission_category',
    ]).join(qb.leftJoinAndSelect.bind(qb));

    if (!data.where || !data[data.where]) {
      throw new AppError({
        message: 'Please, specify a criteria to fetch an API key (id or key)',
      });
    }
    const apiKey = await qb
      .where(`apiKey.${data.where} = :value`, { value: data[data.where] })
      .getOne();
    return apiKey;
  }

  async create(
    user: FullUserDto,
    createApiKeyDto: CreateApiKeyDto,
  ): Promise<ApiKey> {
    const { data } = createApiKeyDto;

    const apiKey = await this.apiKeysRepo.manager.transaction(async (tem) => {
      const apiKeyRepo = tem.getRepository(ApiKey);

      const apiKey = apiKeyRepo.create({
        ...data,
        user: { id: data.userId },
      });

      await apiKeyRepo.save(apiKey);
      const key = this.generateKey(apiKey);
      await apiKeyRepo.update(apiKey.id, { key });
      apiKey.key = key;

      return apiKey;
    });

    return apiKey;
  }

  async update(
    user: FullUserDto,
    updateApiKeyDto: UpdateApiKeyDto,
    id: string,
  ): Promise<ApiKey> {
    const { data } = updateApiKeyDto;
    const apiKey = await this.get({ where: 'id', id });

    apiKey.description = getValueOrDefault(
      data.description,
      apiKey.description,
    );
    apiKey.is_revoked = getValueOrDefault(data.is_revoked, apiKey.is_revoked);
    apiKey.quota = getValueOrDefault(data.quota, apiKey.quota);
    apiKey.quota_reset = getValueOrDefault(
      data.quota_reset,
      apiKey.quota_reset,
    );

    await this.apiKeysRepo.save(apiKey);
    return apiKey;
  }

  async delete(id: string): Promise<void> {
    const deleteResult = await this.apiKeysRepo.delete({ id });
    if (deleteResult.affected <= 0) {
      throw new AppError({
        message: `API key with ID '${id}' could not be deleted from the database`,
      });
    }
  }

  async consumeQuota(apiKey: ApiKey): Promise<void> {
    apiKey.num_issued_requests = BigInt(apiKey.num_issued_requests) + BigInt(1);
    apiKey.last_issued_request_datetime = new Date();
    await this.apiKeysRepo.save(apiKey);
  }

  private generateKey(apiKey: ApiKey): string {
    return apiKey.id.toLowerCase().replace(/-/g, '');
  }
}
