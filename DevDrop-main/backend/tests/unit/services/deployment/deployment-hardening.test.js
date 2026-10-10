const { buildVariableList } = require('../../../../src/services/deployment/envSync');
const Deployment = require('../../../../src/modules/deployment/deployment.model');

describe('deployment hardening', () => {
  test('resolves backend frontend-url variables only after frontend URL exists', () => {
    const envPlan = [
      { key: 'FRONTEND_URL', target: 'backend', source: 'auto', autoRole: 'frontend-url', required: false },
      { key: 'NODE_ENV', target: 'backend', source: 'auto', autoRole: 'static', required: false },
      { key: 'DATABASE_URL', target: 'backend', source: 'user', required: true },
    ];

    expect(buildVariableList(envPlan, 'backend', { frontendUrl: null, userSecrets: new Map([['DATABASE_URL', 'db']]) }))
      .toEqual([
        { key: 'NODE_ENV', value: 'production' },
        { key: 'DATABASE_URL', value: 'db' },
      ]);

    expect(buildVariableList(envPlan, 'backend', { frontendUrl: 'https://site.example', userSecrets: new Map([['DATABASE_URL', 'db']]) }))
      .toEqual([
        { key: 'FRONTEND_URL', value: 'https://site.example' },
        { key: 'NODE_ENV', value: 'production' },
        { key: 'DATABASE_URL', value: 'db' },
      ]);
  });

  test('deployment envPlan schema retains autoRole metadata', () => {
    const path = Deployment.schema.path('envPlan');
    const entrySchema = path.schema;
    expect(entrySchema.path('autoRole')).toBeDefined();
    expect(entrySchema.path('autoRole').enumValues).toEqual(['frontend-url', 'backend-url', 'static']);
  });
});
