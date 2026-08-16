import { IChangelog } from '@common-interfaces/changelog.interface';
import { FilterChangelogChangesListDto } from '@common-request-dto/filter-changelog-changes-list.dto';
import { isDevelopment } from '@common-utils/environment-utils';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { join } from 'path';
import { Logger } from 'winston';
import { readChangelogFile } from './changelog.functions';

@Injectable()
export class ChangelogService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async list(query?: FilterChangelogChangesListDto): Promise<IChangelog[]> {
    const paths = isDevelopment()
      ? [process.cwd(), 'dist', 'CHANGELOG.md']
      : [process.cwd(), 'CHANGELOG.md'];
    const fullPath = join(...paths);
    this.logger.info(`Loading changelog file from '${fullPath}'...`);
    let changelogs = await readChangelogFile(fullPath, query && query.data);

    if (query && query.metadata) {
      const { orderBy } = query.metadata;
      if (orderBy && orderBy.date) {
        changelogs = changelogs.sort((a, b) =>
          orderBy.date === 'ASC'
            ? new Date(a.date).getTime() - new Date(b.date).getTime()
            : new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      }
    }

    return changelogs;
  }
}
