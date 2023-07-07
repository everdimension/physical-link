#!/usr/bin/env node

import fs from "fs-extra";
import chokidar from "chokidar";
import path from "path";
import os from "os";
import ignore from "ignore";
import { program } from "commander";
import { cosmiconfigSync } from "cosmiconfig";
import { logAndRedraw } from "./shared/logAndRedraw.js";

const defaultIgnorePatterns = [
  ".git",
  "CVS",
  ".svn",
  ".hg",
  ".lock-wscript",
  ".wafpickle-N",
  ".*.swp",
  ".DS_Store",
  "._*",
  "npm-debug.log",
  ".npmrc",
  "node_modules",
  "config.gypi",
  "*.orig",
  "package-lock.json",
];

/**
 * @param {import('ignore').Ignore} ig
 * @param {string} baseDir
 */
const ignoreFilter =
  (ig, baseDir) =>
  /**
   * @param {string} file
   */
  (file) => {
    const relativePath = path.relative(baseDir, file);
    if (relativePath === "") {
      return false;
    }
    return ig.ignores(relativePath);
  };

/**
 * Starts watching changes in packages
 *
 * @param {Object} options
 * @param {string=} options.config
 * @param {string=} options.project
 */
function start({ config: configPath, project: projectPath }) {
  const project = projectPath || process.cwd();
  const explorer = cosmiconfigSync("deplink", {
    searchPlaces: [
      "package.json",
      ".deplinkrc",
      "deplink.config.js",
      "deplink.config.cjs",
      "deplink.config.json",
    ],
    packageProp: "deplink",
  });
  const result = configPath
    ? explorer.load(path.resolve(configPath))
    : explorer.search();
  if (!result) {
    console.warn("No deplink configuration found.");
    return;
  }

  const config = result.config;
  const packageJSON = fs.readJsonSync(path.resolve(project, "./package.json"));

  /** @type {Array<{ name: string, from: string, to: string }>} */
  let matchingDeps = [];

  for (let dep in packageJSON.dependencies) {
    if (config.manifest[dep]) {
      let from = config.manifest[dep];
      from = from.replace(/^~(?=$|\/|\\)/, os.homedir());
      const resolvedFrom = path.resolve(from);
      const to = path.resolve(project, "./node_modules/", dep);

      matchingDeps.push({ name: dep, from: resolvedFrom, to });
    }
  }

  if (matchingDeps.length === 0) {
    console.warn(
      "No matching dependencies were found in the deplink config file."
    );
    return;
  }

  logAndRedraw(
    "Watching dependencies:\n" + matchingDeps.map((d) => d.name).join("\n")
  );

  for (let dep of matchingDeps) {
    const ig = ignore();
    ig.add(defaultIgnorePatterns);

    // let ignoreFile = null;
    // if (fs.existsSync(path.join(dep.from, ".gitignore"))) {
    //   ignoreFile = fs.readFileSync(path.join(dep.from, ".gitignore"), "utf8");
    // } else if (fs.existsSync(path.join(dep.from, ".npmignore"))) {
    //   ignoreFile = fs.readFileSync(path.join(dep.from, ".npmignore"), "utf8");
    // }
    // if (ignoreFile.trim() !== "") {
    //   ig.add(ignoreFile);
    // }
    // const gitignorePath = path.join(dep.from, ".gitignore");
    // const npmignorePath = path.join(dep.from, ".npmignore");
    // if (fs.existsSync(npmignorePath)) {
    //   const npmignore = fs.readFileSync(npmignorePath).toString();
    //   if (npmignore.trim() !== "") {
    //     ig.add(npmignore);
    //   }
    // } else if (fs.existsSync(gitignorePath)) {
    //   const gitignore = fs.readFileSync(gitignorePath).toString();
    //   if (gitignore.trim() !== "") {
    //     ig.add(gitignore);
    //   }
    // }

    // if (packageJSON.main) {
    //   // do not ignore folder from the "main" field
    //   ig.add(`!${path.dirname(packageJSON.main)}`);
    // }
    // if (packageJSON.files) {
    //   // do not ignore files from the "files" field
    //   packageJSON.files.forEach((path) => {
    //     ig.add(`!${path}`);
    //   });
    // }

    // const gitignorePath = path.join(dep.from, '.gitignore');
    // if (fs.existsSync(gitignorePath)) {
    //     const gitignore = fs.readFileSync(gitignorePath).toString();
    //
    //     if (gitignore.trim() !== "") {
    //         ig.add(gitignore);
    //     }
    // }

    const ignored = ignoreFilter(ig, dep.from);
    const watcher = chokidar.watch(dep.from, {
      // ignored: ignoreFilter(ig, dep.from),
      ignored: ignoreFilter(ig, dep.from),
    });

    watcher.on("all", () => {
      logAndRedraw(
        [
          "Watching dependencies:",
          ...matchingDeps.map((d) => d.name),
          "",
          "",
          `Last change detected in: ${dep.name}`,
          `Timestamp: ${new Date().toLocaleString()}`,
        ].join("\n")
      );

      fs.copySync(dep.from, dep.to, {
        overwrite: true,
        filter: (src) => !ignored(src),
      });
    });
  }
}

program
  .version("1.0.0", "-v, --version")
  .description("hello world")
  .option("-c, --config <path>", "Provide path to custom config")
  .option(
    "-p, --project <path>",
    "Provide path to project (default: current directory)"
  );

program.parse(process.argv);

start(program.opts());
