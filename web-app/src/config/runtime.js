const configuredValue = (available, value, fallback = '') => (
  available ? value : fallback
);

export const RUNTIME_CONFIG = Object.freeze({
  isProduction: configuredValue(
    typeof __IS_PRODUCTION__ !== 'undefined',
    typeof __IS_PRODUCTION__ !== 'undefined' ? __IS_PRODUCTION__ : false,
    false
  ),
  apiUrl: configuredValue(
    typeof __API_URL__ !== 'undefined',
    typeof __API_URL__ !== 'undefined' ? __API_URL__ : ''
  ),
  wsUrl: configuredValue(
    typeof __WS_URL__ !== 'undefined',
    typeof __WS_URL__ !== 'undefined' ? __WS_URL__ : ''
  ),
  identityMode: configuredValue(
    typeof __IDENTITY_MODE__ !== 'undefined',
    typeof __IDENTITY_MODE__ !== 'undefined' ? __IDENTITY_MODE__ : 'local',
    'local'
  ),
  keycloakUrl: configuredValue(
    typeof __KEYCLOAK_URL__ !== 'undefined',
    typeof __KEYCLOAK_URL__ !== 'undefined' ? __KEYCLOAK_URL__ : 'http://localhost:8080',
    'http://localhost:8080'
  ),
  keycloakRealm: configuredValue(
    typeof __KEYCLOAK_REALM__ !== 'undefined',
    typeof __KEYCLOAK_REALM__ !== 'undefined' ? __KEYCLOAK_REALM__ : 'medimesh',
    'medimesh'
  ),
  keycloakClientId: configuredValue(
    typeof __KEYCLOAK_CLIENT_ID__ !== 'undefined',
    typeof __KEYCLOAK_CLIENT_ID__ !== 'undefined' ? __KEYCLOAK_CLIENT_ID__ : 'medimesh-client',
    'medimesh-client'
  ),
  showDemoLogin: configuredValue(
    typeof __SHOW_DEMO_LOGIN__ !== 'undefined',
    typeof __SHOW_DEMO_LOGIN__ !== 'undefined' ? __SHOW_DEMO_LOGIN__ : false,
    false
  )
});
