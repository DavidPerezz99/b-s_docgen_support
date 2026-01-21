import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import { Chance } from "chance";
import { array, number, object, string } from "yup";

import { BadRequestError } from "../../errors/badRequest.error";
import type { MethodMetadata } from "../../models/parameterMetadata";
import { ParameterErrorIssue, SchemaValidator } from "./schemaValidator.service";

const chance = new Chance();

const nestedModelSchema = object({
  x: string().required(),
  y: number().required(),
  z: string().notRequired().min(1),
  maxChar: string().notRequired().max(4)
}).noUnknown();

const testModelSchema = object({
  a: string().required(),
  b: number().nullable(),
  c: array(string()),
  child: nestedModelSchema.notRequired().default(undefined)
});

const noUnknownSchema = testModelSchema.noUnknown();

describe("SchemaValidator", () => {
  const schemaValidator = new SchemaValidator();
  const mockLumigoService = {
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);

  describe("validateModel()", () => {
    describe("successfully", () => {
      it("validates schema with valid input", () => {
        const expectedName = chance.name();
        const expectedAge = chance.integer({ min: 20, max: 60 });
        const expectedCity = chance.city();

        const result: any = schemaValidator.validateModel(
          `{"a":"${expectedName}","b":${expectedAge},"c":["${expectedCity}"]}`,
          testModelSchema
        );

        expect(result.a).toEqual(expectedName);
        expect(result.b).toEqual(expectedAge);
        expect(result.c).toEqual([expectedCity]);
        expect(result.child).toBeUndefined();
      });

      it("validates schema with valid embedded object", () => {
        const expectedName = chance.name();
        const expectedCity = chance.city();
        const expectedChildA = chance.word();
        const expectedChildB = chance.integer({ min: 20, max: 60 });

        const result: any = schemaValidator.validateModel(
          `{"a":"${expectedName}","b":null,"c":["${expectedCity}"], "child": { "x": "${expectedChildA}", "y": ${expectedChildB} }}`,
          testModelSchema
        );

        expect(result.a).toEqual(expectedName);
        expect(result.b).toEqual(null);
        expect(result.c).toEqual([expectedCity]);
        expect(result.child).toBeDefined();
        expect(result.child?.x).toEqual(expectedChildA);
        expect(result.child?.y).toEqual(expectedChildB);
      });

      it("strips unknown properties from a valid model", () => {
        const expectedName = chance.name();
        const expectedAge = chance.integer({ min: 20, max: 60 });
        const expectedCity = chance.city();

        const givenRandomValue = chance.word();
        const givenRandomField = chance.word();

        const result: any = schemaValidator.validateModel(
          `{"a":"${expectedName}","b":${expectedAge},"c":["${expectedCity}"],"${givenRandomField}": "${givenRandomValue}"}`,
          testModelSchema
        );

        const rawBody = JSON.parse(JSON.stringify(result));
        expect(result.a).toEqual(expectedName);
        expect(result.b).toEqual(expectedAge);
        expect(result.c).toEqual([expectedCity]);
        expect(rawBody[givenRandomField]).toBeUndefined();
      });
    });

    describe("throws an error", () => {
      it("when the model doesn't pass validation", () => {
        const json = JSON.stringify({
          b: chance.word(),
          c: [chance.integer({ min: 1, max: 100 }), chance.integer({ min: 1, max: 100 })],
          child: {
            x: chance.integer({ min: 1, max: 100 }),
            z: "",
            maxChar: "12345"
          }
        });

        const expectedParamErrorInput = [
          {
            param: "a",
            issue: ParameterErrorIssue.Required
          },
          {
            param: "b",
            issue: ParameterErrorIssue.Malformed
          },
          {
            param: "child.maxChar",
            issue: ParameterErrorIssue.MaxCharactersExceeded
          },
          {
            param: "child.x",
            issue: ParameterErrorIssue.Malformed
          },
          {
            param: "child.y",
            issue: ParameterErrorIssue.Required
          },
          {
            param: "child.z",
            issue: ParameterErrorIssue.Empty
          },
          {
            param: "c[0]",
            issue: ParameterErrorIssue.Malformed
          },
          {
            param: "c[1]",
            issue: ParameterErrorIssue.Malformed
          }
        ];

        try {
          schemaValidator.validateModel(json, testModelSchema);
          fail("was supposed to throw an exception");
        } catch (error: any) {
          expect(error.data).toEqual(expectedParamErrorInput);
        }
      });

      it("when unknown properties are not allowed", () => {
        const expectedParamErrorInput = [
          {
            param: "m",
            issue: ParameterErrorIssue.Invalid
          }
        ];

        try {
          schemaValidator.validateModel('{"a":"test","m":1}', noUnknownSchema);
          fail("was supposed to throw an exception");
        } catch (error: any) {
          expect(error.data).toEqual(expectedParamErrorInput);
        }
      });

      it("when handling a JSON parse error", () => {
        const testFunction = (): void => {
          schemaValidator.validateModel("{ not valid, json]", testModelSchema);
        };
        expect(testFunction).toThrow(BadRequestError);
      });

      it("when the model is an empty string", () => {
        const testFunction = (): void => {
          schemaValidator.validateModel("", testModelSchema);
        };
        expect(testFunction).toThrow(BadRequestError);
      });

      it("when the model is null", () => {
        const testFunction = (): void => {
          schemaValidator.validateModel(null, testModelSchema);
        };
        expect(testFunction).toThrow(BadRequestError);
      });
    });
  });

  describe("extractParameters()", () => {
    const mockEventBody = {
      stringInput: chance.name()
    };
    const exampleNumber = chance.integer();
    const mockEvent: any = {
      body: JSON.stringify(mockEventBody),
      headers: {
        "Content-Type": "application/json",
        "Correlation-Object": JSON.stringify({
          correlationId: "unit-test"
        })
      },
      pathParameters: {
        exampleItemId: chance.string(),
        exampleNumber: String(exampleNumber)
      },
      queryStringParameters: {
        sort: chance.string({ alpha: true })
      }
    };

    const mockMetadata: MethodMetadata = {
      successStatus: 200,
      parameterMetadata: {
        exampleItemId: {
          in: "path",
          name: "exampleItemId",
          required: false,
          dataType: "string"
        },
        exampleNumber: {
          in: "path",
          name: "exampleNumber",
          required: false,
          dataType: "integer"
        },
        sort: {
          in: "query",
          name: "sort",
          required: false,
          dataType: "string"
        },
        header: {
          in: "header",
          name: "Correlation-Object",
          required: false,
          dataType: "string"
        },
        body: {
          in: "body",
          name: "requestBody",
          required: false,
          dataType: "object"
        },
        bodyProp: {
          in: "body-prop",
          name: "stringInput",
          required: false,
          dataType: "string"
        }
      }
    };

    beforeEach(() => {
      SchemaValidator.setLogger(loggerService);
    });

    describe("successfully", () => {
      it("extracts parameters from the event", () => {
        const args = SchemaValidator.extractParameters(mockEvent, mockMetadata.parameterMetadata);

        expect(args[0]).toEqual(mockEvent.pathParameters.exampleItemId);
        expect(args[1]).toEqual(exampleNumber);
        expect(args[2]).toEqual(mockEvent.queryStringParameters.sort);
        expect(args[3]).toEqual(mockEvent.headers["Correlation-Object"]);
        expect(args[4]).toEqual(mockEventBody);
        expect(args[5]).toEqual(mockEventBody.stringInput);
      });

      it("extracts the whole request object", () => {
        const mockMetadataRequestParam: MethodMetadata = {
          successStatus: 200,
          parameterMetadata: {
            wholeRequest: {
              in: "request",
              name: "",
              required: false,
              dataType: "object"
            }
          }
        };

        const args = SchemaValidator.extractParameters(mockEvent, mockMetadataRequestParam.parameterMetadata);

        expect(args).toEqual([mockEvent]);
      });
    });
    it("coerces a path/query/header parameter to it's defined type", () => {
      const mockMetadataUnknown: MethodMetadata = {
        successStatus: 200,
        parameterMetadata: {
          filter: {
            in: "query",
            name: "filter",
            required: false,
            dataType: "boolean"
          },
          pageSize: {
            in: "query",
            name: "pageSize",
            required: false,
            dataType: "integer"
          },
          active: {
            in: "path",
            name: "active",
            required: false,
            dataType: "boolean"
          },
          id: {
            in: "path",
            name: "id",
            required: false,
            dataType: "integer"
          },
          alive: {
            in: "header",
            name: "alive",
            required: false,
            dataType: "boolean"
          },
          ttl: {
            in: "header",
            name: "ttl",
            required: false,
            dataType: "integer"
          }
        }
      };
      const mockEvent: any = {
        body: null,
        headers: {
          "Content-Type": "application/json",
          "Correlation-Object": JSON.stringify({
            correlationId: "unit-test"
          }),
          alive: "true",
          ttl: "0"
        },
        pathParameters: {
          active: "True",
          id: "105"
        },
        queryStringParameters: {
          filter: "false",
          pageSize: "-10"
        }
      };

      const args = SchemaValidator.extractParameters(mockEvent, mockMetadataUnknown.parameterMetadata);

      expect(args[0]).toBe(false);
      expect(args[1]).toBe(-10);
      expect(args[2]).toBe(true);
      expect(args[3]).toBe(105);
      expect(args[4]).toBe(true);
      expect(args[5]).toBe(0);
    });

    describe("throws an error", () => {
      it("when Metadata contains a formData prop", () => {
        const mockMetadataFormData: MethodMetadata = {
          successStatus: 200,
          parameterMetadata: {
            formData: {
              in: "formData",
              name: "error",
              required: false,
              dataType: "string"
            }
          }
        };

        expect(function () {
          SchemaValidator.extractParameters(mockEvent, mockMetadataFormData.parameterMetadata);
        }).toThrow();
      });

      it("when Metadata contains a res prop", () => {
        const mockMetadataRes: MethodMetadata = {
          successStatus: 200,
          parameterMetadata: {
            res: {
              in: "res",
              name: "error",
              required: false,
              dataType: "string"
            }
          }
        };

        expect(function () {
          SchemaValidator.extractParameters(mockEvent, mockMetadataRes.parameterMetadata);
        }).toThrow();
      });

      it("when Metadata contains an unknown prop", () => {
        const mockMetadataUnknown: MethodMetadata = {
          successStatus: 200,
          parameterMetadata: {
            unknown: {
              in: "unknown",
              name: "error",
              required: false,
              dataType: "string"
            }
          }
        };

        expect(function () {
          SchemaValidator.extractParameters(mockEvent, mockMetadataUnknown.parameterMetadata);
        }).toThrow();
      });
    });
  });
});
