targetScope = 'subscription'

@description('Azure location for the resource group and Static Web App')
param location string = 'canadacentral'

@description('Deployment environment name')
param environmentName string = 'prod'

@description('Resource group name for the HAWM Safety Portal')
param resourceGroupName string = 'rg-hawm-safety-portal-prod-cca-01'

@description('Static Web App resource name')
param staticWebAppName string

@description('Action Group resource name')
param actionGroupName string

@description('Action Group short name')
param actionGroupShortName string

@description('Metric alert resource name')
param metricAlertName string

@description('Budget resource name')
param budgetName string = 'budget-hawm-safety-portal-prod-subscription-01'

@description('Budget warning amount in USD')
param budgetAmount int

@description('Alert email address for budget notifications')
param alertEmailAddress string

var tags = {
  project: 'hawm-safety-portal'
  environment: environmentName
  owner: 'automation@heave-away.ca'
  managedBy: 'github-copilot'
}

resource portalRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resourceGroupStack './rg-resources.bicep' = {
  name: 'hawmSafetyPortalRgStack'
  scope: portalRg
  params: {
    location: location
    environmentName: environmentName
    staticWebAppName: staticWebAppName
    actionGroupName: actionGroupName
    actionGroupShortName: actionGroupShortName
    metricAlertName: metricAlertName
    alertEmailAddress: alertEmailAddress
  }
}

module budget 'br/public:avm/res/consumption/budget:0.4.0' = {
  name: 'hawmSafetyPortalBudget'
  params: {
    amount: budgetAmount
    name: budgetName
    contactEmails: [
      alertEmailAddress
    ]
    location: location
    resourceGroupFilter: [
      resourceGroupName
    ]
    thresholds: [
      100
    ]
  }
}

output resourceGroupId string = portalRg.id
output staticWebAppResourceId string = resourceGroupStack.outputs.staticWebAppResourceId
output staticWebAppHostname string = resourceGroupStack.outputs.staticWebAppHostname
output actionGroupResourceId string = resourceGroupStack.outputs.actionGroupResourceId
output budgetResourceId string = budget.outputs.resourceId
