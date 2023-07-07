import fs from "fs-extra";
import chokidar from "chokidar";
import path from "path";
import os from "os";
import ignore from "ignore";
import { cosmiconfigSync } from "cosmiconfig";
import { logAndRedraw } from "./shared/logAndRedraw.js";

const CLI_NAME = "physical-link";

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
 * Starts watching changes in packages
 *
 * @param {Object} options
 * @param {string=} options.config
 * @param {string=} options.project
 */
export function physicalLink({ config: configPath, project: projectPath }) {
  const project = projectPath || process.cwd();
  const explorer = cosmiconfigSync(CLI_NAME, {
    packageProp: CLI_NAME,
  });
  const result = configPath
    ? explorer.load(path.resolve(configPath))
    : explorer.search();
  if (!result) {
    console.warn(`No ${CLI_NAME} configuration found.`);
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
      `No matching dependencies were found in the ${CLI_NAME} config file.`
    );
    return;
  }

  logAndRedraw(
    "Watching dependencies:\n" +
      matchingDeps.map((d) => `  ${d.name}`).join("\n")
  );

  for (let dep of matchingDeps) {
    const ig = ignore();
    ig.add(defaultIgnorePatterns);
    const depPackageJSON = fs.readJsonSync(
      path.resolve(dep.from, "./package.json")
    );

    const gitignorePath = path.join(dep.from, ".gitignore");
    const npmignorePath = path.join(dep.from, ".npmignore");
    if (fs.existsSync(npmignorePath)) {
      const npmignore = fs.readFileSync(npmignorePath).toString();
      if (npmignore.trim() !== "") {
        ig.add(npmignore);
      }
    } else if (fs.existsSync(gitignorePath)) {
      // npm uses `.gitignore` only if `.npmignore` is not found:
      // https://docs.npmjs.com/cli/v9/using-npm/developers#keeping-files-out-of-your-package
      const gitignore = fs.readFileSync(gitignorePath).toString();
      if (gitignore.trim() !== "") {
        ig.add(gitignore);
      }
    }

    if (depPackageJSON.main) {
      // do not ignore the whole folder from the "main" field
      ig.add(`!${path.dirname(depPackageJSON.main)}`);
    }
    if (depPackageJSON.files) {
      // do not ignore files from the "files" field
      depPackageJSON.files.forEach((/** @type {string} */ path) => {
        ig.add(`!${path}`);
      });
    }

    const watcher = chokidar.watch(dep.from, {
      ignored: (src) =>
        src === dep.from ? false : ig.ignores(path.relative(dep.from, src)),
    });

    watcher.on("all", () => {
      logAndRedraw(
        [
          "Watching dependencies:",
          ...matchingDeps.map((d) => `  ${d.name}`),
          "",
          "",
          `Last change detected in: ${dep.name}`,
          `Timestamp: ${new Date().toLocaleString()}`,
        ].join("\n")
      );

      const filter = ig.createFilter();
      fs.copySync(dep.from, dep.to, {
        overwrite: true,
        filter: (src) =>
          dep.from === src ? true : filter(path.relative(dep.from, src)),
      });
    });
  }
}
