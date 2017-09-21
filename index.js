'use strict';

const fs = require('fs');

const utils = require('./lib/utils');

module.exports = class ServerlessBootstrap {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.region = this.options.region ? this.options.region : 'us-east-1';

    this.commands = {
      bootstrap: {
        usage: 'Bootstrap to deploy account level aws resources',
        lifecycleEvents: [
          'deploy',
        ],
        options: {
          region: {
            usage:
              'Specify the region you want to deploy '
              + '(e.g. "--region us-east-1" or "-r us-east-1")',
            required: true,
            shortcut: 'r',
          },
        },
      },
    };

    this.iam = new this.provider.sdk.IAM({
      region: this.region
    });
    this.s3 = new this.provider.sdk.S3({
      region: this.region
    });
    this.cloudformation = new this.provider.sdk.CloudFormation({
      region: this.region
    });

    Object.assign(this,
      utils
    );

    this.hooks = {
      'bootstrap:deploy': this.bootstrapDeploy.bind(this),
    };
  }

  bootstrapDeploy() {
    this.serverless.cli.log('Creating CloudFormation stack for account level resources...');

    const stackName = "account-cloudformation";
    const executeApiRoleName = `attributes-ExecuteApiRole-${this.region}`;
    //TODO: check custom.allowedAccounts, diff with stage?
    let allowedAccounts = this.serverless.service.custom.allowedAccounts ? this.serverless.service.custom.allowedAccounts : [];
    let executeApiIAMPolicyResource, cloudformationParams;

    const templateKey = "cloudformation-template.json";
    let bucket, templateLocation;


    Promise.resolve()
      .then(() =>  this.getAccountId())
      .then((id) => {
        bucket = `account-${id}-cloudformation-templates-${this.region}`;
        templateLocation = `https://${bucket}.s3.amazonaws.com/${templateKey}`;

        executeApiIAMPolicyResource = `arn:aws:execute-api:${this.region}:${id}:*/*`;
        const accountArn = `arn:aws:iam::${id}:root`;
        allowedAccounts.push(accountArn);
        cloudformationParams = this.getCloudformationParams(allowedAccounts, executeApiRoleName, executeApiIAMPolicyResource);
      })
      .then(() => this.checkBucketExists(bucket))
      .then((exist) => {
        if(!exist){
          return this.s3.createBucket({
            Bucket: bucket,
            CreateBucketConfiguration: {
              LocationConstraint: this.region
            }
          })
          .promise();
        }
      })
      .then(() => {
        var fileBuffer = fs.readFileSync(require('path').resolve(__dirname, templateKey));

        return this.s3.putObject({
          Body: fileBuffer,
          Bucket: bucket,
          Key: templateKey
        })
        .promise();
      })
      .then(() => {
        return this.cloudformation.validateTemplate({
          TemplateURL: templateLocation
        })
        .promise();
      })
      .then(() =>  this.checkStackExists(stackName))
      .then((exist) => {
        if (exist) {
          return this.cloudformation.updateStack({
            StackName: stackName,
            TemplateURL: templateLocation,
            Capabilities: ['CAPABILITY_NAMED_IAM'],
            Parameters: cloudformationParams
          })
          .promise()
          .then(() => {
            return this.cloudformation.waitFor('stackUpdateComplete', {
              StackName: stackName
            })
            .promise();
          });
        } else {
          return this.cloudformation.createStack({
            StackName: stackName,
            TemplateURL: templateLocation,
            Capabilities: ['CAPABILITY_NAMED_IAM'],
            Parameters: cloudformationParams
          })
          .promise()
          .then(() => {
            return this.cloudformation.waitFor('stackCreateComplete', {
              StackName: stackName
            })
            .promise();
          });
        }
      })
      .catch((e) => {
        if (e.statusCode === 400 || e.meassage === 'No updates are to be performed.') {
          this.serverless.cli.log('No updates are to be performed.');
        } else {
          throw e;
        }
      });
  }

};
