// Shared wiring for the version-sync / logs service tests (jest.mock calls must live in the test files themselves).
const mongoose = require('mongoose');

const seedSite = (Deployment, o = {}) =>
  Deployment.create({ userId: 'u1', frontendProvider: 'vercel', status: 'SUCCESS', vercel: { projectId: 'prj_1', deploymentId: 'd4' }, versioning: { seq: 0, syncLockUntil: null }, ...o });

const vdep = (id, createdAt, o = {}) => ({ id, projectId: 'prj_1', url: `https://${id}.vercel.app`, state: 'READY', readySubstate: 'PROMOTED', target: 'production', environment: 'production', createdAt, buildingAt: createdAt + 10, readyAt: createdAt + 50, durationMs: 40, commitSha: `sha-${id}`, commitMessage: `msg ${id}`, commitRef: 'main', errorCode: null, errorMessage: null, ...o });

const stubNoTransactions = () =>
  jest.spyOn(mongoose, 'startSession').mockRejectedValue(Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 }));

const modelDefs = () => {
  const { createFakeModel } = require('../../../../helpers/fakeManagementDb');
  return {
    Deployment: () => createFakeModel({ defaults: () => ({ versioning: { seq: 0, syncLockUntil: null } }) }),
    DeploymentVersion: () => createFakeModel({
      defaults: () => ({ isCurrentProduction: false, availability: 'available' }),
      uniques: [
        { fields: ['deploymentRef', 'vercelDeploymentId'] },
        { fields: ['deploymentRef', 'versionNumber'] },
        { fields: ['deploymentRef'], partial: (d) => d.isCurrentProduction === true },
      ],
    }),
  };
};

module.exports = { seedSite, vdep, stubNoTransactions, modelDefs };
