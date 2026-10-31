// Runs with Node alone, before any dependencies are installed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createInterface } = require('node:readline/promises');
const root = path.resolve(__dirname, '..');

function run(args) {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd: root, stdio: 'inherit', shell: process.platform === 'win32'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed. Fix the error above and rerun npm run setup.`);
}

async function main() {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22 or newer from https://nodejs.org/ first.');
    const args = process.argv.slice(2);
    let email = '';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help' || args[i] === '-h') {
            console.log('Usage: npm run setup -- [--email you@gmail.com]\nInstalls dependencies, builds, and creates missing configuration files. Existing settings are preserved.');
            return;
        }
        if (args[i] !== '--email' || !args[i + 1]) throw new Error('Usage: npm run setup -- [--email you@gmail.com]');
        email = args[++i];
    }
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath) && !email && process.stdin.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try { email = (await rl.question('Google account email (Enter to configure later): ')).trim(); }
        finally { rl.close(); }
    }
    if (email && !/^[a-zA-Z0-9.!#$%&*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        throw new Error('Enter a valid email address.');
    }
    run(['ci', '--include=dev']);
    run(['run', 'build']);
    if (!fs.existsSync(envPath)) {
        const template = fs.readFileSync(path.join(root, 'env.example'), 'utf8');
        fs.writeFileSync(envPath, template.replace('ACCOUNT_1_EMAIL=email@example.com', email ? `ACCOUNT_1_EMAIL=${email}` : '# ACCOUNT_1_EMAIL=you@gmail.com'), { flag: 'wx', mode: 0o600 });
        console.log('Created .env');
    } else console.log('Preserved existing .env');
    const configPath = path.join(root, 'config.json');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '{}\n', { flag: 'wx', mode: 0o600 });
        console.log('Created config.json (uses built-in defaults)');
    } else console.log('Preserved existing config.json');
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
    console.log('\nSetup complete. Next:\n  1. Install Google Chrome if needed: https://www.google.com/chrome/\n  2. Set your ACCOUNT_1_EMAIL in .env (if not entered above).\n  3. npm run doctor\n  4. npm run manual-login -- --email YOUR_EMAIL\n  5. npm start\n\nRerun npm run setup after downloading updates; your settings and sessions are preserved.');
}
main().catch(error => { console.error(`Setup failed: ${error.message}`); process.exitCode = 1; });
