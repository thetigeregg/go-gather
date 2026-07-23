import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINATION_PATH = resolve(REPO_ROOT, 'ios/App/App/Firebase/GoogleService-Info.plist');
const DEFAULT_SHARED_PATH = resolve(os.homedir(), '.config/go-gather/ios/GoogleService-Info.plist');

/**
 * go-gather uses a single Firebase project (no dev/prod split — this is a
 * single-user app with no auth/multi-tenant boundary, unlike game-shelf's
 * two-project setup). GoogleService-Info.plist is machine-local, not
 * committed (gitignored) — copied in from ~/.config or an env override.
 */
export function resolveSharedPlistPath(envValues = process.env) {
  const override = envValues.IOS_FIREBASE_PLIST_PATH?.trim();
  return override ? resolve(override) : DEFAULT_SHARED_PATH;
}

export function bootstrapIosFirebasePlist({
  sharedPath = resolveSharedPlistPath(),
  destinationPath = DESTINATION_PATH,
  force = false,
  failOnMissing = false,
  existsSyncFn = existsSync,
  mkdirSyncFn = mkdirSync,
  copyFileSyncFn = copyFileSync,
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!existsSyncFn(sharedPath)) {
    const message = [
      `Missing Firebase plist at ${sharedPath}`,
      'One-time setup:',
      `  mkdir -p ${dirname(sharedPath)}`,
      `  # Download GoogleService-Info.plist from Firebase Console and save it there`,
      'Override the source path with IOS_FIREBASE_PLIST_PATH if needed.',
    ].join('\n');

    if (failOnMissing) {
      throw new Error(message);
    }

    warn(`[bootstrap-ios-firebase-plist] ${message}`);
    return { copied: false };
  }

  if (existsSyncFn(destinationPath) && !force) {
    log(`[bootstrap-ios-firebase-plist] ${destinationPath} already present, skipping`);
    return { copied: false };
  }

  mkdirSyncFn(dirname(destinationPath), { recursive: true });
  copyFileSyncFn(sharedPath, destinationPath);
  log(`[bootstrap-ios-firebase-plist] Bootstrapped ${destinationPath} from ${sharedPath}`);
  return { copied: true };
}

function parseArgs(argv) {
  return {
    force: argv.includes('--force'),
    failOnMissing: argv.includes('--required'),
  };
}

function main() {
  const { force, failOnMissing } = parseArgs(process.argv.slice(2));

  try {
    bootstrapIosFirebasePlist({ force, failOnMissing });
  } catch (error) {
    console.error(
      `[bootstrap-ios-firebase-plist] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
