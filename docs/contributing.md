# Contributing

## Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of [yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use `yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlite_ai directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

## Running UI tests

The UI tests use Playwright and can be configured with environment variables:

- `PWVIDEO`: Controls video recording during tests (default: `retain-on-failure`)
  - `on`: Record video for all tests
  - `off`: Do not record video
  - `retain-on-failure`: Only keep videos for failed tests
- `PWSLOWMO`: Adds a delay (in milliseconds) between Playwright actions for debugging (default: `0`)

Example usage:

```bash
# Record all test videos
PWVIDEO=on jlpm playwright test

# Slow down test execution by 500ms per action
PWSLOWMO=500 jlpm playwright test

# Combine both options
PWVIDEO=on PWSLOWMO=1000 jlpm playwright test
```

## Development uninstall

```bash
pip uninstall jupyterlite-ai
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop` command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions` folder is located. Then you can remove the symlink named `@jupyterlite/ai` within that folder.

## Packaging the extension

See [Release](./release.md)
