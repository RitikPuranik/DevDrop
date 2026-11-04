'use strict';

const DeploymentProviderConnection = require('../../modules/deployment/deploymentProviderConnection.model');
const cryptoUtil = require('../../shared/utils/crypto');
const { DEPLOYMENT_PROVIDERS } = require('../../shared/utils/constants');
const { ManagementError } = require('./managementError');

/** A site is manageable here only if its frontend lives in a Vercel project DevDrop created/adopted. */
const isVercelSite = (site) => Boolean(site && site.frontendProvider === DEPLOYMENT_PROVIDERS.VERCEL && site.vercel?.projectId);

/**
 * Resolves the owner's Vercel credential server-side. The credential is
 * returned to the caller for immediate use only: it is never placed on a
 * response, a deployment/version record, an operation record or a log line.
 * Uses the same encrypted-at-rest connection record the deploy flow uses.
 */
const loadVercelContext = async (site) => {
  if (!isVercelSite(site)) {
    throw new ManagementError(409, 'NOT_A_VERCEL_SITE', 'This deployment is not hosted on Vercel, so deployment history is not available for it.');
  }
  const connection = await DeploymentProviderConnection.findOne({ userId: site.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL }).select('+credentialEncrypted');
  if (!connection) {
    throw new ManagementError(409, 'VERCEL_NOT_CONNECTED', 'Vercel isn\'t connected. Reconnect it under Connected Accounts and try again.');
  }
  let credential;
  try {
    credential = cryptoUtil.decrypt(connection.credentialEncrypted);
  } catch {
    throw new ManagementError(409, 'VERCEL_CREDENTIAL_UNREADABLE', 'The stored Vercel connection could not be read. Reconnect Vercel and try again.');
  }
  return { credential, metadata: connection.metadata || {}, projectId: site.vercel.projectId };
};

module.exports = { isVercelSite, loadVercelContext };
