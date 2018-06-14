#!/usr/bin/env node
import * as program from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as AWS from 'aws-sdk';
import * as koa from 'koa';
import * as koaApollo from 'apollo-server-koa';
import opn = require('opn');

export async function start(
  configFile : string,
  username : string,
  password : string
) {
  const config = yaml.safeLoad(
    fs.readFileSync(path.join(process.cwd(), configFile), 'utf8')
  ) as any;

  const output = fs.readFileSync(
    path.join(process.cwd(), config.custom.output.file),
    'utf8'
  );
  let endpoint;
  if (config.custom.output.file.match(/\.json$/)) {
    endpoint = JSON.parse(output).GraphQlApiUrl;
  } else if (config.custom.output.file.match(/\.ya?ml$/)) {
    endpoint = (yaml.safeLoad(output) as any).GraphQlApiUrl;
  }

  const port = process.env.PORT || 3000;
  const poolId = config.custom.appSync.userPoolConfig.userPoolId;
  const clientId = config.custom.appSync.userPoolConfig.graphiqlClientId;

  const credentials = new AWS.SharedIniFileCredentials({
    profile: config.provider.profile
  });
  AWS.config.update({ region: config.provider.region, credentials });
  const cognito = new AWS.CognitoIdentityServiceProvider();
  const auth = (await cognito
    .adminInitiateAuth({
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      UserPoolId: poolId,
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    })
    .promise()).AuthenticationResult;

  if (auth) {
    const app = new koa();

    app.use(
      koaApollo.graphiqlKoa({
        endpointURL: endpoint,
        passHeader: `"Authorization": "${auth.IdToken}"`
      })
    );

    app.listen(port);
    console.log(`Graphiql running at http://localhost:${port}`);
    opn(`http://localhost:${port}`);
  } else {
    console.log('Login Failed');
  }
}

let started = false;

program
  .version('0.0.1')
  .description('Run a graphql server using serverless config')
  .arguments('<username> <password>')
  .option('-c --config', 'Serverless Config File (yml)')
  .action(
    (
      username : string,
      password : string,
      options : { config : string | undefined }
    ) => {
      started = true;
      start(options.config || 'serverless.yml', username, password);
    }
  );

program.parse(process.argv);

if (!started) {
  program.outputHelp();
}
