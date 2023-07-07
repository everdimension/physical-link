#!/usr/bin/env node

import { program } from "commander";
import { physicalLink } from "./index.js";

program
  .version("1.0.0", "-v, --version")
  .description("Link local npm packages to a project")
  .option("-c, --config <path>", "Provide path to custom config")
  .option(
    "-p, --project <path>",
    "Provide path to project (default: current directory)"
  );

program.parse(process.argv);

physicalLink(program.opts());
