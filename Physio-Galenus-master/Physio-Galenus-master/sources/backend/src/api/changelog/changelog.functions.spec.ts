import { readChangelogFile } from './changelog.functions';
import { Readable } from 'stream';

const bufferToStream = (buffer: Buffer): Readable => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return stream;
};

describe('Changelog functions', () => {
  const fullChangelog = `
# Changelog
All notable changes to this project will be documented in this file.

## 0.1.1 - 2022-06-01
### Added
- [Data] Exercise configuration can now be saved on database \\ PR: 37; Trello: 208;
- Env variables are retrieved from parameter store (AWS) \\ PR: 51; Trello: 225;
- [PGT] Added CD pipeline to automatically deploy the application (frontend and backend) to the AWS infrastructure; it can be triggered manually or automatically when merging to the master branch \\ PR: 43; Trello: 87;
- [PGT] Added basic entities \\ PR: 12; Trello: 181;
- [PGT] Added dashboard screen with summarized statistics \\ PR: 33; Trello: 37;
- [PGT] Added endpoints to manage routine progress \\ PR: 37; Trello: 205;
- [PGT] Added endpoints to retrieve routine data from web client \\ PR: 37; Trello: 204, 207;
- [PGT] Added login page \\ PR: 7; Trello: 36;
- [PGT] Added patient creation screen \\ PR: 16; Trello: 184;
- [PGT] Added register screen \\ PR: 19; Trello: 17;
- [PGT] Admin section to manage roles and user permissions \\ PR: 35; Trello: 199;
- [PGT] Create exercise screen \\ PR: 22; Trello: 33;
- [PGT] Create patient profile screen \\ PR: 32; Trello: 28;
- [PGT] Create routine list screen \\ PR: 42; Trello: 214;
- [PGT] Create routine service with CRUD operations \\ PR: 21; Trello: 18;
- [PGT] Create therapist profile screen \\ PR: 39; Trello: 201;
- [PGT] Create user service with CRUD operations \\ PR: 20; Trello: 15;
- [PGT] Created patient service with crud operations \\ PR: 15; Trello: 183;
- [PGT] Integrated husky \\ PR: 18; Trello: 187;
- [PGT] Roles and permission system created \\ PR: 30; Trello: 198;
- [Shared] Added interface IExercise to physio-galenus-shared \\ PR: 34; Trello: 212;

### Changed
- Common code is now located on a shared repo \\ PR: 11; Trello: 182;
- Refactor shared repo as submodule \\ PR: 23; Trello: 191;
- [PGT] Add routine screen \\ PR: 25; Trello: 19;
- [PGT] Improve UI: changed My Patient and Routine sections \\ PR: 55; Trello: 211;
- [PGT] Major refactor and improved UI \\ PR: 57; Trello: 227;
- [PGT] Review UI of login, create account and register patient \\ PR: 28; Trello: 195;

### Fixed
- Fixed deployment of the application using the ecosystem file \\ PR: 53;

### Security
- [PGT] Added endpoint to authenticate user through key token when using PG webapp \\ PR: 8; Trello: 141;
- [PGT] Backend now supports session based authentication \\ PR: 6; Trello: 179;
  `;

  it('should read and process a changelog buffer correctly', async () => {
    const changelogs = await readChangelogFile(
      bufferToStream(Buffer.from(fullChangelog, 'utf8')),
    );

    expect(changelogs).toHaveLength(1);

    expect(changelogs[0].date).toBe('2022-06-01');
    expect(changelogs[0].version).toBe('0.1.1');
    expect(changelogs[0].blocks).toHaveLength(4);

    expect(changelogs[0].blocks[0].label).toBe('Added');
    expect(changelogs[0].blocks[1].label).toBe('Changed');

    expect(changelogs[0].blocks[0].entries).toHaveLength(21);
    expect(changelogs[0].blocks[0].entries[0].description).toBe(
      '[Data] Exercise configuration can now be saved on database',
    );
    expect(changelogs[0].blocks[0].entries[0].pr).toHaveLength(1);
    expect(changelogs[0].blocks[0].entries[0].pr[0]).toBe('37');
    expect(changelogs[0].blocks[0].entries[0].trello).toHaveLength(1);
    expect(changelogs[0].blocks[0].entries[0].trello[0]).toBe('208');
  });

  it('should read and process a changelog buffer correctly, limited to one', async () => {
    const changelogs = await readChangelogFile(
      bufferToStream(Buffer.from(fullChangelog, 'utf8')),
      { amount: 1 },
    );

    expect(changelogs).toHaveLength(1);

    expect(changelogs[0].date).toBe('2022-06-01');
    expect(changelogs[0].version).toBe('0.1.1');
    expect(changelogs[0].blocks).toHaveLength(4);

    expect(changelogs[0].blocks[0].label).toBe('Added');
    expect(changelogs[0].blocks[1].label).toBe('Changed');

    expect(changelogs[0].blocks[0].entries).toHaveLength(21);
    expect(changelogs[0].blocks[0].entries[0].description).toBe(
      '[Data] Exercise configuration can now be saved on database',
    );
    expect(changelogs[0].blocks[0].entries[0].pr).toHaveLength(1);
    expect(changelogs[0].blocks[0].entries[0].pr[0]).toBe('37');
    expect(changelogs[0].blocks[0].entries[0].trello).toHaveLength(1);
    expect(changelogs[0].blocks[0].entries[0].trello[0]).toBe('208');
  });

  it('should fail when parsing a build line of a changelog', async () => {
    expect.assertions(2);

    try {
      await readChangelogFile(
        bufferToStream(Buffer.from('## 0.0.2 - 2022-06-', 'utf8')),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }

    try {
      await readChangelogFile(
        bufferToStream(Buffer.from('## 0.1. - 2022-06-12', 'utf8')),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  it('should fail when parsing a label line of a changelog', async () => {
    expect.assertions(3);

    try {
      await readChangelogFile(
        bufferToStream(
          Buffer.from(
            `
## 0.1.2 - 2022-06-12
### Addedd`,
            'utf8',
          ),
        ),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }

    try {
      await readChangelogFile(
        bufferToStream(
          Buffer.from(
            `
## 0.1.2 - 2022-06-12
### Fixedd`,
            'utf8',
          ),
        ),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }

    try {
      await readChangelogFile(
        bufferToStream(
          Buffer.from(
            `
## 0.1.2 - 2022-06-12
### `,
            'utf8',
          ),
        ),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  it('should fail when parsing a label line of a changelog', async () => {
    expect.assertions(2);

    try {
      await readChangelogFile(
        bufferToStream(
          Buffer.from(
            `
## 0.1.2 - 2022-06-12
### Added
- `,
            'utf8',
          ),
        ),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }

    try {
      await readChangelogFile(
        bufferToStream(
          Buffer.from(
            `
## 0.1.2 - 2022-06-12
### Added
- [Data] Exercise configuration can now be saved on database \\ PRa: 37; Trelllo: 208;`,
            'utf8',
          ),
        ),
      );
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});
