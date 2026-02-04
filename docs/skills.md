# Agent Skills

JupyterLite AI supports [Agent Skills](https://agentskills.io), a standard way to extend AI agent capabilities with reusable, shareable instructions.

Skills let you teach the AI agent new behaviors — like how to polish notebooks for reproducibility, write code reviews, or follow team conventions — by placing markdown files in your workspace. The agent discovers and activates skills automatically when they are relevant to a task.

## How it works

Skills follow the [agentskills.io specification](https://agentskills.io/specification). Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (metadata) and a markdown body (instructions).

The AI agent uses **progressive disclosure** to work with skills efficiently:

1. **Discovery**: The agent calls `discover_commands` with query `"skills"` to see a list of available skills with short descriptions (~100 tokens each).
2. **Activation**: When a skill is relevant, the agent executes the corresponding `skills:<name>` command to load the full instructions.
3. **Execution**: The agent follows the loaded instructions to complete the task.

Skills are registered as JupyterLab commands with a `skills:` prefix. No additional tools or UI are needed — the agent discovers and uses skills through the existing command system.

## Creating a skill

### Directory structure

Place skills in the `.jupyter/skills/` directory at the root of your JupyterLab workspace:

```
.jupyter/
  skills/
    notebook-bootstrap/
      SKILL.md
      references/
        REFERENCE.md
      scripts/
        mymodule.py
    code-review/
      SKILL.md
```

Each skill lives in its own subdirectory. Only the top-level subdirectories of the skills directory are scanned — nested subdirectories are not traversed for additional skills.

### SKILL.md format

Every skill directory must contain a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: notebook-bootstrap
description: Bootstrap a new notebook for data science and plotting with common imports and a linked console.
---

## Instructions

When the user asks to bootstrap a new notebook for data science and plotting:

1. Create a new notebook with `jupyterlab-ai-commands:create-notebook` using `name: "data-science-starter"` and `language: "python"` (name is without `.ipynb`)
2. Add a markdown title cell at the top with `jupyterlab-ai-commands:add-cell` using `cellType: "markdown"`, `position: "above"`, and content like:

```markdown
# Data Science Starter
```

3. Add an imports cell directly below with `jupyterlab-ai-commands:add-cell` using `cellType: "code"`, `position: "below"`, and content:

```python
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import scipy.stats as stats
```

4. Open a console for that notebook with `notebook:create-console` and `activate: true`

## Guidelines

- Keep the first cell as a short markdown title
- Keep the second cell focused on imports only
- Prefer explicit variable names over single-letter names
- Add comments only when a step is not obvious
```

The frontmatter fields:

| Field         | Required | Description                                                               |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `name`        | Yes      | A short identifier for the skill (used in the command ID `skills:<name>`) |
| `description` | Yes      | A brief description of what the skill does and when to use it             |

The markdown body after the closing `---` is the full instructions content that the agent loads when it activates the skill.

### Resource files

Skills can include additional files (references, scripts, templates) alongside `SKILL.md`. The agent can access these by executing the skill command with a `resource` argument:

```
execute_command({ commandId: "skills:notebook-bootstrap", args: { resource: "references/REFERENCE.md" } })
```

This reads the file at `.jupyter/skills/notebook-bootstrap/references/REFERENCE.md` and returns its content.

## Configuring the skills directory

By default, skills are loaded from `.jupyter/skills` relative to the server root. You can change this path in the JupyterLite AI settings:

1. Open **Settings** > **Settings Editor**
2. Search for **JupyterLite AI**
3. Change the **Skills Path** setting to your preferred directory

This is useful if you keep skills in a different location, such as `.claude/skills/` for compatibility with Claude Code.

### Using skills with JupyterLab

If you use a path under `.jupyter/`, make sure your Jupyter server allows reading hidden directories and that the server root is the workspace that contains the `.jupyter/skills` folder. A minimal `jupyter_server_config.py` example:

```python
c.ContentsManager.allow_hidden = True
c.ServerApp.root_dir = "/path/to/your/workspace"
```

### Using skills with JupyterLite

JupyterLite runs entirely in the browser and does not use a Jupyter Server, so server-side configuration does not apply. Skills are loaded from the JupyterLite filesystem (browser storage or bundled site content). To use skills with JupyterLite:

- If you keep skills under a hidden folder like `.jupyter/`, make sure hidden files are included in the JupyterLite build output by setting this in `jupyter_lite_config.json`:

```json
{
  "ContentsManager": {
    "allow_hidden": true
  }
}
```

- To show hidden files by default in the file browser, add the following to `overrides.json`:

```json
{
  "@jupyterlab/filebrowser-extension:browser": {
    "showHiddenFiles": true
  }
}
```

- Create or upload a `.jupyter/skills/` directory in the JupyterLite file browser (enable **Show Hidden Files** in the file browser menu or **Settings** > **File Browser** if needed), or bundle the directory into your JupyterLite build.
- If you place skills somewhere else, update the **Skills Path** setting to match the location (relative to the JupyterLite filesystem root).

## Providing skills from a JupyterLab extension

In addition to loading skills from the filesystem, JupyterLab extensions can register skills programmatically. The only convention required is the `skills:` command prefix. Any extension can call `app.commands.addCommand` to register a skill command:

```typescript
// Bundled resource files (scripts, references, templates)
const resources: Record<string, string> = {
  'scripts/analyze.py': 'import pandas as pd\n...',
  'references/REFERENCE.md': '# Reference\n...'
};

app.commands.addCommand('skills:my-custom-skill', {
  label: 'my-custom-skill',
  caption: 'Description of what this skill does.',
  usage: 'Agent skill: Description of what this skill does.',
  describedBy: {
    args: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Optional path to a resource file bundled inside the skill directory (e.g. references or templates shipped with the skill). Do NOT use this for user workspace files — read those directly instead.'
        }
      }
    }
  },
  execute: async (args: any) => {
    // When a resource is requested, return its content
    if (args.resource) {
      const content = resources[args.resource];
      if (!content) {
        return {
          name: 'my-custom-skill',
          resource: args.resource,
          error: `Resource not found: ${args.resource}`
        };
      }
      return { name: 'my-custom-skill', resource: args.resource, content };
    }

    // Otherwise return skill metadata + instructions.
    // List resource paths (not content) for progressive disclosure —
    // the agent loads each resource individually when needed.
    return {
      name: 'my-custom-skill',
      description: 'Description of what this skill does.',
      instructions: 'Full instructions for the agent...',
      resources: Object.keys(resources)
    };
  }
});
```

The execute handler follows progressive disclosure: on activation it returns instructions and a list of resource **paths**, and the agent loads individual resources on demand via the `resource` argument. This keeps token usage low for skills with large bundled files.

This makes it possible to bundle skills as part of a JupyterLab extension and distribute them via PyPI or conda-forge, without requiring users to place files in their workspace manually.

## Security considerations

Skills contain instructions that the AI agent will follow when activated. Only use skills from sources you trust. Before using a skill:

- Review the `SKILL.md` file to understand what instructions the agent will receive
- Check any bundled resource files (scripts, templates) for unexpected content
- Be cautious with skills that instruct the agent to execute code, modify files, or access external services

## Compatibility

Skills follow the [agentskills.io specification](https://agentskills.io/specification), so skill directories can be shared across tools that support the standard. A skill created for JupyterLite AI can also be used with other compatible agents, and vice versa.
