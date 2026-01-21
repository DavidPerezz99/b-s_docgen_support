// Required to be first import
import "reflect-metadata";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { STSClient } from "@aws-sdk/client-sts";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Container } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { ApiRequestService } from "@gapi-slalom/lib-common/dist/services/api-request.service";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import { captureAWSv3Client } from "aws-xray-sdk-core";
import axios from "axios";

import { HealthController } from "../controllers/health.controller";
import { ExampleDynamoRepository } from "../repositories/exampleDynamo.repository";
import { SchemaValidator } from "../services/common/schemaValidator.service";
import { SecretService } from "../services/common/secret.service";
import { HealthService } from "../services/health.service";
import type { EnvironmentConfig } from "./env.config";
import { ContainerKeys } from "./ioc.keys";

// Create the IOC Container
const container = new Container();

try {
  // Support for dynamodb-local when running locally
  let dynamodbOptions;
  let domain = process.env.domain ?? "";

  // AWS_SAM_LOCAL is set only when running via `sam local`
  if (process.env.AWS_SAM_LOCAL === "true") {
    // eslint-disable-next-line no-console
    console.log("Local environment detected.");

    // Configure dynamodb-local
    dynamodbOptions = { endpoint: "http://dynamodb:8000" }; // NOSONAR

    // Configure the domain for local execution -- this usually connects to the "dev" environment
    domain = process.env.localDomain ?? "";
    // eslint-disable-next-line no-console
    console.log(`Local domain: "${domain}"`);
  }

  const dynamoDBClient = captureAWSv3Client(new DynamoDBClient(dynamodbOptions || {}));

  // Setup the envConfig with values from process.env
  // These must each be set as Lambda Environment Variables in the microservice.sam.yml file
  const envConfig: EnvironmentConfig = Object.freeze({
    region: process.env.AWS_REGION ?? "",
    serviceName: process.env.serviceName ?? "",
    featureBranchName: process.env.featureBranchName ?? "",
    environmentName: process.env.environmentName ?? "",
    releaseVersion: process.env.releaseVersion ?? "",
    logLevel: process.env.logLevel ?? "info",
    domain: domain,
    secretName: process.env.secretName ?? "",
    dbTableName: process.env.dbTableName ?? "",
    lumigoToken: process.env.LUMIGO_TOKEN ?? ""
  });

  const isFeatureBranch = Boolean(envConfig.featureBranchName);

  container.bind(ContainerKeys.envConfig).toConstantValue(envConfig);

  // Bindings for common services from node modules
  container.bind<LumigoService>(LumigoService).toDynamicValue(() => {
    return new LumigoService(envConfig.lumigoToken, !isFeatureBranch);
  });

  container.bind(DynamoDBClient).toConstantValue(dynamoDBClient);
  container.bind(DynamoDBDocumentClient).toConstantValue(DynamoDBDocumentClient.from(dynamoDBClient));

  container.bind(STSClient).toConstantValue(captureAWSv3Client(new STSClient({ region: envConfig.region })));
  container.bind(ContainerKeys.requestService).toConstantValue(axios);

  container.bind<HealthController>(HealthController).to(HealthController);

  container.bind<HealthService>(HealthService).to(HealthService);
  container.bind<LoggerService>(LoggerService).to(LoggerService);
  container.bind<SchemaValidator>(SchemaValidator).to(SchemaValidator);
  container.bind<SecretService>(SecretService).to(SecretService);

  container.bind<ExampleDynamoRepository>(ExampleDynamoRepository).toSelf();

  container.bind(ApiRequestService).toFactory(() => {
    return (apiBaseUrl: string, accountNum: string, roleName: string): ApiRequestService => {
      return new ApiRequestService(
        container.get<LoggerService>(LoggerService),
        container.get(ContainerKeys.requestService),
        apiBaseUrl,
        accountNum,
        roleName
      );
    };
  });
} catch (error: any) {
  // Can't rely on the LoggerService class here, since it might have failed during init
  const logOutput = {
    level: "error",
    message: "Error occurred during IOC initialization",
    data: error?.message ?? error,
    timestamp: new Date().toISOString(),
    location: "ioc.container"
  };

  // eslint-disable-next-line no-console
  console.log(logOutput);
}

export { container };
