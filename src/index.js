import fs from "fs-extra";
import chokidar from "chokidar";
import path from "path";
import os from "os";
import ignore from "ignore";
import { cosmiconfigSync } from "cosmiconfig";
import { logAndRedraw } from "./shared/logAndRedraw.js";
import { yellow } from "./shared/color-output.js";

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
  const configDir = path.dirname(result.filepath);
  const packageJSON = fs.readJsonSync(path.resolve(project, "./package.json"));

  /** @type {Array<{ name: string, absPath: string, destination: string }>} */
  let matchingDeps = [];

  /** @type {Array<string>} */
  const warnings = [];

  const packageJSONDeps = packageJSON.dependencies || {};
  const packageJSONDevDeps = packageJSON.devDependencies || {};

  for (let dep in config.manifest) {
    if (
      dep in packageJSONDeps === false &&
      dep in packageJSONDevDeps === false
    ) {
      const msg = `Warning: ${dep} is not listed as a dependency of current project. It will be watched and synced anyway.`;
      warnings.push(yellow(msg));
    }
    let depPath = config.manifest[dep];
    depPath = depPath.replace(/^~(?=$|\/|\\)/, os.homedir());
    const absPath = path.resolve(configDir, depPath);
    const destination = path.resolve(project, "./node_modules/", dep);
    matchingDeps.push({ name: dep, absPath, destination });
  }

  if (matchingDeps.length === 0) {
    console.warn(
      `No matching dependencies were found in the ${CLI_NAME} config file.`
    );
    return;
  }

  logAndRedraw(
    [
      ...warnings,
      "Watching dependencies:",
      ...matchingDeps.map((d) => `  ${d.name}`),
    ].join("\n")
  );

  for (let dep of matchingDeps) {
    const ig = ignore();
    ig.add(defaultIgnorePatterns);
    const depPackageJSON = fs.readJsonSync(
      path.resolve(dep.absPath, "./package.json")
    );

    const gitignorePath = path.join(dep.absPath, ".gitignore");
    const npmignorePath = path.join(dep.absPath, ".npmignore");
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
      const dirName = path.dirname(depPackageJSON.main);
      ig.add(`!${path.relative(dep.absPath, path.join(dep.absPath, dirName))}`);
    }
    if (depPackageJSON.files) {
      // do not ignore files from the "files" field
      depPackageJSON.files.forEach((/** @type {string} */ path) => {
        ig.add(`!${path}`);
      });
    }

    const watcher = chokidar.watch(dep.absPath, {
      ignored: (src) =>
        src === dep.absPath
          ? false
          : ig.ignores(path.relative(dep.absPath, src)),
    });

    watcher.on("all", () => {
      logAndRedraw(
        [
          ...warnings,
          "Watching dependencies:",
          ...matchingDeps.map((d) => `  ${d.name}`),
          "",
          "",
          `Last change detected in: ${dep.name}`,
          `Timestamp: ${new Date().toLocaleString()}`,
        ].join("\n")
      );

      const filter = ig.createFilter();
      fs.copySync(dep.absPath, dep.destination, {
        overwrite: true,
        filter: (src) => {
          if (dep.absPath === src) {
            return true;
          }
          return filter(path.relative(dep.absPath, src));
        },
      });
    });
  }
}
