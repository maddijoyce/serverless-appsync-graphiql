#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const program = require("commander");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const AWS = require("aws-sdk");
const koa = require("koa");
const koaApollo = require("apollo-server-koa");
const opn = require("opn");
function start(configFile, username, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = yaml.safeLoad(fs.readFileSync(path.join(process.cwd(), configFile), 'utf8'));
        const output = fs.readFileSync(path.join(process.cwd(), config.custom.output.file), 'utf8');
        let endpoint;
        if (config.custom.output.file.match(/\.json$/)) {
            endpoint = JSON.parse(output).GraphQlApiUrl;
        }
        else if (config.custom.output.file.match(/\.ya?ml$/)) {
            endpoint = yaml.safeLoad(output).GraphQlApiUrl;
        }
        const port = process.env.PORT || 3000;
        const poolId = config.custom.appSync.userPoolConfig.userPoolId;
        const clientId = config.custom.appSync.userPoolConfig.graphiqlClientId;
        const credentials = new AWS.SharedIniFileCredentials({
            profile: config.provider.profile
        });
        console.log(config.provider.profile, credentials);
        AWS.config.update({ region: config.provider.region, credentials });
        const cognito = new AWS.CognitoIdentityServiceProvider();
        const auth = (yield cognito
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
            app.use(koaApollo.graphiqlKoa({
                endpointURL: endpoint,
                passHeader: `"Authorization": "${auth.IdToken}"`
            }));
            app.listen(port);
            console.log(`Graphiql running at http://localhost:${port}`);
            opn(`http://localhost:${port}`);
        }
        else {
            console.log('Login Failed');
        }
    });
}
exports.start = start;
let started = false;
program
    .version('0.0.1')
    .description('Run a graphql server using serverless config')
    .arguments('<username> <password>')
    .option('-c --config', 'Serverless Config File (yml)')
    .action((username, password, options) => {
    started = true;
    start(options.config || 'serverless.yml', username, password);
});
program.parse(process.argv);
if (!started) {
    program.outputHelp();
}
//# sourceMappingURL=index.js.map