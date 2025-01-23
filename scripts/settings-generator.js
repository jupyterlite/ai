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

const providers = {
  mistralAI: {
    path: 'node_modules/@langchain/mistralai/dist/chat_models.d.ts',
    type: 'ChatMistralAIInput'
  }
};

Object.entries(providers).forEach(([name, desc], index) => {
  const config = {
    path: desc.path,
    tsconfig: './tsconfig.json',
    type: desc.type
  };

  const outputPath = path.join(outputDir, `${name}.json`);

  const schema = tsj.createGenerator(config).createSchema(config.type);

  if (!schema.definitions) {
    return;
  }

  // Remove the properties from extended class.
  const providerKeys = Object.keys(schema.definitions[desc.type]['properties']);
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
