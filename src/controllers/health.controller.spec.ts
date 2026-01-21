import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import type { APIGatewayProxyEvent } from "aws-lambda/trigger/api-gateway-proxy";

import type { MethodMetadata } from "../models/parameterMetadata";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const mockLumigoService = {
    logProgrammaticInfo: jest.fn(),
    logProgrammaticWarn: jest.fn(),
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);
  const mockHealthService: any = {};
  let healthController: HealthController;
  const fakeResolvedPromise = async (): Promise<any> => Promise.resolve({ status: "healthy" });
  const fakeResolvedErrorPromise = async (): Promise<any> => Promise.resolve({ status: "error" });

  const mockHeaders = { "Correlation-Object": JSON.stringify({ correlationId: "unit-test" }) };
  const mockEvent = {
    queryStringParameters: {} as any,
    pathParameters: {} as any,
    body: null,
    headers: mockHeaders
  } as unknown as APIGatewayProxyEvent;
  const metadata: MethodMetadata = {
    successStatus: 200,
    parameterMetadata: {
      forceExampleExternalFailure: {
        in: "query",
        name: "forceExampleExternalFailure",
        dataType: "boolean"
      }
    }
  };

  beforeEach(() => {
    mockHealthService.getHealth = jest.fn(fakeResolvedPromise);
    healthController = new HealthController(loggerService, mockHealthService, mockLumigoService);
  });

  describe("getHealth()", () => {
    it("returns a success response", async () => {
      const response = await healthController.invoke(healthController.getHealth, mockEvent, metadata);

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      expect(response.headers?.["Access-Control-Allow-Origin"]).toBeDefined();
      expect(response.body).toBeDefined();
      expect(mockHealthService.getHealth).toHaveBeenCalledTimes(1);
    });

    it("passes on the forceExampleExternalFailure flag when it is present in the event's querystring parameters", async () => {
      (mockEvent as any).queryStringParameters = {
        forceExampleExternalFailure: true
      };
      mockHealthService.getHealth.mockImplementation(fakeResolvedErrorPromise);

      const response = await healthController.invoke(healthController.getHealth, mockEvent, metadata);

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(504);
      expect(response.body).toBe('{"result":{"status":"error"}}');
      expect(mockHealthService.getHealth).toHaveBeenCalledTimes(1);
      expect(mockHealthService.getHealth).toHaveBeenCalledWith({
        forceExampleExternalFailure: true
      });
    });
  });
});
