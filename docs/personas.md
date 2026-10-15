# Building an in-browser persona

[Jupyter AI](https://github.com/jupyterlab/jupyter-ai) personas run on the Jupyter server. The `jupyter-ai-persona-kit` package is a kit to build personas that run in the browser instead, so they also work in JupyterLite. [Jupyternaut](https://pypi.org/project/jupyternaut/), in this repository, is built on it. A persona built on the kit lives in its own repository and does not depend on Jupyternaut.

## What the kit provides

The kit is a JupyterLab extension (`@jupyter-ai/persona-kit`, Python package `jupyter-ai-persona-kit`) that provides these tokens:

- `IToolRegistry`: the tools a persona can offer to a model. The kit registers `discover_commands`, `execute_command`, `browser_fetch`, `discover_skills` and `load_skill`. Other extensions can add their own tools.
- `ISkillRegistry`: the [agent skills](./skills.md) loaded from the skills paths or registered by extensions.
- `IPersonaKitSettings`: the settings shared by the personas, with the settings id `@jupyter-ai/persona-kit:settings`:
  - `commandsRequiringApproval`: the JupyterLab commands that need the approval of the user before a persona runs them
  - `commandsAutoRenderMimeBundles`: the commands whose `execute_command` outputs may render MIME bundles in the chat
  - `trustedMimeTypesForAutoRender`: the MIME types marked as trusted when those outputs render
  - `skillsPaths`: the directories that hold agent skills

The kit also exports helpers:

- `getToolInputSchema(tool)` and `parseToolInput(name, tool, input)`: the JSON schema of the input of a tool, and the parsed input of a tool call. A tool is an `ITool`: an object with a `description`, an `inputSchema` (a [zod](https://zod.dev) schema or an [AI SDK](https://ai-sdk.dev) JSON schema object), an `execute` function and an optional `metadata.title`. AI SDK tool objects have this shape.
- `createExecuteCommandApprovalPolicy(() => settings.config.commandsRequiringApproval)`: the approval policy of the `execute_command` tool, a function `(input) => 'user-approval' | undefined` for agents that handle approvals at the agent level (the `toolApproval` option of the AI SDK). The callback runs at each tool call, so settings changes apply.
- `extractMimeBundles(output, trustedMimeTypes)`: the rich outputs of a JupyterLab command, as chat MIME bundles.
- `requestApiKey(options)` and `forwardAuthCode()`: the [OpenRouter](./openrouter.md) sign-in flow. The kit runs the forwarder plugin, so a persona only calls `requestApiKey`.
- `getAppAttribution()`: the application name and URL sent to the providers that support attribution.

The kit has no dependency on the AI SDK: a persona can use any agent runtime.

## Depending on the kit

A persona extension consumes the kit as a shared singleton, so that the tokens are the same objects in every extension. In `package.json`:

```json
{
  "dependencies": {
    "@jupyter-ai/persona-kit": "^0.21.0"
  },
  "jupyterlab": {
    "extension": true,
    "sharedPackages": {
      "@jupyter-ai/persona-kit": {
        "bundled": false,
        "singleton": true
      }
    }
  }
}
```

With `bundled: false`, the kit extension must be installed: the Python package of the persona depends on the kit:

```toml
dependencies = [
    "jupyter-ai-persona-kit >=0.21.0,<0.22",
]
```

The kit follows the `0.x` convention: a new minor version may change the API. Pin the minor version and bump it when the kit changes.

## Registering a persona in the chat

The chat and its persona selector come from [jupyterlab-chat](https://github.com/jupyterlab/jupyter-chat) and `@jupyter-ai/persona-manager`. A persona attaches to each chat panel from `IChatTracker`, registers itself in the chat with `IPersonaSessionRegistry` (`registerFrontendPersona`), answers the messages addressed to it, and publishes its state (model, usage, processing). The Jupyternaut plugins in `packages/jupyternaut/src/index.ts` are the reference implementation. A kit-owned helper for this glue is planned.

## Developing against this repository

To work on a persona with an unreleased version of the kit:

1. In this repository, build and install the kit in development mode: `jlpm install && jlpm build`, then `python scripts/dev_install.py`.
2. In the persona repository, use the same Python environment and link the kit workspace: `jlpm link /path/to/this-repository/packages/persona-kit`. This writes a `portal:` resolution in `package.json` that must not be committed.
3. Build the persona and install it with `jupyter-builder develop . --overwrite`, then reload JupyterLab.
