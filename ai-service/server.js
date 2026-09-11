require('dotenv').config();

const express = require('express');
const routes = require('./src/routes');

const app = express();

app.use(express.json({ limit: '15mb' })); // generation requests carry fileData (existing project files)

app.use('/', routes);

const PORT = Number.parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, () => {
  console.log(`ai-service listening on port ${PORT}`);
});

module.exports = app;
