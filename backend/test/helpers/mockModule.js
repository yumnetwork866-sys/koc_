const path = require('path');

const mockModule = (targetPath, exportsValue) => {
  const resolved = require.resolve(targetPath);
  const previous = require.cache[resolved];

  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue,
  };

  return () => {
    if (previous) {
      require.cache[resolved] = previous;
      return;
    }

    delete require.cache[resolved];
  };
};

const mockRelativeModule = (fromFile, relativePath, exportsValue) => (
  mockModule(path.resolve(path.dirname(fromFile), relativePath), exportsValue)
);

module.exports = {
  mockModule,
  mockRelativeModule,
};
