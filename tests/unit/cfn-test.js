/*eslint-env node*/
'use strict';

const fs = require('fs');
const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
const sinon = require('sinon');
const chaiSinon = require('sinon-chai');
const CfnClient = require('../../lib/cfn');
const AWS = require('aws-sdk');
const { expect } = chai;

chai.use(chaiAsPromised);
chai.use(chaiSinon);

const templatePath = 'tests/fixtures/cfn.yaml';

const options = {
  accessKeyId: 'abc',
  secretAccessKey: 'def',
  region: 'us-east-1',
  stackName: 'myStack',
  templateBody: `file://${templatePath}`,
  parameters: {
    key1: 'val1',
    key2: 'val2',
    key3: undefined
  },
  capabilities: ['CAPABILITY_IAM'],
  resourceTypes: ['AWS::*'],
  roleArn: 'ROLE',
  stackPolicyBody: 'body',
  notificationARNs: 'arn',
  tags: {
    key1: 'val1',
    key2: 'val2'
  },
  timeoutInMinutes: 10,
  disableRollback: true,
  rollbackConfiguration: {
    MonitoringTimeInMinutes: 10
  },
  dummy: undefined
};

const templateBody = fs.readFileSync(templatePath, { encoding: 'utf8' });

const expectedOptions = {
  StackName: 'myStack',
  TemplateBody: templateBody,
  Parameters: [
    {
      ParameterKey: 'key1',
      ParameterValue: 'val1'
    },
    {
      ParameterKey: 'key2',
      ParameterValue: 'val2'
    }
  ],
  Capabilities: ['CAPABILITY_IAM'],
  ResourceTypes: ['AWS::*'],
  RoleArn: 'ROLE',
  StackPolicyBody: 'body',
  NotificationARNs: 'arn',
  Tags: [
    {
      Key: 'key1',
      Value: 'val1'
    },
    {
      Key: 'key2',
      Value: 'val2'
    }
  ],
  TimeoutInMinutes: 10,
  DisableRollback: true,
  RollbackConfiguration: {
    MonitoringTimeInMinutes: 10
  }
};

const describeData = {
  Stacks: [{
    StackName: 'myStack',
    StackStatus: 'CREATE_COMPLETE',
    Outputs: [
      {
        OutputKey: 'AssetsBucket',
        OutputValue: 'abc-123456789'
      },
      {
        OutputKey: 'CloudFrontDistribution',
        OutputValue: 'EFG123456789'
      }
    ]
  }]
};

