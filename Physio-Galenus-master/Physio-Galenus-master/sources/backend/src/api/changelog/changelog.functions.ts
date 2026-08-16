import { isDefined } from '../../common/utils/is-defined';
import {
  IChangelog,
  IReadChangelogFileOptions,
} from '../../common/interfaces/changelog.interface';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { EChangelogBlockType } from '../../common/enums/changelog-block.enum';
import { Readable } from 'stream';

type TChangelogEntryServices = {
  PR: string[];
  Trello: string[];
  Jira: string[];
};

type TChangelogLineBuildFields = {
  version: string;
  date: string;
};

type TChangelogLineLabelFields = {
  label: EChangelogBlockType;
};

type TChangelogLineEntryFields = {
  description: string;
  services: TChangelogEntryServices;
};

enum EChangelogLineType {
  Build = 'Build',
  Label = 'Label',
  Entry = 'Entry',
}

const changelogLineBuildRegex = new RegExp(
  /^##\s(?<version>\d+.\d+.\d+).*(?<date>\d{4}-\d+-\d+)/,
);
const changelogLineLabelRegex = new RegExp(/^###\s(?<label>\w+)/);
const changelogLineEntryRegex = new RegExp(
  /^-\s(?<description>.+?(?=(?:\s*\\)|$))(?:\s*\\?\s*(?:(.+?)(?=:)\s*:\s*(.+?)(?=;))?;?\s*(?:(.+?)(?=:)\s*:\s*(.+?)(?=;));?\s*(?:(.+?)(?=:)\s*:\s*(.+?)(?=;))*)?/,
);

/**
 * Reads a full changelog file and parses it into a convenient data structure
 * @param pathOrReadStream a local path or a readable stream storing the changelog
 * @param options an object of options to be considered
 */
export const readChangelogFile = async (
  pathOrReadStream: string | Readable,
  options?: IReadChangelogFileOptions,
): Promise<IChangelog[]> => {
  const { amount } = Object(options);

  const readableStream =
    pathOrReadStream instanceof Readable
      ? pathOrReadStream
      : createReadStream(pathOrReadStream, { encoding: 'utf-8', flags: 'r' });
  const readingInterface = createInterface({
    input: readableStream,
    crlfDelay: Infinity,
  });

  const changelogs: IChangelog[] = [];
  return new Promise((resolve, reject) => {
    readingInterface
      .on('line', (line: string) => {
        let lineType;
        switch (isDefined(line)) {
          case line.startsWith('## '):
            lineType = EChangelogLineType.Build;
            break;
          case line.startsWith('### '):
            lineType = EChangelogLineType.Label;
            break;
          case line.startsWith('- '):
            lineType = EChangelogLineType.Entry;
            break;
        }
        if (!lineType) {
          // Line not identified -> ignore it
          return;
        }

        try {
          switch (lineType) {
            case EChangelogLineType.Build: {
              if (amount && changelogs.length >= amount) {
                readingInterface.close();
                readableStream.destroy();
                readingInterface.removeAllListeners('line');
                return;
              }

              const parsed = parseChangelogLineBuild(line);
              changelogs.push({
                version: parsed.version,
                date: parsed.date,
                blocks: [],
              });
              break;
            }
            case EChangelogLineType.Label: {
              const parsed = parseChangelogLineLabel(line);
              changelogs[changelogs.length - 1].blocks.push({
                label: parsed.label,
                entries: [],
              });
              break;
            }
            case EChangelogLineType.Entry: {
              const parsed = parseChangelogLineEntry(line);
              changelogs[changelogs.length - 1].blocks[
                changelogs[changelogs.length - 1].blocks.length - 1
              ].entries.push({
                description: parsed.description,
                pr: parsed.services.PR,
                trello: parsed.services.Trello,
                jira: parsed.services.Jira,
              });
              break;
            }
          }
        } catch (err) {
          return reject(err);
        }
      })
      .once('close', () => resolve(changelogs));
  });
};

/**
 * Parses and validates a changelog build line, e.g.
 *
 * ```
 * ## 1.0.33 - 2021-01-29
 * ```
 */
const parseChangelogLineBuild = (line: string): TChangelogLineBuildFields => {
  const match = line.match(changelogLineBuildRegex);
  if (!match || !match.groups) {
    throw new Error(
      `A build line did not match correctly: '${match ? match.input : line}'`,
    );
  }

  const { version, date } = match.groups;
  return { version, date };
};

/**
 * Parses and validates a changelog label line, e.g.
 *
 * ```
 * ### Changed
 * ```
 */
const parseChangelogLineLabel = (line: string): TChangelogLineLabelFields => {
  const match = line.match(changelogLineLabelRegex);
  if (!match || !match.groups) {
    throw new Error(
      `A label line did not match correctly: '${match ? match.input : line}'`,
    );
  }

  const { label } = match.groups;
  if (!label || !(label in EChangelogBlockType)) {
    throw new Error(
      `A label name did not match with any of the available ones: '${label}'`,
    );
  }
  return { label: label as EChangelogBlockType };
};

/**
 * Parses and validates a changelog entry line, e.g.
 *
 * ```
 * - Fixed password recovery and password reset routines \ PR: 370; Trello: 1930, 1938; Jira: MG-218, MG-225;
 * ```
 */
const parseChangelogLineEntry = (line: string): TChangelogLineEntryFields => {
  const match = line.match(changelogLineEntryRegex);
  if (!match || !match.groups) {
    throw new Error(
      `An entry line did not match correctly: '${match ? match.input : line}'`,
    );
  }

  const { description } = match.groups;
  const services: TChangelogEntryServices = {
    PR: [],
    Trello: [],
    Jira: [],
  };
  for (let i = 2; i < match.length; i++) {
    // The even indexes have the service names; the odd ones have the identifiers
    if (i % 2 === 0) {
      if (match[i] && !(match[i] in services)) {
        throw new Error(
          `A service name did not match with any of the available ones: '${match[i]}'`,
        );
      }
      continue;
    }

    services[match[i - 1]] = match[i] && match[i].replace(/ /g, '').split(',');
  }

  return {
    description,
    services,
  };
};
