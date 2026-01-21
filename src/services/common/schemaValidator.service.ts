import { injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { AdditionalProps, FieldErrors, ValidationService as MetadataSchemaService } from "@tsoa/runtime";
import { APIGatewayProxyEvent } from "aws-lambda/trigger/api-gateway-proxy";
import { BaseSchema, InferType, ValidationError as YupValidationError } from "yup";
import { ValidateOptions } from "yup/es/types";

import { BadRequestError } from "../../errors/badRequest.error";
import { ValidationError } from "../../errors/validation.error";
import { models } from "../../models/generated.models";
import { ParameterMetadata } from "../../models/parameterMetadata";
import { caseSensitiveHeaderName } from "../../utils/httpUtils";

export enum ParameterErrorIssue {
  Required = "required",
  Malformed = "malformed",
  Empty = "empty",
  MaxCharactersExceeded = "maxCharactersExceeded",
  Invalid = "invalid"
}

const errorTypeMap: any = {
  max: ParameterErrorIssue.MaxCharactersExceeded,
  min: ParameterErrorIssue.Empty,
  typeError: ParameterErrorIssue.Malformed,
  noUnknown: ParameterErrorIssue.Invalid
};

/*
  Mapping used to convert tsoa error messages to accelerator style of validation messages
  NOTE WELL: This is NOT an exhaustive list of the validation errors that may be raised by TSOA
  This covers the current usage in this repo, but if a future tsoa validation error is encountered
  that doesn't match these, a new pattern and mapping for it should be added to this issueMap
*/
const issueMap = [
  {
    pattern: /invalid ([^ ]*) value/,
    issue: ParameterErrorIssue.Malformed
  },
  {
    pattern: /could not match union/i,
    issue: ParameterErrorIssue.Malformed
  },
  {
    pattern: /is required/,
    issue: ParameterErrorIssue.Required
  },
  {
    pattern: /excess property/,
    issue: ParameterErrorIssue.Invalid
  }
];

const additionalProperties: AdditionalProps = {
  noImplicitAdditionalProperties: "silently-remove-extras",
  bodyCoercion: false
};
const parameterSchemaService = new MetadataSchemaService(models, additionalProperties);

@injectable()
export class SchemaValidator {
  private static logger: LoggerService;

  static setLogger(newLogger: LoggerService): void {
    SchemaValidator.logger = newLogger;
  }

  validateModel<T extends BaseSchema>(bodyString: string | null, schema: T): InferType<T> {
    let body;

    try {
      body = JSON.parse(bodyString ?? "");
    } catch (error: any) {
      throw new BadRequestError(error.message);
    }

    return this.validateObject(body, schema);
  }

  validateObject<T extends BaseSchema>(body: any, schema: T): InferType<T> {
    const strictValidationOptions: ValidateOptions = {
      abortEarly: false,
      recursive: true,
      strict: true,
      stripUnknown: false
    };

    const stripUnknownValidationOptions: ValidateOptions = {
      abortEarly: false,
      recursive: true,
      strict: false,
      stripUnknown: true
    };

    try {
      // A bug in Yup prevents 'stripUnknown: true' from functioning while 'strict: true'.

      // To get around this, we first validate with 'strict: true' & 'stripUnknown: false',
      // then validate the result with 'strict: false' & 'stripUnknown: true'.

      // This gives us the benefits of strict mode, like prevention of type coercion,
      // as well as the ability to strip properties not defined in the schema.
      const strictlyValidatedBody = schema.validateSync(body, strictValidationOptions);

      const result = schema.validateSync(strictlyValidatedBody, stripUnknownValidationOptions);

      return result as InferType<T>;
    } catch (yupValidationError: any) {
      let paramErrorInputs: { param: string; issue: string }[] = [];
      if (yupValidationError instanceof YupValidationError) {
        paramErrorInputs = yupValidationError.inner.map((innerError) => {
          const innerParams: any = innerError.params ?? {};
          const param = innerError.type === "noUnknown" ? innerParams.unknown : innerError.path;
          const issue = this.getIssue(innerError);
          return { param, issue };
        });
      }

      throw new ValidationError("Validation errors detected with the provided body", paramErrorInputs);
    }
  }

  private getIssue(error: YupValidationError): ParameterErrorIssue {
    // Find the mapped type, or return Required error as the default
    if (error.type && errorTypeMap[error.type]) {
      return errorTypeMap[error.type];
    }

    return ParameterErrorIssue.Required;
  }

  /**
   * Extracts request parameters from a Lambda HTTP Event using TSOA type metadata
   * @param event Lambda API Gateway Event
   * @param metadata TSOA Validation metadata
   * @returns Extracted values (in order)
   * @throws ValidationError if the parameters don't match the schema or can't be extracted from the event
   */
  static extractParameters(event: APIGatewayProxyEvent, metadata: ParameterMetadata): any[] {
    const fieldErrors: FieldErrors = {};
    const eventBody = JSON.parse(event.body ?? "{}");
    const values = Object.keys(metadata).map((key) => {
      try {
        const name = metadata[key].name;
        let isBodyParam = false;
        let value;
        /*
          This switch statement is exhaustive of all the possible "in" values that a parameter can be injected with from tsoa annotations
          Although some of them are not currently implemented in this library, they are kept in the switch statement to make them more
          easily discoverable for someone implementing them in the future.
        */
        switch (metadata[key].in) {
          case "request":
            return event;
          case "query":
            value = event.queryStringParameters?.[name];
            break;
          case "path":
            value = event.pathParameters?.[name];
            break;
          case "header":
            value = event.headers[caseSensitiveHeaderName(event, name)];
            break;
          case "body":
            value = eventBody;
            isBodyParam = true;
            break;
          case "body-prop":
            value = eventBody?.[name];
            isBodyParam = true;
            break;
          case "formData":
            throw new Error("Multi-part form data not implemented");
          case "res":
            // See https://tsoa-community.github.io/reference/functions/_tsoa_runtime.Res.html
            throw new Error('Unsupported parameter type "res"');
          default:
            // Theoretically should never hit this since the switch cases are exhaustive
            throw new Error(`Unsupported parameter type ${metadata[key].in}`);
        }
        return parameterSchemaService.ValidateParam(metadata[key], value, name, fieldErrors, isBodyParam);
      } catch (err) {
        fieldErrors[key] = { message: `${key} was unable to be extracted from the incoming event`, value: null };
      }
    });

    if (Object.keys(fieldErrors).length > 0) {
      const errors = SchemaValidator.mapErrors(fieldErrors);
      this.logger.warn("Validation errors detected", errors);
      throw new ValidationError("Validation errors detected with the provided body", errors);
    }
    return values;
  }

  static mapErrors(fieldErrors: FieldErrors): { param: string; issue: string }[] {
    return Object.keys(fieldErrors).map((key) => {
      const error = fieldErrors[key];

      const issueList = issueMap.filter((i) => i.pattern.test(error.message)).map((i) => i.issue);

      if (issueList.length === 0) {
        this.logger.error(
          "Error not mapped because none of the tsoa error patterns configured in the issueMap matched. A pattern should be added to the issueMap for this error",
          error,
          "SchemaValidator"
        );
      }

      return {
        param: key,
        issue: issueList.length ? issueList[0] : ParameterErrorIssue.Invalid
      };
    });
  }
}
