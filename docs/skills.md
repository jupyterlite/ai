# Agent Skills

JupyterLite AI supports [Agent Skills](https://agentskills.io), a standard way to extend AI agent capabilities with reusable, shareable instructions.

Skills let you teach the AI agent new behaviors — like how to polish notebooks for reproducibility, write code reviews, or follow team conventions — by placing markdown files in your workspace. The agent discovers and activates skills automatically when they are relevant to a task.

## How it works

Skills follow the [agentskills.io specification](https://agentskills.io/specification). Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (metadata) and a markdown body (instructions).

The AI agent uses **progressive disclosure** to work with skills efficiently:

1. **Discovery**: The agent calls `discover_skills` (optionally with a query) to see a list of available skills with short descriptions (~100 tokens each).
2. **Activation**: When a skill is relevant, the agent calls `load_skill` with the skill name to load the full instructions.
3. **Execution**: The agent follows the loaded instructions to complete the task.

Skills are registered in a dedicated skill registry. The agent discovers and uses skills through the `discover_skills` and `load_skill` tools.

When a new chat is created, JupyterLite AI preloads a **snapshot of available skill names and descriptions** into the system prompt. This helps the model notice relevant skills up front without requiring a `discover_skills` call. The full skill instructions are still loaded on-demand via progressive disclosure.

## Creating a skill

### Directory structure

Place skills in the `.agents/skills/` or `_agents/skills/` directory at the root of your JupyterLab workspace:

```
.agents/skills/          # hidden directory (requires allow_hidden)
  notebook-bootstrap/
    SKILL.md
  code-review/
    SKILL.md

_agents/skills/          # visible by default in Jupyter file browser
  notebook-bootstrap/
    SKILL.md
    references/
      REFERENCE.md
    scripts/
      mymodule.py
  code-review/
    SKILL.md
```

Both paths are scanned by default. The `_agents/skills/` directory is visible in the Jupyter file browser without any extra configuration, making it the easiest option to get started. The `.agents/skills/` directory follows the convention used by other AI coding tools (e.g. OpenAI Codex, OpenCode) and is scanned first, so if the same skill name exists in both directories, the one under `.agents/skills/` takes priority.

Each skill lives in its own subdirectory. Only the top-level subdirectories of the skills directory are scanned — nested subdirectories are not traversed for additional skills.

### SKILL.md format

Every skill directory must contain a `SKILL.md` file with YAML frontmatter:

````markdown
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
````

The frontmatter fields:

| Field         | Required | Description                                                                |
| ------------- | -------- | -------------------------------------------------------------------------- |
| `name`        | Yes      | A short identifier for the skill (used to load the skill via `load_skill`) |
| `description` | Yes      | A brief description of what the skill does and when to use it              |

The markdown body after the closing `---` is the full instructions content that the agent loads when it activates the skill.

### Resource files

Skills can include additional files (references, scripts, templates) alongside `SKILL.md`. The agent can access these by calling `load_skill` with a `resource` argument:

```javascript
load_skill({
  name: 'notebook-bootstrap',
  resource: 'references/REFERENCE.md'
});
```

This reads the file at `.agents/skills/notebook-bootstrap/references/REFERENCE.md` and returns its content.

## Configuring the skills directories

By default, skills are loaded from two directories (in order of priority):

1. `.agents/skills` — follows the convention used by other AI coding tools
2. `_agents/skills` — visible by default in the Jupyter file browser

You can add, remove, or reorder paths in the JupyterLite AI settings:

1. Open **Settings** > **Settings Editor**
2. Search for **JupyterLite AI**
3. Edit the **Skills Paths** list

This is useful if you keep skills in additional locations, such as `.claude/skills/` for compatibility with Claude Code. When the same skill name appears in multiple directories, the first occurrence wins (based on the order of the paths list).

### Using skills with JupyterLab

The `_agents/skills/` directory works out of the box with JupyterLab — no extra configuration is needed.

If you also use the hidden `.agents/skills/` directory, make sure your Jupyter server allows reading hidden directories and that the server root is the workspace that contains the `.agents/skills` folder. A minimal `jupyter_server_config.py` example:

```python
c.ContentsManager.allow_hidden = True
c.ServerApp.root_dir = "/path/to/your/workspace"
```

### Using skills with JupyterLite

JupyterLite runs entirely in the browser and does not use a Jupyter Server, so server-side configuration does not apply. Skills are loaded from the JupyterLite filesystem (browser storage or bundled site content). To use skills with JupyterLite:

- The `_agents/skills/` directory works without any extra configuration — just create it in the file browser or bundle it into your JupyterLite build.
- If you also use the hidden `.agents/skills/` directory, make sure hidden files are included in the JupyterLite build output by setting this in `jupyter_lite_config.json`:

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

- If you place skills somewhere else, add the path to the **Skills Paths** list in settings (relative to the JupyterLite filesystem root).

## Providing skills from a JupyterLab extension

In addition to loading skills from the filesystem, JupyterLab extensions can register skills programmatically via the skill registry token `ISkillRegistry`:

```typescript
import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ISkillRegistry } from '@jupyterlite/ai';

// Bundled resource files (scripts, references, templates)
const resources: Record<string, string> = {
  'scripts/analyze.py': 'import pandas as pd\n...',
  'references/REFERENCE.md': '# Reference\n...'
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'my-extension:skills',
  autoStart: true,
  requires: [ISkillRegistry],
  activate: (app: JupyterFrontEnd, skillRegistry) => {
    skillRegistry.registerSkill({
      name: 'my-custom-skill',
      description: 'Description of what this skill does.',
      instructions: 'Full instructions for the agent...',
      resources: Object.keys(resources),
      loadResource: async (resource: string) => {
        const content = resources[resource];
        if (!content) {
          return {
            name: 'my-custom-skill',
            resource,
            error: `Resource not found: ${resource}`
          };
        }
        return { name: 'my-custom-skill', resource, content };
      }
    });
  }
};
```

The registry follows progressive disclosure: `load_skill` returns instructions and a list of resource **paths**, and the agent loads individual resources on demand via the `resource` argument. This keeps token usage low for skills with large bundled files.

This makes it possible to bundle skills as part of a JupyterLab extension and distribute them via PyPI or conda-forge, without requiring users to place files in their workspace manually.

## Security considerations

Skills contain instructions that the AI agent will follow when activated. Only use skills from sources you trust. Before using a skill:

- Review the `SKILL.md` file to understand what instructions the agent will receive
- Check any bundled resource files (scripts, templates) for unexpected content
- Be cautious with skills that instruct the agent to execute code, modify files, or access external services

## Compatibility

Skills follow the [agentskills.io specification](https://agentskills.io/specification), so skill directories can be shared across tools that support the standard. A skill created for JupyterLite AI can also be used with other compatible agents, and vice versa.
