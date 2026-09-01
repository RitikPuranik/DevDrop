const { DEPLOYMENT_PROVIDERS } = require('../../../shared/utils/constants');
const vercelProvider = require('./vercel.provider');
const renderProvider = require('./render.provider');

const PROVIDERS = {
  [DEPLOYMENT_PROVIDERS.VERCEL]: vercelProvider,
  [DEPLOYMENT_PROVIDERS.RENDER]: renderProvider,
};

/**
 * Adding a new deployment target later is: implement provider.interface.js's
 * contract in a new file, register it here, and add a matching `provider`
 * value to a framework rule in analyzer/frameworkRules.js. Nothing in the
 * orchestrator needs to change.
 */
const getProvider = (name) => {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown deployment provider "${name}".`);
  return provider;
};

module.exports = { getProvider };
