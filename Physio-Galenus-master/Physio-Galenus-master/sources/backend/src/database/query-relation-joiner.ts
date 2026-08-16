import { createHash } from 'crypto';
import { difference } from '../common/utils/array-utils';

type TRelationAlias = {
  relation: string;
  alias: string;
  joined: boolean;
};

export type TJoin = {
  path: string;
} & TRelationAlias;

export type TJoinIndexed = { [path: string]: TRelationAlias };

const replacerAlias = '*join*';
const genericAlias = replacerAlias.replace(/\*/g, '');

/**
 * Generator used to build automatic alias for joined relations. Hash function has to be any that generate hashes with
 * length lesser than 64 bytes (i.e. max alias length for postgres) - `genericAlias.length`
 *
 * @param input the string to hash
 */
const generateAlias = (input: string) =>
  `${genericAlias}${createHash('sha1').update(input, 'utf8').digest('hex')}`;

/**
 * Convenient class used to build relations easily for the ORM to be joined.
 *
 * This class arises to solve the problem that exists when the relations have to be joined dynamically based only on the
 * relation path (i.e., entity.relation1.relation2, etc.). Since in that case the intermediate relations have to be
 * joined too, this class auto-generates the required aliases and stores them along with the original paths.
 *
 * Common usage pattern:
 *
 * ```
 * const joiner = new QueryRelationJoiner('client', [
 *     'nhsData.dataHistory-gpPractice',
 *     'referredBy.referralState',
 *     'mostRecentAssessment.assessmentState',
 *   ])
 *   .setJoiner(qb.leftJoinAndSelect.bind(qb))
 *   .join();
 *
 * joiner.alias('referredBy');
 * // => 'joind09af7148802544712f5fee9bb97e7e5cf57a5ba'
 *
 * joiner.alias('clubData');
 * // this relation was not preloaded, so join it on fly. => 'join4e9eec9834d5cf1c2357972eb1fc51bfb18244fc'
 * ```
 */
export class QueryRelationJoiner {
  /**
   * The object indexing the relations and related aliases by their path
   */
  private relations: TJoinIndexed = {};

  /**
   * This variable is used to keep track of new paths added to the list of internal relations. If `changes` becomes
   * true, the next call to `join()` will do the actual join of the internal saved relations.
   */
  private changes;

  /**
   * A function used to join the internal saved relations when invoking the `join()` method.
   */
  private joinerFn: (property: string, alias: string) => any = () => null;

  constructor(private entityAlias: string, private paths: string[] = []) {
    this.changes = paths.length > 0;
  }

  /**
   * Add the provided list of paths (['a.b.c', 'f.g', ...]) to the list of internal paths. Multiple invocations are
   * possible, but a call to `join()` is required to join the list of internal relations.
   *
   * @param paths an array of relations separated by dots (.). If accessing an embedded entity within one these paths,
   * use - as separator AFTER the embedded entity.
   */
  addRelations(paths: string[]): QueryRelationJoiner {
    // Generate path parts, flatten and remove duplicates (['a', 'a.b', 'a.b.c', 'a.b.d'])
    const parts = Array.from(
      new Set(
        paths
          .map((p) =>
            p.split('.').map((s, i, l) => l.slice(0, i + 1).join('.')),
          )
          .reduce((acc, current) => acc.concat(current), []),
      ),
    );

    this.changes = difference(this.paths, parts).length > 0;
    this.paths = [...this.paths, ...paths];
    return this;
  }

  /**
   * Specify the join function that will be used from now on by the `join()` method
   *
   * @param joinerFn the join function to use, e.g., leftJoinAndSelect, innerJoin, etc.
   */
  setJoinerFn(
    joinerFn: (property: string, alias: string) => any,
  ): QueryRelationJoiner {
    this.joinerFn = joinerFn;
    this.changes = true;
    return this;
  }

