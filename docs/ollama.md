# Using Ollama

[Ollama](https://ollama.com/) allows you to run open-weight LLMs locally on your machine.

## Setting up Ollama

1. Install Ollama following the instructions at <https://ollama.com/download>
2. Pull a model, for example:

```bash
ollama pull llama3.2
```

3. Start the Ollama server (it typically runs on `http://localhost:11434`)

## Configuring jupyterlite-ai to use Ollama

1. In JupyterLab, open the AI settings panel and go to the **Providers** section
2. Click on "Add a new provider"
3. Select the **Generic (OpenAI-compatible)** provider
4. Configure the following settings:
   - **Base URL**: Select `http://localhost:11434/v1` from the suggestions (or enter manually)
   - **Model**: The model name you pulled (e.g., `llama3.2`)
   - **API Key**: Leave empty (not required for Ollama)
