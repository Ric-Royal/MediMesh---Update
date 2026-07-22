const fs = require('fs');

/** Load Docker/Kubernetes-style NAME_FILE secrets before runtime validation. */
const loadFileSecrets = (env = process.env) => {
  for (const [name, filePath] of Object.entries(env)) {
    if (!name.endsWith('_FILE') || !filePath) continue;
    const target = name.slice(0, -5);
    if (String(env[target] || '').trim()) continue;
    env[target] = fs.readFileSync(String(filePath), 'utf8').trim();
  }
  return env;
};

module.exports = { loadFileSecrets };
