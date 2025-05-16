export default `
Ollama allows to run large language models locally on your machine.
To use it you need to install the Ollama CLI and pull the model you want to use.
1. Install the Ollama CLI by following the instructions at <https://ollama.com/download>
2. Pull the model you want to use by running the following command in your terminal:
   \`\`\`bash
   ollama pull <model-name>
   \`\`\`
   For example, to pull the Llama 2 model, run:
   \`\`\`bash
   ollama pull llama2
   \`\`\`
3. Once the model is pulled, you can use it in your application by running the following command:
    \`\`\`bash
    ollama serve
    \`\`\`
4. This model will be available in the extension, using the model name you used in the command above.
`;
