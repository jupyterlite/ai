const fs = require('fs');
const tsj = require('ts-json-schema-generator');
const path = require('path');

console.log('Building settings schema\n');

const schemasDir = 'src/settings/schemas';
const outputDir = path.join(schemasDir, '/_generated');
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
  ChromeAI: {
    path: 'node_modules/@langchain/community/experimental/llms/chrome_ai.d.ts',
    type: 'ChromeAIInputs'
  },
  MistralAI: {
    path: 'node_modules/@langchain/mistralai/dist/chat_models.d.ts',
    type: 'ChatMistralAIInput'
  },
  Anthropic: {
    path: 'node_modules/@langchain/anthropic/dist/chat_models.d.ts',
    type: 'AnthropicInput',
    excludedProps: ['clientOptions']
  },
  OpenAI: {
    path: 'node_modules/@langchain/openai/dist/chat_models.d.ts',
    type: 'ChatOpenAIFields',
    excludedProps: ['configuration']
  }
};

Object.entries(providers).forEach(([name, desc], index) => {
  // The configuration doesn't include functions, which may probably not be filled
  // from the settings panel.
  const config = {
    path: desc.path,
    tsconfig: './tsconfig.json',
    type: desc.type,
    functions: 'hide',
    topRef: false
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

  // Write JSON file.
  const schemaString = JSON.stringify(schema, null, 2);
  fs.writeFile(outputPath, schemaString, err => {
    if (err) {
      throw err;
    }
  });
});

// Build the index.ts file
const indexContent = ["import { IDict } from '../../tokens';", ''];
Object.keys(providers).forEach(name => {
  indexContent.push(`import ${name} from './_generated/${name}.json';`);
});

indexContent.push('', 'const ProviderSettings: IDict<any> = {');

Object.keys(providers).forEach((name, index) => {
  indexContent.push(
    `  ${name}` + (index < Object.keys(providers).length - 1 ? ',' : '')
  );
});
indexContent.push('};', '', 'export { ProviderSettings };', '');
fs.writeFile(
  path.join(schemasDir, 'index.ts'),
  indexContent.join('\n'),
  err => {
    if (err) {
      throw err;
    }
  }
);

console.log('Settings schema built\n');
console.log('=====================\n');
