targetScope = 'subscription'

@description('Azure location for the resource group and Static Web App')
param location string = 'eastus2'

@description('Deployment environment name')
param environmentName string = 'prod'

@description('Resource group name for the HAWM Safety Portal')
param resourceGroupName string = 'rg-hawm-safety-portal-prod-eus2-01'

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

@description('Budget start date in ISO8601 format. Must be the first day of a month.')
param budgetStartDate string = '2026-04-01T00:00:00Z'

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

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: budgetName
  properties: {
    amount: budgetAmount
    category: 'Cost'
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    filter: {
      dimensions: {
        name: 'ResourceGroupName'
        operator: 'In'
        values: [
          resourceGroupName
        ]
      }
    }
    notifications: {
      Actual_GreaterThanOrEqualTo_100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [
          alertEmailAddress
        ]
        contactGroups: []
        contactRoles: []
        locale: 'en-us'
      }
    }
  }
}

output resourceGroupId string = portalRg.id
output staticWebAppResourceId string = resourceGroupStack.outputs.staticWebAppResourceId
output staticWebAppHostname string = resourceGroupStack.outputs.staticWebAppHostname
output actionGroupResourceId string = resourceGroupStack.outputs.actionGroupResourceId
output budgetResourceId string = budget.id
