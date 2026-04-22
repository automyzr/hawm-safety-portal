param location string
param environmentName string
param staticWebAppName string
param actionGroupName string
param actionGroupShortName string
param metricAlertName string
param alertEmailAddress string

var tags = {
  project: 'hawm-safety-portal'
  environment: environmentName
  owner: 'automation@heave-away.ca'
  managedBy: 'github-copilot'
}

resource staticSite 'Microsoft.Web/staticSites@2025-03-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
    publicNetworkAccess: 'Enabled'
    buildProperties: {
      appLocation: '/'
      outputLocation: ''
      skipGithubActionWorkflowGeneration: false
    }
  }
  tags: tags
}

resource staticSiteAppSettings 'Microsoft.Web/staticSites/config@2022-09-01' = {
  name: 'appsettings'
  parent: staticSite
  properties: {
    AZURE_CLIENT_ID: 'SET_AFTER_APP_REGISTRATION'
    AZURE_CLIENT_SECRET: 'SET_AFTER_APP_REGISTRATION'
    HAWM_AAD_TENANT_ID: '9af4e171-076f-4cb4-9f6e-169823074c53'
    HAWM_SP_HOST: 'heaveawaynl.sharepoint.com'
    HAWM_SP_SITE_PATH: '/sites/HAWMTracker'
    HAWM_TENANT_DOMAIN: 'heave-away.ca'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  properties: {
    enabled: true
    groupShortName: actionGroupShortName
    armRoleReceivers: []
    automationRunbookReceivers: []
    azureAppPushReceivers: []
    azureFunctionReceivers: []
    emailReceivers: [
      {
        emailAddress: alertEmailAddress
        name: 'automation-heave-away'
        useCommonAlertSchema: true
      }
    ]
    eventHubReceivers: []
    itsmReceivers: []
    logicAppReceivers: []
    smsReceivers: []
    voiceReceivers: []
    webhookReceivers: []
  }
  tags: tags
}

resource availabilityAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: metricAlertName
  location: 'global'
  properties: {
    description: 'Alert on site errors for the HAWM Safety Portal Static Web App.'
    enabled: true
    scopes: [
      staticSite.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    severity: 2
    autoMitigate: true
    targetResourceType: 'Microsoft.Web/staticSites'
    targetResourceRegion: location
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'SiteErrorsCount'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'SiteErrors'
          metricNamespace: 'Microsoft.Web/staticSites'
          operator: 'GreaterThan'
          threshold: 25
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
  tags: tags
}

output staticWebAppResourceId string = staticSite.id
output staticWebAppHostname string = staticSite.properties.defaultHostname
output actionGroupResourceId string = actionGroup.id
