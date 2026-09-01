const DeploymentProviderConnection = require('./deploymentProviderConnection.model');
const cryptoUtil = require('../../shared/utils/crypto');
const vercelProvider = require('../../services/deployment/providers/vercel.provider');
const renderProvider = require('../../services/deployment/providers/render.provider');
const { DEPLOYMENT_PROVIDERS } = require('../../shared/utils/constants');

const loadConnection = async (userId, provider) => {
  const connection = await DeploymentProviderConnection.findOne({ userId, provider }).select('+credentialEncrypted');
  if (!connection) {
    const err = new Error(`${provider === DEPLOYMENT_PROVIDERS.VERCEL ? 'Vercel' : 'Render'} isn't connected yet.`);
    err.status = 400;
    throw err;
  }
  return { connection, credential: cryptoUtil.decrypt(connection.credentialEncrypted) };
};

const getVercelAccounts = async (req, res) => {
  try {
    const { connection, credential } = await loadConnection(req.userId, DEPLOYMENT_PROVIDERS.VERCEL);
    const user = await vercelProvider.getAuthenticatedUser(credential);
    const teams = await vercelProvider.getTeams(credential);
    res.json({
      success: true,
      data: {
        personal: { id: null, name: user.username || user.email || 'Personal Account', type: 'personal' },
        teams,
        selectedTeamId: connection.metadata?.teamId || null,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not load Vercel accounts.' });
  }
};

const getVercelProjects = async (req, res) => {
  try {
    const { credential } = await loadConnection(req.userId, DEPLOYMENT_PROVIDERS.VERCEL);
    const teamId = req.query.teamId || null;
    const projects = await vercelProvider.listProjects(credential, teamId);
    res.json({ success: true, data: { projects, teamId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not load Vercel projects.' });
  }
};

const getRenderServices = async (req, res) => {
  try {
    const { connection, credential } = await loadConnection(req.userId, DEPLOYMENT_PROVIDERS.RENDER);
    const ownerId = req.query.ownerId || connection.metadata?.ownerId || null;
    if (!ownerId) return res.json({ success: true, data: { services: [], ownerId: null } });
    const services = await renderProvider.listServices(credential, ownerId);
    res.json({ success: true, data: { services, ownerId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not load Render services.' });
  }
};

module.exports = { getVercelAccounts, getVercelProjects, getRenderServices };
