'use strict';

moudle.exports = {

  getAccountId() {
    return this.iam.getUser({})
      .promise()
      .then((data) => {
        return data.User.Arn.split(':')[4];
      });
  },

  checkBucketExists(bucket) {
      return this.s3.headBucket({
          Bucket: bucket
      })
      .promise()
      .then((data) => true)
      .catch((err) => false);
  },

  checkStackExists(stackName) {
      return this.cloudformation.describeStacks({
          StackName: stackName
      })
      .promise()
      .then((data) => true)
      .catch((err) => false);
  },

  getCloudformationParams(allowedAccounts, executeApiRoleName, executeApiIAMPolicyResource) {
      Parameters = [{
          ParameterKey: 'ExecuteApiAllowedAccounts',
          ParameterValue: allowedAccounts.join(','),
          UsePreviousValue: false
      },{
          ParameterKey: 'ExecuteApiRoleName',
          ParameterValue: executeApiRoleName,
          UsePreviousValue: false
      },{
          ParameterKey: 'ExecuteApiIAMPolicyResource',
          ParameterValue: executeApiIAMPolicyResource,
          UsePreviousValue: false
      }]
      return Parameters;
  }

};