# Physical Link

A small utility library to link package dependencies from your local file system to your Node.js project as if they were regular dependencies

## Features

- Develop npm packages locally and see the results in other local projects
- No monorepos
- No symlinks
- No file: protocol schemas in package.json
- Doesn't break node resolution like symlinks
- Works with any bundler
- Links only the files that npm would [actually publish](https://docs.npmjs.com/cli/v9/using-npm/developers#keeping-files-out-of-your-package)

## Why

This package solves the problems with the [npm link](https://docs.npmjs.com/cli/v9/commands/npm-link) workflow. For more details read [Motivation and Workflow](#motivation-and-workflow)

## Getting Started

Physical Link can be used either as a local or a global utility depending on your workflow.

### Local Installation

Choose this approach if you're ready to commit a config file to your project and share the workflow with other team members.

1. Install Physical Link locally.

   ```
   npm install --save-dev physical-link
   ```

2. Create a `physical-link.config.cjs` file in your project root directory

   This config matches your dependency names to paths on your local system.

   Here's an example of what it might look like:

   ```javascript
   module.exports = {
     manifest: {
       "my-dependency": "~/my-dependency",
       "another-dependency": "../another-dependency",
     },
   };
   ```

   This will tell Physical Link to watch the specified directories for changes, and when they change, Physical Link will copy the whole folders to the `node_modules` folder of your project.

3. Run `physical-link` command in your project root directory using npm scripts or directly through node_modules.

   ```
   npx physical-link
   ```

4. Optionally, add an npm script to your `package.json`. For example, you might want to run physical-link in parallel with your normal development script using [npm-run-all](https://www.npmjs.com/package/npm-run-all)

   ```json
   {
       "scripts": {
           "start": "npm-run-all start:app watch:deps"
           "start:app": "vite dev",
           "watch:deps": "physical-link"
       }
   }
   ```

### Global Installation

Choose this approach if you do not want to alter your project repository in any way or when you're managing multiple projects and want a global configuration for Physical Link.

1. Install Physical Link globally.

   ```
   npm install -g physical-link
   ```

2. Create a `physical-link.config.cjs` file outside your project directory. You can place this anywhere you like.

   Here's an example `physical-link.config.cjs`:

   ```javascript
   module.exports = {
     manifest: {
       "global-dependency": "~/global-dependency",
       "another-global-dependency": "~/another-global-dependency",
     },
   };
   ```

3. Run `physical-link` command, specifying the path to your config file and to the project that uses those dependencies.

   ```
   physical-link --config ~/path/to/your/global/config --project ~/path/to/your-app
   ```

### Note

Physical Link will only watch packages listed in the `manifest` that are also found in the "dependencies" (or "devDependencies") of your project.

## Motivation and Workflow

Let's imagine you're working on a project, we'll call it Project A. Project A has a dependency on a package, let's call it `awesome-package`.

Now, `awesome-package` is a package you're developing locally in another directory.

Normally, you'd have to publish `awesome-package` to the npm registry every time you make a change, then pull/update in Project A to get those changes. This can be a time-consuming process, especially when you're actively developing `awesome-package` and need to test changes in Project A frequently.

With Physical Link, you can drastically simplify this workflow. Here's how:

1. **Set up your `physical-link.config.cjs`**: In your Project A directory, you set up a `physical-link.config.cjs` with the following content:

   ```javascript
   module.exports = {
     manifest: {
       "awesome-package": "~/path/to/awesome-package",
       // ...other local packages you're developing
     },
   };
   ```

2. **Run Physical Link**: Run `physical-link` in your Project A directory.

   ```
   physical-link
   ```

3. **Start Developing**: Now, whenever you make changes to `awesome-package` in its local directory, Physical Link will automatically copy those changes to the `node_modules` folder of Project A. There's no need to manually update or reinstall the package. Physical Link takes care of copying only the files that npm [would publish](would publish).

This way, you can focus on developing `awesome-package` and immediately see the impact of your changes in Project A, without the usual delay or complexity of keeping local packages up-to-date.

## Why use Physical Link instead of npm link?

The `npm link` command allows you to use a package from your local file system in your project by creating a symbolic link in your `node_modules` folder. While this is a very handy feature, it has a couple of major downsides.

First, it can break Node.js module resolution algorithm where you end up with duplicate versions of dependencies. If your project has a dependency on React, and you symlink another module which also has a dependency on React, you might end up with two copies of React in your build. See [more details](https://github.com/parcel-bundler/parcel/issues/4332#issuecomment-1006234257) by author of the Parcel Bundler

Second, some bundlers simply fail to watch changes in symlinked modules. Bundlers already do a lot of work that impacts perfomance and watching symlinked folders can impact the build times for your project significantly.

With Physical Link, you can develop and test your local packages within your project as if they were regular dependencies, without worrying about the issues that come with symbolic links.
