require('dotenv').config();

const express = require('express');
const routes = require('./src/routes');
const { connectPoolDB } = require('./src/db');

const app = express();

app.use(express.json({ limit: '15mb' })); // generation requests carry fileData (existing project files)

app.use('/', routes);

const PORT = Number.parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, () => {
  console.log(`ai-service listening on port ${PORT}`);
});

// Fire-and-forget: the Gemini pool falls back to GEMINI_API_KEY/
// GEMINI_API_KEYS from the environment until/unless this connects, so
// generation works immediately even before Mongo is reachable.
connectPoolDB();

module.exports = app;
