import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";

import { BadRequestError } from "../errors/badRequest.error";
import { ForbiddenError } from "../errors/forbidden.error";
import { HealthError } from "../errors/health.error";
import { NotFoundError } from "../errors/notFound.error";
import { ProxyError } from "../errors/proxy.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { ValidationError } from "../errors/validation.error";
import { MethodMetadata } from "../models/parameterMetadata";
import { SchemaValidator } from "../services/common/schemaValidator.service";
import { caseSensitiveHeaderName } from "../utils/httpUtils";

@injectable()
export class BaseController {
  protected HTTP_CODE_OK = 200;
  protected HTTP_CODE_CREATED = 201;
  protected HTTP_CODE_BAD_REQUEST = 400;
  protected HTTP_CODE_UNAUTHORIZED = 401;
  protected HTTP_CODE_ACCESS_DENIED = 403;
  protected HTTP_CODE_NOT_FOUND = 404;
  protected HTTP_CODE_INTERNAL_SERVER_ERROR = 500;
  protected HTTP_CODE_GATEWAY_TIMEOUT = 504;

  constructor(@inject(LoggerService) protected logger: LoggerService) {}

  async invoke(
    callback: (...args: any[]) => Promise<any>,
    event: APIGatewayProxyEvent,
    metadata: MethodMetadata
  ): Promise<APIGatewayProxyResult> {
    this.logger.trace("invoke called", null, this.constructor.name);

    try {
      this.verifyCorrelationId(event);

      SchemaValidator.setLogger(this.logger);
      const args = SchemaValidator.extractParameters(event, metadata.parameterMetadata);

      const controllerCallback = callback.bind(this);
      const result = await controllerCallback.apply(this, args);
      return this.createResponseModel(metadata.successStatus, { result });
    } catch (error: any) {
      return this.handleServiceErrors(error);
    }
  }

  createResponseModel(statusCode: number, bodyObject: any): APIGatewayProxyResult {
    const logObject = { statusCode: statusCode, bodyObject: bodyObject };
    this.logger.debug("Creating response", logObject, this.constructor.name);

    return {
      statusCode: statusCode,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(bodyObject)
    };
  }

  createSuccessResponse(resultObject: any): APIGatewayProxyResult {
    const bodyObject = {
      result: resultObject
    };

    return this.createResponseModel(this.HTTP_CODE_OK, bodyObject);
  }

  createErrorResponse(errorCode: number, message: string, data: any): APIGatewayProxyResult {
    let dataMessage;
    if (typeof data === "string") {
      dataMessage = data;
    } else {
      dataMessage = data?.message ?? data;
    }

    const bodyObject = {
      errorCode: errorCode,
      message: message,
      data: dataMessage
    };

    return this.createResponseModel(errorCode, bodyObject);
  }

  createUnexpectedErrorResponse(data: any): APIGatewayProxyResult {
    return this.createErrorResponse(this.HTTP_CODE_INTERNAL_SERVER_ERROR, "An unexpected error occurred!", data);
  }

  handleServiceErrors(error: Error): APIGatewayProxyResult {
    this.logger.error("Service Error Occurred", error, this.constructor.name);

    // Handle errors
    if (error instanceof BadRequestError) {
      return this.createErrorResponse(this.HTTP_CODE_BAD_REQUEST, error.message, {});
    } else if (error instanceof UnauthorizedError) {
      return this.createErrorResponse(this.HTTP_CODE_UNAUTHORIZED, error.message, {});
    } else if (error instanceof ForbiddenError) {
      return this.createErrorResponse(this.HTTP_CODE_ACCESS_DENIED, error.message, {});
    } else if (error instanceof NotFoundError) {
      return this.createErrorResponse(this.HTTP_CODE_NOT_FOUND, error.message, {});
    } else if (error instanceof ProxyError) {
      return this.createErrorResponse(this.HTTP_CODE_GATEWAY_TIMEOUT, error.message, {});
    } else if (error instanceof HealthError) {
      return this.createResponseModel(this.HTTP_CODE_GATEWAY_TIMEOUT, { result: error.data });
    } else if (error instanceof ValidationError) {
      return this.createErrorResponse(this.HTTP_CODE_BAD_REQUEST, error.message, error.data);
    }

    return this.createUnexpectedErrorResponse(error);
  }

  verifyCorrelationId(eventObject: APIGatewayProxyEvent): void {
    this.logger.trace("verifyCorrelationId() called", {}, this.constructor.name);

    // extract correlation object from event header
    const correlationObject = this.extractCorrelationObject(eventObject);

    // Store the correlation object on the process object
    // @ts-expect-error Write a custom attribute into the `process` object
    process["correlationObject"] = correlationObject;
    process.env.currentCorrelationId = correlationObject?.correlationId;
  }

  verifyRequiredQueryStringParams(eventObject: APIGatewayProxyEvent, requiredQueryStringParams: string[]): void {
    this.logger.trace(
      "verifyRequiredQueryStringParams() called",
      { qs: requiredQueryStringParams },
      this.constructor.name
    );

    const errors: string[] = [];

    if (requiredQueryStringParams.length > 0) {
      const qs = eventObject.queryStringParameters;
      // fail if the eventObject.queryStringParameters isn't defined
      if ((qs as unknown) === undefined || qs === null) {
        errors.push('Request event is malformed. The "queryStringParameters" object is missing.');
      } else {
        // Check for each of the required properties
        requiredQueryStringParams.forEach((propertyName) => {
          const value = qs[propertyName];

          // If the value isn't there or is blank, then add it to the errors list
          if (value === undefined || (value as unknown) === null || value === "") {
            errors.push(`The parameter "${propertyName}" is required in the request's queryStringParameters.`);
          }
        });
      }
    }

    // If there are any errors, throw an Error object with all of the messages
    if (errors.length > 0) {
      throw new BadRequestError(errors.join(" "));
    }
  }

  private extractCorrelationObject(eventObject: APIGatewayProxyEvent): any {
    // Require the 'Correlation-Object' header
    if (!(eventObject.headers as unknown)) {
      throw new BadRequestError("Event headers are missing or malformed.");
    }

    const correlationObjectHeaderName = caseSensitiveHeaderName(eventObject, "correlation-object");

    let correlationObject: any;

    try {
      // Try to parse the header as JSON. If it fails or if there isn't a correlationId property, then we throw an error
      const headerValue = eventObject.headers[correlationObjectHeaderName] ?? "";
      correlationObject = JSON.parse(headerValue);
    } catch (error) {
      throw new BadRequestError("A Correlation-Object header is required in the request.");
    }

    if (!correlationObject.correlationId) {
      throw new BadRequestError('The field "correlationId" is missing in the request\'s Correlation-Object.');
    }

    return correlationObject;
  }
}
