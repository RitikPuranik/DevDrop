const User = require('../modules/user/user.model');
const Website = require('../modules/website/website.model');
const { WEBSITE_CATEGORIES, WEBSITE_STATUS } = require('../shared/utils/constants');

const demoSeller = {
  name: 'Ritik Puranik',
  email: 'ritikpuranik28@gmail.com',
  password: 'Ritik28@',
  phone: '9000000000',
};

const demoAdmin = {
  name: 'Admin',
  email: 'admin@example.com',
  password: 'Admin123',
  phone: '9000000001',
  role: 'admin',
  isVerified: true,
};

const demoWebsites = [
  {
    name: 'FoodGram',
    description: 'Social Media / Food Tech template. A social food platform where users discover and share food posts, follow other food lovers, and interact with local food vendor partners. Features include a scrollable food feed, reels, explore page, likes, comments, saves, and a dual role system for regular users and food business partners.',
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
    previewUrl: 'https://food-app-nine-liard.vercel.app/',
    githubUrl: 'https://github.com/RitikPuranik/FoodGram',
  },
  {
    name: 'ResumeAI',
    description: 'An AI-powered resume and career platform that helps users build resumes, analyze ATS compatibility, generate cover letters, practice mock interviews with AI-generated questions, match resumes to job descriptions, and track career readiness — all with a free and Pro subscription tier.',
    techStack: {
      frontend: ['React 19', 'Vite', 'Tailwind CSS'],
      backend: ['Node.js', 'Express'],
      database: ['MongoDB'],
      devops: ['JWT', 'Puppeteer'],
      other: ['Groq AI', 'Cloudinary', 'Razorpay'],
    },
    category: WEBSITE_CATEGORIES.PAID,
    price: 5000,
    deployedUrl: 'https://resume-ai-ruby-seven.vercel.app',
    previewUrl: 'https://resume-ai-ruby-seven.vercel.app',
    githubUrl: 'https://github.com/RitikPuranik/ResumeAI',
  },
];

const seedDemoMarketplace = async () => {
  if (process.env.DEMO_SEED_DISABLED === 'true') {
    return;
  }

  let admin = await User.findOne({ email: demoAdmin.email });
  if (!admin) {
    admin = await User.create(demoAdmin);
  } else {
    admin.name = demoAdmin.name;
    admin.password = demoAdmin.password;
    admin.phone = demoAdmin.phone;
    admin.role = demoAdmin.role;
    admin.isVerified = demoAdmin.isVerified;
    await admin.save();
  }

  let seller = await User.findOne({ email: demoSeller.email });
  if (!seller) {
    seller = await User.create(demoSeller);
  }

  for (const demo of demoWebsites) {
    await Website.findOneAndUpdate(
      { name: demo.name, sellerId: seller._id },
      {
        $set: {
          ...demo,
          sellerId: seller._id,
          status: WEBSITE_STATUS.APPROVED,
          isDeleted: false,
          adminComment: undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log('✅ Demo marketplace listings seeded');
};

module.exports = seedDemoMarketplace;