  /**
   * Joins all the stored relations in the database using the provided join function. If not provided, will default to
   * the one specified in a previous call to the `setJoinerFn(...)` method.
   *
   * @param joinerFn the join function to use, e.g., leftJoinAndSelect, innerJoin, etc.
   */
  join(
    joinerFn: (property: string, alias: string) => any = this.joinerFn,
  ): QueryRelationJoiner {
    if (!this.changes || this.paths.length <= 0) {
      // This would prevent to join relations already joined by the joiner function
      return this;
    }

    this.relations = this.generateJoinObjectFromPaths(
      this.entityAlias,
      this.paths,
    );
    Object.values(this.relations).forEach((r) =>
      !r.joined ? (joinerFn(r.relation, r.alias), (r.joined = true)) : null,
    );

    return this;
  }

  /**
   * Returns the total number of saved (joined) relations.
   */
  numRelations(): number {
    return Object.values(this.relations).length;
  }

  /**
   * Retrieve the generated alias for the provided path, i.e., relation in dot notation. If the relation is not found,
   * the path will be added and the generated relations will be joined. For performance reasons, it is recommended to
   * join the relations manually via the constructor or the `addRelations(...).join()` method if they are more than one
   * and also known beforehand.
   *
   * @param path one of the paths already joined or not.
   */
  alias(path: string): string {
    if (!(path in this.relations)) {
      // If the alias is not available, add the relation and join it automatically
      this.addRelations([path]).join();
    }

    // The relation is available; retrieve it and load its alias
    return this.relations[path].alias;
  }

  /**
   * Builds an array of relations aimed to be joined.
   *
   * @param alias usually the root entity parent alias of the relations i.e. the root alias used in the query builder.
   * @param path a relation separated by dots (.). If accessing an embedded entity within the path, use - as separator
   * AFTER the embedded entity.
   */
  private generateJoinListFromPath(alias: string, path: string): TJoin[] {
    if (!path || !alias) {
      return [];
    }
    const splitRelations = path.split('.');

    let currentRelation = alias;
    let nextRelation = splitRelations[0];
    const joins: TJoin[] = [
      {
        path: nextRelation,
        relation: `${currentRelation}.${nextRelation.replace('-', '.')}`,
        alias: replacerAlias,
        joined: false,
      },
    ];

    for (let i = 1; i < splitRelations.length; i++) {
      currentRelation = joins.slice(-1)[0].alias;
      nextRelation = splitRelations[i];

      joins.push({
        path: `${splitRelations.slice(0, i).join('.')}.${nextRelation}`,
        relation: `${currentRelation}.${nextRelation.replace('-', '.')}`,
        alias: replacerAlias,
        joined: false,
      });
    }

    return joins;
  }

  /**
   * The same as the method {@link generateJoinListFromPath} but for multiple paths. It also clean and order the list of
   * generated relations.
   */
  private generateJoinListFromPaths(alias: string, paths: string[]): TJoin[] {
    return (
      paths
        // Generate joins from path
        .map((path) => this.generateJoinListFromPath(alias, path))
        // Flatten array
        .reduce<TJoin[]>((acc, current) => acc.concat(current), [])
        // Remove duplicates
        .filter(
          (join, index, list) =>
            list.findIndex((t) => t.path === join.path) === index,
        )
        // Sort it by path
        .sort((a, b) => (a.path > b.path ? 1 : -1))
        // Replace generic aliases with final aliases
        .map((join, index, list) => {
          join.alias = generateAlias(join.path);
          for (let i = index - 1; i >= 0; i--) {
            if (
              join.path
                .substring(0, join.path.lastIndexOf('.'))
                .startsWith(list[i].path)
            ) {
              join.relation = join.relation.replace(
                replacerAlias,
                list[i].alias,
              );
              break;
            }
          }
          return join;
        })
    );
  }

  /**
   * Builds an object of relations indexing the relation and alias by the path as is in the internal paths array.
   *
   * @see {@link generateJoinListFromPaths}
   */
  private generateJoinObjectFromPaths(
    alias: string,
    paths: string[],
  ): TJoinIndexed {
    return this.generateJoinListFromPaths(alias, paths).reduce<TJoinIndexed>(
      (acc, current) => (
        (acc[current.path] = {
          relation: current.relation,
          alias: current.alias,
          joined:
            current.path in this.relations
              ? this.relations[current.path].joined
              : false,
        }),
        acc
      ),
      {},
    );
  }
}
