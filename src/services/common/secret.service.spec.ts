import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import type { AxiosStatic } from "axios";

import type { EnvironmentConfig } from "../../config/env.config";
import { SecretService } from "./secret.service";

/* eslint-disable @typescript-eslint/consistent-type-assertions */
describe("SecretService", function () {
  const envConfig: Partial<EnvironmentConfig> = {
    logLevel: "info",
    region: "us-east-1",
    secretName: "a-fake-secret-name"
  };

  const fakePropertyName = "exampleExternalApiKey";
  const fakeSecretValue = "abcdefg12345";
  const fakeSerializedSecret = `{"${fakePropertyName}":"${fakeSecretValue}"}`;
  const fakeSmResponse = { SecretString: fakeSerializedSecret };
  const fakeAxiosResponse = { status: 200, data: fakeSmResponse };
  const fakeAxiosEmptyResponse = { status: 200, data: {} };
  const fakeAxiosFailure = { status: 404, data: { message: "Not Found" } };
  const mockLumigoService = {
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);
  const mockRequestService: AxiosStatic = {} as AxiosStatic;
  let secretService: SecretService;

  beforeEach(() => {
    secretService = new SecretService(loggerService, mockRequestService);
  });

  describe("getSecretValue()", function () {
    it("loads the secret from the lambda layer via axios", async () => {
      mockRequestService.get = jest.fn(async () => Promise.resolve(fakeAxiosResponse)) as any;

      const result = await secretService.getSecretValue((envConfig as EnvironmentConfig).secretName, fakePropertyName);
      expect(result).toEqual(fakeSecretValue);
      expect(mockRequestService.get).toHaveBeenCalled();
    });

    it("handles errors returned from the axios request", async () => {
      mockRequestService.get = jest.fn(async () => Promise.reject(fakeAxiosFailure));

      await expect(
        secretService.getSecretValue((envConfig as EnvironmentConfig).secretName, fakePropertyName)
      ).rejects.toBeTruthy();
      expect(mockRequestService.get).toHaveBeenCalled();
    });

    it("throws an error when the SecretString is not returned", async () => {
      mockRequestService.get = jest.fn(async () => Promise.resolve(fakeAxiosEmptyResponse)) as any;

      await expect(
        secretService.getSecretValue((envConfig as EnvironmentConfig).secretName, fakePropertyName)
      ).rejects.toBeTruthy();
      expect(mockRequestService.get).toHaveBeenCalled();
    });
  });
});
