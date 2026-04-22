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

module staticSite 'br/public:avm/res/web/static-site:0.8.0' = {
  name: 'hawmSafetyPortalStaticSite'
  params: {
    name: staticWebAppName
    location: location
    sku: 'Standard'
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    tags: tags
    appSettings: {
      AZURE_CLIENT_ID: 'SET_AFTER_APP_REGISTRATION'
      AZURE_CLIENT_SECRET: 'SET_AFTER_APP_REGISTRATION'
      HAWM_SP_HOST: 'heaveawaynl.sharepoint.com'
      HAWM_SP_SITE_PATH: '/sites/HAWMTracker'
      HAWM_TENANT_DOMAIN: 'heave-away.ca'
    }
  }
}

module actionGroup 'br/public:avm/res/insights/action-group:0.5.0' = {
  name: 'hawmSafetyPortalActionGroup'
  params: {
    name: actionGroupName
    groupShortName: actionGroupShortName
    location: 'global'
    emailReceivers: [
      {
        emailAddress: alertEmailAddress
        name: 'automation-heave-away'
        useCommonAlertSchema: true
      }
    ]
    tags: tags
  }
}

module availabilityAlert 'br/public:avm/res/insights/metric-alert:0.6.0' = {
  name: 'hawmSafetyPortalAvailabilityAlert'
  params: {
    name: metricAlertName
    location: 'global'
    scopes: [
      staticSite.outputs.resourceId
    ]
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allof: [
        {
          name: 'Http5xxCount'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'Requests'
          operator: 'GreaterThan'
          threshold: 25
          timeAggregation: 'Total'
          dimensions: [
            {
              name: 'StatusCode'
              operator: 'Include'
              values: [
                '500'
                '502'
                '503'
                '504'
              ]
            }
          ]
        }
      ]
    }
    actions: [
      actionGroup.outputs.resourceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    severity: 2
    autoMitigate: true
    tags: tags
  }
}

output staticWebAppResourceId string = staticSite.outputs.resourceId
output staticWebAppHostname string = staticSite.outputs.defaultHostname
output actionGroupResourceId string = actionGroup.outputs.resourceId
