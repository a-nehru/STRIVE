import { EChangelogBlockType } from '../enums/changelog-block.enum';

export interface IChangelog {
  version: string;
  date: string;
  blocks: IChangelogBlock[];
}

export interface IChangelogBlock {
  entries: IChangelogEntry[];
  label: EChangelogBlockType;
}

export interface IChangelogEntry {
  description: string;
  pr?: string[];
  trello?: string[];
  jira?: string[];
}

export interface IReadChangelogFileOptions {
  /**
   * The maximum number of changelogs to retrieve or undefined if all
   */
  amount?: number;
}
