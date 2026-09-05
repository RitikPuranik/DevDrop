const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const connectDB = require('../src/shared/config/database');
const Website = require('../src/modules/website/website.model');
const supabase = require('../src/shared/config/supabase');
const { SUPABASE_BUCKET, SUPABASE_FOLDERS } = require('../src/shared/utils/constants');

const TARGET_FOLDERS = [
  SUPABASE_FOLDERS.SOURCE_CODE,
  SUPABASE_FOLDERS.DOCS,
  SUPABASE_FOLDERS.VIDEOS,
  SUPABASE_FOLDERS.PREVIEW_VIDEOS,
];
const PAGE_SIZE = 1000;

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    dryRun: !args.has('--apply'),
  };
};

const getWebsiteAssetPaths = async () => {
  const websites = await Website.find({ isDeleted: { $ne: true } })
    .select('name sourceCodeUrl docsUrl videoUrl previewVideoUrl')
    .lean();

  const keepPaths = new Set();

  for (const website of websites) {
    for (const filePath of [website.sourceCodeUrl, website.docsUrl, website.videoUrl, website.previewVideoUrl]) {
      if (typeof filePath === 'string' && filePath.trim() && !/^https?:\/\//.test(filePath)) {
        keepPaths.add(filePath.trim());
      }
    }
  }

  return keepPaths;
};

const listFolderFiles = async (folder) => {
  const allFiles = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`Failed to list ${folder}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      if (!entry || !entry.name) continue;
      allFiles.push(`${folder}/${entry.name}`);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return allFiles;
};

const chunk = (items, size) => {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
};

const runCleanup = async ({ apply = false } = {}) => {
  const dryRun = !apply;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  await connectDB();

  const keepPaths = await getWebsiteAssetPaths();
  const allTrackedFiles = [];

  for (const folder of TARGET_FOLDERS) {
    const folderFiles = await listFolderFiles(folder);
    allTrackedFiles.push(...folderFiles);
  }

  const staleFiles = allTrackedFiles.filter((filePath) => !keepPaths.has(filePath));

  console.log(`Found ${allTrackedFiles.length} tracked Supabase files across ${TARGET_FOLDERS.join(', ')}`);
  console.log(`Keeping ${keepPaths.size} file references from active websites`);
  console.log(`Orphaned files to remove: ${staleFiles.length}`);

  if (staleFiles.length > 0) {
    staleFiles.forEach((filePath) => console.log(`- ${filePath}`));
  }

  if (apply && staleFiles.length > 0) {
    for (const batch of chunk(staleFiles, 100)) {
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove(batch);
      if (error) {
        throw new Error(`Failed to delete Supabase files: ${error.message}`);
      }
    }

    console.log('Cleanup completed successfully');
  } else if (dryRun) {
    console.log('Dry run only. Re-run with --apply to delete the orphaned files.');
  } else {
    console.log('No orphaned files found. Nothing to delete.');
  }
};

if (require.main === module) {
  const { apply } = parseArgs();

  runCleanup({ apply })
    .catch((error) => {
      console.error('Supabase cleanup failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { runCleanup };