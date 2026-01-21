import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { AxiosStatic } from "axios";

import { ContainerKeys } from "../../config/ioc.keys";

@injectable()
export class SecretService {
  constructor(
    @inject(LoggerService) private logger: LoggerService,
    @inject(ContainerKeys.requestService) private axios: AxiosStatic
  ) {}

  async getSecretValue(secretName: string, propertyName: string): Promise<string> {
    this.logger.trace("getSecretValue() called", { secretName, propertyName }, this.constructor.name);

    try {
      // AWS provides a Lambda Layer that gives easy and secure access to Secrets and Parameters
      // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
      const port = process.env["PARAMETERS_SECRETS_EXTENSION_HTTP_PORT"] ?? "2773";
      const uri = `http://localhost:${port}/secretsmanager/get?secretId=${secretName}`;
      const headers = {
        "X-Aws-Parameters-Secrets-Token": process.env["AWS_SESSION_TOKEN"]
      };
      const response = await this.axios.get(uri, { headers });

      // Parse the JSON structure from the axios response
      const parsedSecret = JSON.parse(response.data.SecretString ?? "");

      // Add the secret values to the secret masks for the logger
      for (const key in parsedSecret) {
        this.logger.maskSecret(parsedSecret[key]);
      }

      return parsedSecret[propertyName];
    } catch (err: any) {
      this.logger.error("Error occurred while loading Secrets Manager secret", { secretName, propertyName, err });
      throw err;
    }
  }
}

/*
  If for some reason the use of the Secrets Lambda Layer is not an option for your application,
  you may instead integrate the Secrets Manager SDK. Here is an example implementation of
  the use of the SDK that also includes local caching of secrets:

  To use the code below, you must:
  1) import the Secrets Manager SDK
    import { SecretsManager } from "@aws-sdk/client-secrets-manager";

  2) update the IOC Container to support the Secrets Manager v3 SDK

  3) inject the Secrets Manager object in the constructor of this class
    @inject(SecretsManager) private secretsManager: SecretsManager,

  4) Set a class variable for in-memory cached secrets
    private retrievedSecrets: any = {};

  5) Replace the body of the getSecretValue function code with this

    // Retrieve the secret from the AWS Secrets Manager SDK
    // If the secret key has already been retrieved, then use the value from memory
    if (this.retrievedSecrets[secretName] !== undefined) {
      return Promise.resolve(this.retrievedSecrets[secretName][propertyName]);
    }
    const params = { SecretId: secretName };
    this.logger.debug("Calling Secrets Manager service to retrieve secret", params, this.constructor.name);
    const response = await this.secretsManager.getSecretValue(params);
    // Save the retrieved key for reuse, until the container gets recycled
    const parsedSecret = JSON.parse(response.SecretString ?? "");
    // In-memory cache of the parsed secret for subsequent requests
    this.retrievedSecrets[secretName] = parsedSecret;
*/
