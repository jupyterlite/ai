const fs = require('fs');
const tsj = require('ts-json-schema-generator');
const path = require('path');

const providersDir = 'src/default-providers';

let checkError = false;
let generate = false;
if (process.argv.length >= 3) {
  if (process.argv[2] === '--generate') {
    generate = true;
  } else {
    throw Error(`Argument '${process.argv[2]}' is not valid.`);
  }
}

if (generate) {
  console.log('Building settings schemas\n');
} else {
  console.log('Checking settings schemas\n');
}

// Build the langchain BaseLanguageModelParams object
const configBase = {
  path: 'node_modules/@langchain/core/dist/language_models/base.d.ts',
  tsconfig: './tsconfig.json',
  type: 'BaseLanguageModelParams'
};

const schemaBase = tsj
  .createGenerator(configBase)
  .createSchema(configBase.type);

/**
 *  The providers are the list of providers for which we'd like to build settings from their interface.
 *  The keys will be the names of the json files that will be linked to the selected provider.
 *  The values are:
 *   - path: path of the module containing the provider input description, in @langchain package.
 *   - type: the type or interface to format to json settings.
 *   - excludedProps: (optional) the properties to not include in the settings.
 *     "ts-json-schema-generator" seems to not handle some imported types, so the workaround is
 *     to exclude them at the moment, to be able to build other settings.
 */
const providers = {
  Anthropic: {
    path: 'node_modules/@langchain/anthropic/dist/chat_models.d.ts',
    type: 'AnthropicInput',
    excludedProps: ['clientOptions']
  },
  ChromeAI: {
    path: 'node_modules/@langchain/community/experimental/llms/chrome_ai.d.ts',
    type: 'ChromeAIInputs',
    excludedProps: ['systemPrompt']
  },
  ChatGoogleGenerativeAI: {
    path: 'node_modules/@langchain/google-genai/dist/chat_models.d.ts',
    type: 'ChatGoogleGenerativeAI'
  },
  MistralAI: {
    path: 'node_modules/@langchain/mistralai/dist/chat_models.d.ts',
    type: 'ChatMistralAIInput'
  },
  Ollama: {
    path: 'node_modules/@langchain/ollama/dist/chat_models.d.ts',
    type: 'ChatOllamaInput'
  },
  OpenAI: {
    path: 'node_modules/@langchain/openai/dist/chat_models.d.ts',
    type: 'ChatOpenAIFields',
    excludedProps: ['configuration']
  },
  WebLLM: {
    path: 'node_modules/@langchain/community/chat_models/webllm.d.ts',
    type: 'WebLLMInputs',
    // TODO: re-enable?
    excludedProps: ['appConfig', 'chatOptions']
  }
};

Object.entries(providers).forEach(([name, desc], index) => {
  const outputDir = path.join(providersDir, name);
  const outputPath = path.join(outputDir, 'settings-schema.json');
  if (!generate && !fs.existsSync(outputPath)) {
    throw Error(`${outputPath} does not exist`);
  }

  // The configuration doesn't include functions, which may probably not be filled
  // from the settings panel.
  const config = {
    path: desc.path,
    tsconfig: './tsconfig.json',
    type: desc.type,
    functions: 'hide',
    topRef: false
  };

  // Skip for WebLLM due to ts-json-schema-generator not picking up the typeRoots?
  if (name === 'WebLLM') {
    config.skipTypeCheck = true;
  }

  const generator = tsj.createGenerator(config);
  let schema;

  // Workaround to exclude some properties from a type or interface.
  if (desc.excludedProps) {
    const nodes = generator.getRootNodes(config.type);
    const finalMembers = [];
    nodes[0].members.forEach(member => {
      if (!desc.excludedProps.includes(member.symbol.escapedName)) {
        finalMembers.push(member);
      }
    });
    nodes[0].members = finalMembers;
    schema = generator.createSchemaFromNodes(nodes);
  } else {
    schema = generator.createSchema(config.type);
  }

  if (!schema.definitions) {
    return;
  }

  // Remove the properties from extended class.
  const providerKeys = Object.keys(schema.properties);
  Object.keys(
    schemaBase.definitions?.['BaseLanguageModelParams']['properties']
  ).forEach(key => {
    if (providerKeys.includes(key)) {
      delete schema.properties?.[key];
    }
  });

  // Replace all references by their value, and remove the useless definitions.
  const defKeys = Object.keys(schema.definitions);
  for (let i = defKeys.length - 1; i >= 0; i--) {
    let schemaString = JSON.stringify(schema);
    const key = defKeys[i];
    const reference = `"$ref":"#/definitions/${key}"`;

    // Replace all the references to the definition by the content (after removal of the brace).
    const replacement = JSON.stringify(schema.definitions?.[key]).slice(1, -1);
    temporarySchemaString = schemaString.replaceAll(reference, replacement);
    // Build again the schema from the string representation if it change.
    if (schemaString !== temporarySchemaString) {
      schema = JSON.parse(temporarySchemaString);
    }
    // Remove the definition
    delete schema.definitions?.[key];
  }

  // Transform the default values.
  Object.values(schema.properties).forEach(value => {
    const defaultValue = value.default;
    if (!defaultValue) {
      return;
    }
    if (value.type === 'number') {
      value.default = Number(/{(.*)}/.exec(value.default)?.[1] ?? 0);
    } else if (value.type === 'boolean') {
      value.default = /{(.*)}/.exec(value.default)?.[1] === 'true';
    } else if (value.type === 'string') {
      value.default = /{\"(.*)\"}/.exec(value.default)?.[1] ?? '';
    }
  });

  let schemaString = JSON.stringify(schema, null, 2);
  schemaString += '\n';
  if (generate) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    // Write JSON file.
    fs.writeFileSync(outputPath, schemaString, err => {
      if (err) {
        throw err;
      }
    });
  } else {
    const currentContent = fs.readFileSync(outputPath, { encoding: 'utf-8' });
    if (currentContent !== schemaString) {
      checkError = true;
      console.log(`\x1b[31mX \x1b[0m${name}`);
    } else {
      console.log(`\x1b[32m\u2713 \x1b[0m${name}`);
    }
  }
});

if (generate) {
  console.log('Settings schemas built\n');
  console.log('=====================\n');
} else if (checkError) {
  console.error('Please run "jlpm settings:build" to fix it.');
  process.exit(1);
} else {
  console.log('Settings schemas checked successfully\n');
}
