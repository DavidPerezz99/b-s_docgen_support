import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { ApiRequestService } from "@gapi-slalom/lib-common/dist/services/api-request.service";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { AxiosStatic } from "axios";

import { EnvironmentConfig } from "../config/env.config";
import { ContainerKeys } from "../config/ioc.keys";
import { SecretService } from "./common/secret.service";

@injectable()
export class ExampleExternalService {
  private readonly decryptedPropertyName = "exampleExternalApiKey";

  constructor(
    @inject(LoggerService) private readonly logger: LoggerService,
    @inject(ContainerKeys.envConfig) private readonly envConfig: EnvironmentConfig,
    @inject(ContainerKeys.requestService) private readonly request: AxiosStatic,
    @inject(SecretService) private readonly secretService: SecretService,
    @inject(ApiRequestService)
    private readonly apiRequestServiceFactory: (
      apiBaseUrl: string,
      accountNum?: string,
      roleName?: string
    ) => ApiRequestService
  ) {}

  // createHeaders() returns the headers object to be sent with each exampleExternal request
  createHeaders(): Record<string, string> {
    this.logger.trace("createHeaders() called", null, this.constructor.name);

    return {
      "Accept-Language": "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "ServerlessAccelerator/" + this.envConfig.releaseVersion
    };
  }

  // ping() makes a simple request to the external ExampleExternal integrated service
  // This is used to confirm connectivity to during health checks
  async ping(options: any): Promise<any> {
    this.logger.trace("ping() called", null, this.constructor.name);

    // This is where you can make some kind of request that confirms connectivity.

    // Setup the request to the external dependency. Example:
    // let uri = this.envConfig.exampleExternalDomain;
    let uri = "";
    const headers = this.createHeaders();

    // Change something in the uri to force a failure (for api tests)
    if (options?.forceFailure) {
      uri = `broken${uri}`;
    }

    const response = await this.request.get(uri, { headers });

    return {
      statusCode: response.status,
      body: response.data
    };
  }

  // pingWithSecret() first retrieves a decrypted secret value, like an API key, then
  // makes a simple request to the external ExampleExternal integrated service.
  // This demonstrates how to use in-app secrets management.
  async pingWithSecret(options?: any): Promise<any> {
    this.logger.trace("pingWithSecret() called", null, this.constructor.name);

    const secretKey = await this.secretService.getSecretValue(this.envConfig.secretName, this.decryptedPropertyName);

    // Setup the request to the external dependency. Example:
    // let uri = this.envConfig.exampleExternalDomain;
    let uri = "";
    const headers = this.createHeaders();

    // Add the secret key to the request in whichever way the component requires
    headers["X-Api-Key"] = secretKey;

    // Change something in the uri to force a failure (for api tests)
    if (options?.forceFailure) {
      uri = `broken${uri}`;
    }

    const response = await this.request.get(uri, { headers });

    return {
      statusCode: response.status,
      body: response.data
    };
  }

  // pingExternalApi() will send a request to an API Gateway endpoint of a different microservice
  // This demonstrates how to use cross-microservice API requests.
  async pingExternalApi(): Promise<any> {
    this.logger.trace("pingExternalApi() called", null, this.constructor.name);

    // This is just an example. In a real scenario, move these values into the envConfig:
    const externalApiBaseUrl = "https://api.dev-serverless-accelerator.slalomdev.io/serverless-accelerator";
    const externalApiAccountNum = "123456789012";
    const externalIamRoleName = "new_role_name";

    try {
      // Create the axios client
      const apiRequestService = this.apiRequestServiceFactory(
        externalApiBaseUrl,
        externalApiAccountNum,
        externalIamRoleName
      );

      const path = "/example-data";
      const queryParams = {};

      const response = await apiRequestService.get(path, queryParams);

      return {
        statusCode: response.status,
        body: response.data
      };
    } catch (err: any) {
      this.logger.error("External call to api failed", { err }, this.constructor.name);
      throw err;
    }
  }
}
