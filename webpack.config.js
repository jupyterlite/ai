module.exports = {
  // Ignore source map warnings for @langchain/langgraph
  ignoreWarnings: [
    {
      module: /node_modules\/@langchain\/langgraph/
    },
    /Failed to parse source map.*@langchain/
  ]
};
