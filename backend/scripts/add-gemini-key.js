require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const crypto = require('crypto');
const readline = require('readline');
const { getGeminiPoolDB, closeGeminiPoolDB } = require('../src/modules/gemini-pool/geminiPoolDb');
const { encrypt } = require('../src/modules/gemini-pool/geminiCrypto');
const { getModel } = require('../src/modules/gemini-pool/geminiApiKey.model');

function ask(question, { hidden = false } = {}) {
  if (!hidden) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }));
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write(question);

    let input = '';
    process.stdin.on('data', (chunk) => {
      const str = chunk.toString();

      if (str === '\u0003') {
        process.stdout.write('\nCancelled.\n');
        process.exit(130);
      }

      if (str === '\r' || str === '\n') {
        process.stdin.setRawMode?.(false);
        rl.close();
        process.stdout.write('\n');
        resolve(input.trim());
        return;
      }

      if (str === '\u007f') {
        input = input.slice(0, -1);
        return;
      }

      input += str;
    });

    // Keep the terminal usable without echoing the API key.
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
  });
}

async function main() {
  const label = (process.argv[2] || '').trim();
  const apiKeyArg = process.argv[3] || '';
  const priorityArg = process.argv[4];

  const resolvedLabel = label || await ask('Gemini key label: ');
  const rawKey = apiKeyArg.trim() || await ask('Gemini API key: ', { hidden: true });
  const priority = priorityArg === undefined ? 100 : Number(priorityArg);

  if (!resolvedLabel) throw new Error('Label is required.');
  if (!rawKey || rawKey.length < 10) throw new Error('A valid Gemini API key is required.');
  if (!Number.isFinite(priority)) throw new Error('Priority must be a number.');

  const fingerprint = crypto.createHash('sha256').update(rawKey).digest('hex');

  await getGeminiPoolDB();
  const Model = await getModel();

  const existing = await Model.findOne({ keyFingerprint: fingerprint });
  if (existing) {
    throw new Error(`This Gemini API key is already configured (id: ${existing._id}).`);
  }

  const doc = await Model.create({
    label: resolvedLabel,
    encryptedKey: encrypt(rawKey),
    keyFingerprint: fingerprint,
    keyPrefix: rawKey.slice(0, 4) || 'AIza',
    keySuffix: rawKey.slice(-4),
    enabled: true,
    priority,
    status: 'healthy',
  });

  console.log(`Gemini API key added successfully.`);
  console.log(`id: ${doc._id}`);
  console.log(`label: ${doc.label}`);
  console.log(`key: ${doc.keyPrefix}...${doc.keySuffix}`);
  console.log(`priority: ${doc.priority}`);
}

main()
  .catch((error) => {
    console.error(`Failed to add Gemini API key: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeGeminiPoolDB().catch(() => {});
  });
