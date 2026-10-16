# @jupyter-ai/jupyternaut

The Jupyternaut persona of [Jupyter AI](https://github.com/jupyterlab/jupyter-ai), running in the browser: AI chat and code completions in JupyterLab, Notebook 7 and JupyterLite. It is built on [`@jupyter-ai/persona-kit`](https://www.npmjs.com/package/@jupyter-ai/persona-kit). The Python package is [`jupyternaut`](https://pypi.org/project/jupyternaut/).

## Usage

An extension that adds AI providers to Jupyternaut uses the `IProviderRegistry` token:

```typescript
import { IProviderRegistry } from '@jupyter-ai/jupyternaut';
```

It consumes `@jupyter-ai/jupyternaut` as a shared singleton, so that the token is the same object in both extensions:

```json
{
  "jupyterlab": {
    "sharedPackages": {
      "@jupyter-ai/jupyternaut": {
        "bundled": false,
        "singleton": true
      }
    }
  }
}
```

Its Python package depends on `jupyternaut`, so that the Jupyternaut extension is installed.

See [Custom Providers](https://jupyterlite-ai.readthedocs.io/en/latest/custom-providers/) for the complete guide.