describe('Cloudformation client', function() {
  let client;
  let logger;

  beforeEach(function() {
    client = new CfnClient(options);
    sinon.stub(client.awsClient, 'createStack').returns({
      promise: sinon.fake.resolves()
    });
    sinon.stub(client.awsClient, 'updateStack').returns({
      promise: sinon.fake.resolves()
    });
    sinon.stub(client.awsClient, 'waitFor').returns({
      promise: sinon.fake.resolves()
    });
    sinon.stub(client.awsClient, 'describeStacks').returns({
      promise: sinon.fake.resolves(describeData)
    });
    sinon.stub(client.awsClient, 'validateTemplate').returns({
      promise: sinon.fake.resolves()
    });

    // minimal logger interface
    logger = {
      log: sinon.fake(),
      error: sinon.fake(),
      debug: sinon.fake()
    };

    client.logger = logger;
  });

  afterEach(function() {
    sinon.restore();
  });

  it('passes constructor args to AWS.CloudFormation', function() {
    let constructor = sinon.fake();
    sinon.replace(AWS, 'CloudFormation', constructor);

    new CfnClient({
      foo: 'bar',
      accessKeyId: 'abc',
      secretAccessKey: 'def',
      region: 'us-east-1'
    });

    expect(constructor).to.always.have.been.calledWithNew;
    expect(constructor).to.have.been.calledWith({
      apiVersion: '2010-05-15',
      accessKeyId: 'abc',
      secretAccessKey: 'def',
      region: 'us-east-1'
    });
  });

  function checkCreateStack(callFn) {
    it('it calls createStack with adjusted options', async function() {
      await expect(callFn()).to.be.fulfilled;
      expect(client.awsClient.createStack).to.have.been.calledWith(expectedOptions);
    });

    it('it waits for stackCreateComplete', async function() {
      await expect(callFn()).to.be.fulfilled;
      expect(client.awsClient.waitFor).to.have.been.calledWith('stackCreateComplete', { StackName: 'myStack' });
      expect(logger.debug).to.have.been.calledWith(`Creating new CloudFormation stack 'myStack'...`);
      expect(logger.log).to.have.been.calledWith(`New CloudFormation stack 'myStack' has been created!`);
      expect(logger.debug).to.have.been.calledBefore(logger.log);
    });

    it('rejects when createStack fails', function() {
      client.awsClient.createStack.returns({
        promise: sinon.fake.rejects()
      });

      return expect(callFn()).to.be.rejected;
    });
  }

  function checkUpdateStack(callFn) {
    it('it calls updateStack with adjusted options', async function() {
      await expect(callFn()).to.be.fulfilled;
      expect(client.awsClient.updateStack).to.have.been.calledWith(expectedOptions);
    });

    it('it waits for stackUpdateComplete', async function() {
      await expect(callFn()).to.be.fulfilled;
      expect(client.awsClient.waitFor).to.have.been.calledWith('stackUpdateComplete', { StackName: 'myStack' });
      expect(logger.debug).to.have.been.calledWith(`Updating CloudFormation stack 'myStack'...`);
      expect(logger.log).to.have.been.calledWith(`CloudFormation stack 'myStack' has been updated!`);
      expect(logger.debug).to.have.been.calledBefore(logger.log);
    });

    it('rejects when updateStack fails', function() {
      client.awsClient.updateStack.returns({
        promise: sinon.fake.rejects()
      });

      return expect(callFn()).to.be.rejected;
    });

    it('ignores unchanged stack', async function() {
      client.awsClient.updateStack.returns({
        promise: sinon.fake.rejects('No updates are to be performed')
      });

      await expect(callFn()).to.be.fulfilled;
      expect(client.awsClient.waitFor).to.not.have.been.called;
      expect(logger.debug).to.have.been.calledWith(`No updates are to be performed to CloudFormation stack 'myStack'`);
    });
  }

  describe('createStack', function() {
    checkCreateStack(() => client.createStack());
  });

  describe('updateStack', function() {
    checkUpdateStack(() => client.updateStack());
  });

  describe('validateTemplate', function() {
    it('resolves for valid template', async function() {
      await expect(client.validateTemplate()).to.be.fulfilled;
      expect(client.awsClient.validateTemplate).to.have.been.calledWith({
        TemplateBody: templateBody
      })
    });

    it('rejects for invalid template', async function() {
      client.awsClient.validateTemplate.returns({
        promise: sinon.fake.rejects('template error')
      });
      await expect(client.validateTemplate()).to.be.rejected;
      expect(client.awsClient.validateTemplate).to.have.been.calledWith({
        TemplateBody: templateBody
      })
    });
  });

  describe('stackExists', function() {
    it('returns true when stack exists', function() {
      return expect(client.stackExists()).to.eventually.be.true;
    });

    it('returns false when stack does not exists', function() {
      client.awsClient.describeStacks.returns({
        promise: sinon.fake.rejects('Stack with id myStack does not exist')
      });
      return expect(client.stackExists()).to.eventually.be.false;
    });
  });

  describe('createOrUpdateStack', function() {
    describe('stack does not exist', function() {
      beforeEach(function() {
        sinon.stub(client, 'stackExists').resolves(false);
      });

      checkCreateStack(() => client.createOrUpdateStack());
    });

    describe('stack exists', function() {
      beforeEach(function() {
        sinon.stub(client, 'stackExists').resolves(true);
      });

      checkUpdateStack(() => client.createOrUpdateStack());
    });
  });

  describe('fetchOutputs', function() {
    it('returns adjusted output hash', function() {
      return expect(client.fetchOutputs()).to.eventually.deep.equal({
        AssetsBucket: 'abc-123456789',
        CloudFrontDistribution: 'EFG123456789'
      });
    });

    it('returns empty hash when no outputs are found', function() {
      let emptyDescribeData = JSON.parse(JSON.stringify(describeData));
      delete emptyDescribeData.Stacks[0].Outputs;
      client.awsClient.describeStacks.returns({
        promise: sinon.fake.resolves(emptyDescribeData)
      });

      return expect(client.fetchOutputs()).to.eventually.deep.equal({});
    });
  });

});
