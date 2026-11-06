// Entry point. Checks the Node.js version *before* loading anything that needs
// the built-in `node:sqlite` module, so users get a clear message instead of a stack trace.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `\n  This app needs Node.js 22.13 or newer (you have ${process.versions.node}).\n` +
      '  Install the current LTS from https://nodejs.org or run it with Docker: docker compose up\n',
  );
  process.exit(1);
}

await import('./main.js');
