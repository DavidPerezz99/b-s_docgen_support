import type { ApiRequestService } from "@gapi-slalom/lib-common/dist/services/api-request.service";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import type { AxiosStatic } from "axios";

import type { EnvironmentConfig } from "../config/env.config";
import type { SecretService } from "./common/secret.service";
import { ExampleExternalService } from "./exampleExternal.service";

/* eslint-disable @typescript-eslint/consistent-type-assertions */
describe("ExampleExternalService", function () {
  const mockRequestService = {} as AxiosStatic;
  const envConfig: Partial<EnvironmentConfig> = {
    region: "us-east-1",
    environmentName: "unit-test",
    releaseVersion: "0.0.1",
    logLevel: "info",
    secretName: "a-fake-secret-name"
  };
  const fakeSecretValue = "abcdefg12345";
  const fakeErrorMessage = "Failure Test";
  const mockLumigoService = {
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);
  const mockSecretService = {} as SecretService;
  const mockApiRequestService = {} as ApiRequestService;
  let mockApiRequestServiceFactory: (apiBaseUrl: string, accountNum?: string, roleName?: string) => ApiRequestService;
  let exampleExternalService: ExampleExternalService;
  const expectedSuccessResult = { status: 200, data: "Success" };
  const fakeResolvedPromise = async (): Promise<any> => {
    return Promise.resolve(expectedSuccessResult);
  };
  const expectedResult = { statusCode: 200, body: expectedSuccessResult.data };

  beforeEach(() => {
    mockSecretService.getSecretValue = jest.fn(async () => Promise.resolve(fakeSecretValue));
    mockRequestService.get = jest.fn(fakeResolvedPromise);
    mockApiRequestService.get = jest.fn(fakeResolvedPromise);
    mockApiRequestServiceFactory = jest.fn(() => mockApiRequestService);
    exampleExternalService = new ExampleExternalService(
      loggerService,
      envConfig as EnvironmentConfig,
      mockRequestService,
      mockSecretService,
      mockApiRequestServiceFactory
    );
  });

  describe("ping()", function () {
    it("calls the request service with expected options", async () => {
      const result = await exampleExternalService.ping(undefined);

      const expectedHeaders = expect.objectContaining({ "Content-Type": "application/json" });
      expect(result).toEqual(expectedResult);
      expect(mockRequestService.get).toHaveBeenCalledWith(expect.anything(), { headers: expectedHeaders });
    });

    it("calls the request service without the uri when forceFailure is true", async () => {
      await exampleExternalService.ping({ forceFailure: true });

      // Expect that the uri has been broken
      const expectedUri = expect.stringMatching("broken");

      expect(mockRequestService.get).toHaveBeenCalledWith(expectedUri, expect.anything());
    });
  });

  describe("pingWithSecret()", function () {
    it("calls the request service with expected options and decrypted secret", async () => {
      const result = await exampleExternalService.pingWithSecret();

      const expectedHeaders = expect.objectContaining({
        "Content-Type": "application/json",
        "X-Api-Key": fakeSecretValue
      });
      expect(result).toEqual(expectedResult);
      expect(mockRequestService.get).toHaveBeenCalledWith(expect.anything(), { headers: expectedHeaders });
      expect(mockSecretService.getSecretValue).toHaveBeenCalled();
    });

    it("calls the request service without the uri when forceFailure is true", async () => {
      await exampleExternalService.pingWithSecret({ forceFailure: true });

      // Expect that the uri has been broken
      const expectedUri = expect.stringMatching("broken");

      expect(mockRequestService.get).toHaveBeenCalledWith(expectedUri, expect.anything());
    });
  });

  describe("pingExternalApi()", function () {
    it("calls the external service", async () => {
      const result = await exampleExternalService.pingExternalApi();

      expect(result).toEqual(expectedResult);
      expect(mockApiRequestService.get).toHaveBeenCalled();
      expect(mockApiRequestServiceFactory).toHaveBeenCalled();
    });

    it("throws an error when the request is not successful", (done) => {
      // Force a failure in the apiRequestService
      mockApiRequestService.get = jest.fn(async () => {
        return Promise.reject(fakeErrorMessage);
      });

      exampleExternalService
        .pingExternalApi()
        .then(() => done.fail("Should not have succeeded."))
        .catch((error: any) => {
          expect(mockApiRequestService.get).toHaveBeenCalled();
          expect(error).toBe(fakeErrorMessage);
          done();
        });
    });
  });
});
