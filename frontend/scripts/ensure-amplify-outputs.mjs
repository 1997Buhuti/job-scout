// Creates amplify_outputs.json from the committed example template when it is
// missing, so a fresh clone can start. The template contains placeholder values,
// so Amplify Auth stays unconfigured until real values are generated with
// `npm run amplify:outputs -- --app-id <id> --branch <branch>`.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'amplify_outputs.json');
const template = join(root, 'amplify_outputs.example.json');

if (!existsSync(target)) {
  copyFileSync(template, target);
  console.warn(
    '[Job Scout] Created amplify_outputs.json from the example template. ' +
      'Sign-in will not work until it is replaced: run `aws login`, then ' +
      '`npm run amplify:outputs -- --app-id <id> --branch <branch>`.',
  );
}
