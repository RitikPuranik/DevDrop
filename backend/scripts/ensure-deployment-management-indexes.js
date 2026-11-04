/* eslint-disable no-console */
// DevDrop uses Mongoose (no Prisma migrations). Run once after deploying the
// deployment-management feature to build the new collections' indexes,
// including the partial unique indexes that enforce "one live production per
// site" and "one active rollback per Vercel project".
//   node backend/scripts/ensure-deployment-management-indexes.js
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const models = [
    require('../src/modules/deployment/deploymentVersion.model'),
    require('../src/modules/deployment/rollbackOperation.model'),
    require('../src/modules/deployment/vercelWebhookEvent.model'),
  ];
  for (const Model of models) {
    await Model.syncIndexes();
    console.log(`indexes ready: ${Model.collection.name}`);
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
