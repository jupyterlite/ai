const fs = require('fs');
const tsj = require('ts-json-schema-generator');
const path = require('path');

console.log('Building settings schema\n');

const outputDir = 'src/_provider-settings';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
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
  chromeAI: {
    path: 'node_modules/@langchain/community/experimental/llms/chrome_ai.d.ts',
    type: 'ChromeAI'
  },
  mistralAI: {
    path: 'node_modules/@langchain/mistralai/dist/chat_models.d.ts',
    type: 'ChatMistralAIInput'
  },
  anthropic: {
    path: 'node_modules/@langchain/anthropic/dist/chat_models.d.ts',
    type: 'AnthropicInput',
    excludedProps: ['clientOptions']
  }
};

Object.entries(providers).forEach(([name, desc], index) => {
  // The configuration doesn't include functions, which may probably not be filled
  // from the settings panel.
  const config = {
    path: desc.path,
    tsconfig: './tsconfig.json',
    type: desc.type,
    functions: 'hide'
  };

  const outputPath = path.join(outputDir, `${name}.json`);

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
  const providerKeys = Object.keys(schema.definitions[desc.type]['properties']);

  // TODO: fix for ChromeAI
  const keys = [
    'ParsedCallOptions',
    'lc_kwargs',
    'lc_namespace',
    'lc_serializable',
    'caller'
  ];
  keys.forEach(key => {
    if (providerKeys.includes(key)) {
      delete schema.definitions?.[desc.type]['properties'][key];
    }
  });

  Object.keys(
    schemaBase.definitions?.['BaseLanguageModelParams']['properties']
  ).forEach(key => {
    if (providerKeys.includes(key)) {
      delete schema.definitions?.[desc.type]['properties'][key];
    }
  });

  // Remove the useless definitions.
  let change = true;
  while (change) {
    change = false;
    const temporarySchemaString = JSON.stringify(schema);

    Object.keys(schema.definitions).forEach(key => {
      const index = temporarySchemaString.indexOf(`#/definitions/${key}`);
      if (index === -1) {
        delete schema.definitions?.[key];
        change = true;
      }
    });
  }

  // Transform the default values.
  Object.values(schema.definitions[desc.type]['properties']).forEach(value => {
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

  // Write JSON file.
  const schemaString = JSON.stringify(schema, null, 2);
  fs.writeFile(outputPath, schemaString, err => {
    if (err) {
      throw err;
    }
  });
});

console.log('Settings schema built\n');
console.log('=====================\n');
