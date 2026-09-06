const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const User = require('../src/modules/user/user.model');
const Website = require('../src/modules/website/website.model');
const supabaseService = require('../src/services/supabase.service');
const { WEBSITE_CATEGORIES, WEBSITE_STATUS } = require('../src/shared/utils/constants');

const DEFAULT_MONGODB_URI = 'mongodb+srv://ritikpuranik28_db_user:DevDrop%40@devdrop.2pkpish.mongodb.net/?appName=DevDrop';
const ATLAS_FALLBACKS = {
  'devdrop.2pkpish.mongodb.net': {
    hosts: [
      'ac-sy9tzfy-shard-00-00.2pkpish.mongodb.net:27017',
      'ac-sy9tzfy-shard-00-01.2pkpish.mongodb.net:27017',
      'ac-sy9tzfy-shard-00-02.2pkpish.mongodb.net:27017',
    ],
    replicaSet: 'atlas-1qbels-shard-0',
  },
};

const foodGram = {
  seller: {
    name: 'Ritik Puranik',
    email: 'ritikpuranik28@gmail.com',
    password: 'Ritik28@',
    phone: '9000000000',
    isVerified: true,
  },
  website: {
    name: 'FoodGram',
    description:
      'Social Media / Food Tech template. A social food platform where users discover and share food posts, follow other food lovers, and interact with local food vendor partners. Features include a scrollable food feed, reels, explore page, likes, comments, saves, and a dual role system for regular users and food business partners.',
    techStack: {
      frontend: ['React', 'Vite', 'Framer Motion'],
      backend: ['Node.js', 'Express'],
      database: ['MongoDB', 'Mongoose'],
      devops: ['ImageKit', 'JWT', 'Axios'],
      other: [],
    },
    category: WEBSITE_CATEGORIES.PAID,
    price: 5000,
    deployedUrl: 'https://food-app-nine-liard.vercel.app/',
    githubUrl: 'https://github.com/RitikPuranik/FoodGram',
  },
  files: {
    sourceCode: process.env.FOODGRAM_SOURCE_ZIP || path.resolve(__dirname, '../tmp/FoodGram-source-clean.zip'),
    docs: process.env.FOODGRAM_DOCS_PDF || 'C:\\Users\\mjprj1\\Downloads\\FoodGram_Deployment_Guide.pdf',
    previewVideo: process.env.FOODGRAM_PREVIEW_VIDEO || 'C:\\Users\\mjprj1\\Videos\\Captures\\FoodGram - Google Chrome 2026-05-22 12-35-09.mp4',
  },
};

const requireEnv = (name) => {
  if (!process.env[name] || process.env[name].trim().length === 0) {
    throw new Error(`${name} is required in backend/.env`);
  }
};

const assertFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
};

const toUploadFile = (filePath, mimetype) => {
  const stat = fs.statSync(filePath);

  return {
    buffer: fs.readFileSync(filePath),
    mimetype,
    size: stat.size,
    originalname: path.basename(filePath),
  };
};

const uploadFoodGramFiles = async () => {
  assertFile(foodGram.files.sourceCode, 'Source code');
  assertFile(foodGram.files.docs, 'Documentation');
  assertFile(foodGram.files.previewVideo, 'Preview video');

  const sourceCode = await supabaseService.uploadSourceCode(
    toUploadFile(foodGram.files.sourceCode, 'application/zip')
  );
  console.log(`Uploaded source code: ${sourceCode.path}`);

  const docs = await supabaseService.uploadDocs(
    toUploadFile(foodGram.files.docs, 'application/pdf')
  );
  console.log(`Uploaded docs: ${docs.path}`);

  const previewVideo = await supabaseService.uploadPreviewVideo(
    toUploadFile(foodGram.files.previewVideo, 'video/mp4')
  );
  console.log(`Uploaded preview video: ${previewVideo.path}`);

  return { sourceCode, docs, previewVideo };
};

const getAtlasFallbackUri = (mongoUri) => {
  const parsed = new URL(mongoUri);
  const fallback = ATLAS_FALLBACKS[parsed.hostname];

  if (!fallback || parsed.protocol !== 'mongodb+srv:') return null;

  const params = new URLSearchParams(parsed.search);
  params.set('tls', 'true');
  params.set('authSource', 'admin');
  params.set('replicaSet', fallback.replicaSet);
  params.set('retryWrites', params.get('retryWrites') || 'true');
  params.set('w', params.get('w') || 'majority');

  return `mongodb://${parsed.username}:${parsed.password}@${fallback.hosts.join(',')}/?${params.toString()}`;
};

const connectMongo = async () => {
  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  } catch (error) {
    const fallbackUri = getAtlasFallbackUri(mongoUri);
    if (!fallbackUri || !['querySrv', 'ETIMEOUT', 'ECONNREFUSED'].some((term) => error.message.includes(term))) {
      throw error;
    }

    console.warn('MongoDB SRV lookup failed, retrying with direct Atlas hosts');
    await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 30000 });
  }

  console.log(`Connected to MongoDB: ${mongoose.connection.host}`);
};

const upsertSeller = async () => {
  const email = foodGram.seller.email.toLowerCase();
  let seller = await User.findOne({ email });

  if (!seller) {
    seller = await User.create({ ...foodGram.seller, email });
    console.log(`Created seller: ${email}`);
    return seller;
  }

  seller.name = foodGram.seller.name;
  seller.isVerified = true;
  await seller.save();
  console.log(`Using existing seller: ${email}`);
  return seller;
};

const publishFoodGram = async () => {
  requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  await connectMongo();

  const seller = await upsertSeller();
  const uploaded = await uploadFoodGramFiles();

  const website = await Website.findOneAndUpdate(
    { name: foodGram.website.name, sellerId: seller._id },
    {
      $set: {
        ...foodGram.website,
        previewUrl: uploaded.previewVideo.publicUrl,
        sellerId: seller._id,
        status: WEBSITE_STATUS.APPROVED,
        isDeleted: false,
        sourceCodeUrl: uploaded.sourceCode.path,
        docsUrl: uploaded.docs.path,
        previewVideoUrl: uploaded.previewVideo.path,
        files: {
          sourceCode: uploaded.sourceCode,
          docs: uploaded.docs,
          previewVideo: uploaded.previewVideo,
        },
        adminComment: undefined,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('sellerId', 'name email');

  console.log('FoodGram template published');
  console.log(`Listing id: ${website._id}`);
  console.log(`Seller: ${website.sellerId.email}`);
  console.log(`Preview video public URL: ${uploaded.previewVideo.publicUrl}`);
};

publishFoodGram()
  .catch((error) => {
    console.error('FoodGram import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
