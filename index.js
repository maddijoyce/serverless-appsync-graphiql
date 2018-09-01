"use strict";
const AWS = require("aws-sdk");
const koa = require("koa");
const koaApollo = require("apollo-server-koa");
const opn = require("opn");

class ServerlessAppsyncGraphiqlPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.provider = this.serverless.getProvider("aws");
    this.config = this.serverless.service.custom.appSync;
    this.stackName = `${this.serverless.service.getServiceName()}-${this.provider.getStage()}`;

    this.commands = {
      graphiql: {
        usage: "Start a graphiql server using appsync config",
        options: {
          username: {
            usage: "Specify your cognito username",
            shortcut: "u",
            required: false
          },
          password: {
            usage: "Specify your cognito password",
            shortcut: "p",
            required: false
          },
          port: {
            usage: "Specify graphiql port",
            required: false
          }
        },
        lifecycleEvents: ["run"]
      }
    };

    this.hooks = {
      "graphiql:run": () => this.runGraphiql()
    };
  }

  getOutput(name) {
    return this.provider
      .request(
        "CloudFormation",
        "describeStacks",
        { StackName: this.stackName },
        this.provider.getStage(),
        this.provider.getRegion()
      )
      .then(result => {
        const stack = result.Stacks.pop();
        const output = stack.Outputs.find(o => o.OutputKey === name);
        if (!output) {
          throw new Error(`${name}: Output not found`);
        }

        return output.OutputValue;
      });
  }

  getValue(value, name) {
    if (typeof value === "string") {
      return Promise.resolve(value);
    } else if (typeof value.Ref === "string") {
      return this.provider
        .request(
          "CloudFormation",
          "listStackResources",
          {
            StackName: this.stackName
          },
          this.provider.getStage(),
          this.provider.getRegion()
        )
        .then(result => {
          const resource = result.StackResourceSummaries.find(
            r => r.LogicalResourceId === value.Ref
          );
          if (!resource) {
            throw new Error(`${name}: Ref "${value.Ref} not found`);
          }

          return resource.PhysicalResourceId;
        });
    } else {
      return Promise.reject(`${name} not recognised`);
    }
  }

  getHeaders() {
    if (this.config.authenticationType === "AMAZON_COGNITO_USER_POOLS") {
      if (!this.options.username || !this.options.password) {
        throw new Error(
          "Username and Password required for authentication type"
        );
      }

      return Promise.all([
        this.getValue(this.config.userPoolConfig.userPoolId),
        this.getValue(this.config.userPoolConfig.graphiqlClientId)
      ])
        .then(([UserPoolId, ClientId]) => {
          const credentials = new AWS.SharedIniFileCredentials({
            profile: this.serverless.service.provider.profile
          });
          AWS.config.update({ region: this.provider.getRegion(), credentials });
          const cognito = new AWS.CognitoIdentityServiceProvider();
          return cognito
            .adminInitiateAuth({
              AuthFlow: "ADMIN_NO_SRP_AUTH",
              UserPoolId,
              ClientId,
              AuthParameters: {
                USERNAME: this.options.username,
                PASSWORD: this.options.password
              }
            })
            .promise();
        })
        .then(({ AuthenticationResult }) => {
          if (!AuthenticationResult) {
            throw new Error("Authentication Failed");
          }

          return `"Authorization": "${AuthenticationResult.IdToken}"`;
        });
    } else {
      return Promise.resolve();
    }
  }

  runGraphiql() {
    Promise.all([this.getHeaders(), this.getOutput("GraphQlApiUrl")]).then(
      ([passHeader, endpointURL]) => {
        const app = new koa();
        app.use(
          koaApollo.graphiqlKoa({
            endpointURL,
            passHeader
          })
        );

        const port = this.options.port || 3000;
        app.listen(port);
        console.log("Graphiql server running");
        const graphiqlUrl = `http://localhost:${port}`;
        try {
          opn(graphiqlUrl);
        } catch (e) {
          console.log(`Visit ${graphiqlUrl}`);
        }
      }
    );
  }
}

module.exports = ServerlessAppsyncGraphiqlPlugin;
