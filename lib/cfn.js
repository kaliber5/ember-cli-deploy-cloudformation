'use strict';

const AWS = require('aws-sdk');

function hash2ArrayHash(hash, keyProperty = 'Key', valueProperty = 'Value') {
  return Object.keys(hash)
    .map(key => ({
      [keyProperty]: key,
      [valueProperty]: hash[key]
    }));
}

function ucFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


class CfnClient {

  constructor(options) {

    let awsOptions = {
      region: options.region,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    };

    if (options.profile) {
      awsOptions.credentials = new AWS.SharedIniFileCredentials({ profile });
    }

    let cfnOptions = Object.assign({}, options);
    delete cfnOptions.region;
    delete cfnOptions.accessKeyId;
    delete cfnOptions.secretAccessKey;
    delete cfnOptions.profile;

    this.setOptions(cfnOptions);
    this.awsClient = new AWS.CloudFormation(awsOptions);
  }

  validateTemplate() {
    return this.awsClient.validateTemplate({
      TemplateBody: this.options.templateBody,
      TemplateURL: this.options.templateUrl
    }).promise();
  }

  stackExists() {
    return this.awsClient
      .describeStacks({ StackName: this.options.stackName })
      .promise()
      .then(() => true)
      .catch((err) => {
        if (String(err).endsWith('does not exist')) {
          return false;
        }
        throw err;
      });
  }

  createStack() {
    return this.awsClient
      .createStack(this.awsOptions)
      .promise()
      .then(() => this.awsClient.waitFor('stackCreateComplete', { StackName: this.options.stackName }).promise());
  }

  updateStack() {
    return this.awsClient
      .updateStack(this.awsOptions)
      .promise()
      .then(() => this.awsClient.waitFor('stackUpdateComplete', { StackName: this.options.stackName }).promise())
      .catch(err => {
        if (!String(err).includes('No updates are to be performed')) {
          throw err;
        }
      });
  }

  createOrUpdateStack() {
    return this.stackExists()
      .then(result => {
        if (result === true) {
          return this.updateStack();
        }
        return this.createStack();
      })
  }

  setOptions(options) {
    this.options = options;

    this.awsOptions = Object.keys(options)
      .map(origKey => {
        let value = options[origKey];
        let key = ucFirst(origKey);

        if (origKey === 'parameters') {
          value = hash2ArrayHash(value, 'ParameterKey', 'ParameterValue');
        } else if (origKey === 'tags') {
          value = hash2ArrayHash(value);
        }

        return { [key]: value };
      })
      .reduce((result, item) => Object.assign(result, item), {});
  }

}

module.exports = CfnClient;