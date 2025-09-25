// Placeholder file created to avoid ENOENT in Metro symbolication
// Metro sometimes attempts to read this path while building or when symbolication
// references an internal bytecode file. Creating this placeholder prevents crashes
// from `fs.readFileSync` when the packager tries to open the file.

// If you later have a real InternalBytecode.js produced by a build step or
// bundler, replace the contents. For now, an empty module is sufficient.

module.exports = {};
