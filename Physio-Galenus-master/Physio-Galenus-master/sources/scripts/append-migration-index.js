#!/usr/bin/env node

// Adapted from https://gist.github.com/beevelop/e2b3e66085ed3e53aebc

const args = process.argv.slice(2);
const dirPath = args.pop();
const migrationName = args.pop();
if (!migrationName) return;

const path = require("path");
const fs = require("fs");

const getMostRecent = function (dir, cb) {
  const _dir = path.resolve(dir);
  fs.readdir(_dir, function (_, files) {
    const sorted = files
      .map(function (v) {
        const filepath = path.resolve(_dir, v);
        return {
          name: v,
          time: fs.statSync(filepath).mtime.getTime(),
        };
      })
      .sort(function (a, b) {
        return b.time - a.time;
      })
      .map(function (v) {
        return v.name;
      });

    if (sorted.length > 0) {
      cb(null, sorted[0]);
    }
  });
};

getMostRecent(dirPath, function (err, recent) {
  if (err) {
    console.error(err);
    return;
  }
  const filename = recent.split(".").slice(0, -1).join(".");
  fs.appendFileSync(`${dirPath}/index.ts`, `export * from './${filename}';\n`);
  console.log(`Migration ${recent} has been automatically added into index.ts successfully`);
});
