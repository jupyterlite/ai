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

<details>
<summary>Deploying Lite/Lab on external server</summary>

See https://objectgraph.com/blog/ollama-cors/ for more details.

On Linux, you can run the following commands:

1. Check if CORS is enabled on the server. You can do this by running the following command in your terminal:

   \`\`\`bash
   curl -X OPTIONS http://localhost:11434 -H "Origin: http://example.com" -H "Access-Control-Request-Method: GET" -I
   \`\`\`

   If CORS is disabled, you will see a response like this:

   \`\`\`bash
   HTTP/1.1 403 Forbidden
   Date: Wed, 09 Oct 2024 10:12:15 GMT
   Content-Length: 0
    \`\`\`

2. If CORS is not enabled, update _/etc/systemd/system/ollama.service_ with:

   \`\`\`bash
   [Service]
   Environment="OLLAMA_HOST=0.0.0.0"
   Environment="OLLAMA_ORIGINS=*"
   \`\`\`

3. Restart the service:

   \`\`\`bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   \`\`\`

4. Check if CORS is enabled on the server again by running the following command in your terminal:

    \`\`\`bash
    curl -X OPTIONS http://localhost:11434 -H "Origin: http://example.com" -H "Access-Control-Request-Method: GET" -I
    \`\`\`

</details>
`;
