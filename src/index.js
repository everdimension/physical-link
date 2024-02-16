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

    const gitignorePath = path.join(dep.absPath, ".gitignore");
    const npmignorePath = path.join(dep.absPath, ".npmignore");
    if (fs.existsSync(npmignorePath)) {
      ig.add(fs.readFileSync(npmignorePath, "utf8"));
    } else if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, "utf8"));
    }

    // Add files specified in the "files" field of package.json to the ignore list as exceptions
    const depPackageJSONPath = path.resolve(dep.absPath, "package.json");
    if (fs.existsSync(depPackageJSONPath)) {
      const depPackageJSON = fs.readJsonSync(depPackageJSONPath);
      if (depPackageJSON.files) {
        depPackageJSON.files.forEach((/** @type {any} */ file) => {
          ig.add(`!${file}`);
        });
      }
    } else {
      console.error(`package.json not found in ${dep.absPath}. Ensure the path is correct.`);
    }

    const watcher = chokidar.watch(dep.absPath, {
      ignored: (src) => {
        const normalizedSrc = path.normalize(src);
        const normalizedDepAbsPath = path.normalize(dep.absPath);

        // Skip ignore check for the root directory; it's always included
        if (normalizedSrc === normalizedDepAbsPath) {
          return false;
        }

        // Calculate relative path for all other paths
        const relativePath = path.relative(normalizedDepAbsPath, normalizedSrc);
        if (relativePath === '') {
          return false; // Do not ignore the root directory itself
        }

        // For all other paths, proceed with the ignore check
        return ig.ignores(relativePath);
      },
    });

    watcher.on("all", () => {
      logAndRedraw(
        [
          ...warnings,
          "Watching dependencies:",
          ...matchingDeps.map((d) => `  ${d.name}`),
          "",
          `Last change detected in: ${dep.name}`,
          `Timestamp: ${new Date().toLocaleString()}`,
        ].join("\n")
      );

      const filter = ig.createFilter();
      fs.copySync(dep.absPath, dep.destination, {
        overwrite: true,
        filter: (src) => {
          // Correctly use the filter to decide if a file should be copied
          if (path.normalize(dep.absPath) === path.normalize(src)) {
            return true; // Always include the base directory
          }
          // @ts-ignore
          return filter(path.relative(dep.absPath, src));
        },
      });
    });
  }
}
