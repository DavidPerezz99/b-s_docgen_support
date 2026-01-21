import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import type { S3Event } from "aws-lambda";
import { Chance } from "chance";

// import { DynamoStreamEventName } from "../models/exampleDynamoDBStream.model";
import { BadRequestError } from "../errors/badRequest.error";
import type { ExampleDataItemRecord } from "../models/exampleDataItemRecord.model";
import type {
  CreateExampleDataItemRequest,
  UpdateExampleDataItemRequest
} from "../models/exampleDataItemRequest.schema";
import type { ExampleDataItemResponse } from "../models/exampleDataItemResponse.model";
import type { ExampleSqsMessage } from "../models/exampleSqsMessage.model";
import { SchemaValidator } from "./common/schemaValidator.service";
import { ExampleDataService } from "./exampleData.service";

const chance = new Chance();

describe("ExampleDataService", () => {
  const isoStringRegex = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/;
  const cuidRegex = /^[0-9a-z]{24}/;
  const mockExampleDynamoRepository: any = {};
  const mockLumigoService = {
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);
  const tenantId = chance.guid();
  const userId = chance.guid();
  const itemId = chance.guid();
  const now = new Date().toISOString();

  const dbKeys = {
    pk: `TENANT#${tenantId}`,
    sk: itemId
  };

  // for dynamoDB Stream
  const mockPK = dbKeys.pk; // immutable
  const mockSK = dbKeys.sk; // immutable

  // const mockNameOld = chance.string(); // attribute
  // const mockNameNew = chance.string(); // attribute
  // const dbStreamResult = new Object({
  //   keys: dbKeys,
  //   newImage: { pk: mockPK, sk: mockSK, name: mockNameNew },
  //   oldImage: { pk: mockPK, sk: mockSK, name: mockNameOld },
  //   eventName: DynamoStreamEventName.MODIFY
  // });

  const dbResults: ExampleDataItemRecord[] = [
    {
      pk: mockPK,
      sk: mockSK,
      itemId: itemId,
      name: chance.string(),
      email: chance.email(),
      exampleNumber: chance.integer(),
      address: undefined,
      createdTimestamp: now,
      updatedTimestamp: now,
      createdBy: userId,
      updatedBy: userId
    }
  ] as ExampleDataItemRecord[];
  const expectedServiceResultItem: ExampleDataItemResponse = {
    id: dbResults[0].sk,
    name: dbResults[0].name,
    email: dbResults[0].email,
    exampleNumber: dbResults[0].exampleNumber,
    address: undefined,
    createdTimestamp: now,
    updatedTimestamp: now,
    createdBy: userId,
    updatedBy: userId
  };
  const fakeListResolvedPromise = async (): Promise<any> => Promise.resolve(dbResults);
  const fakeResolvedPromise = async (): Promise<any> => Promise.resolve(dbResults[0]);
  const mockSqsMessage: ExampleSqsMessage = {
    type: "NewDataItemCreated",
    tenantId: tenantId,
    itemId: dbResults[0].sk
  };
  // const mockDynamoDBStream: DynamoDBRecord = {
  //   eventName: DynamoStreamEventName.MODIFY,
  //   dynamodb: {
  //     Keys: {
  //       pk: {
  //         S: mockPK
  //       },
  //       sk: {
  //         S: mockSK
  //       }
  //     },
  //     NewImage: {
  //       pk: {
  //         S: mockPK
  //       },
  //       sk: {
  //         S: mockSK
  //       },
  //       name: {
  //         S: mockNameNew
  //       }
  //     },
  //     OldImage: {
  //       pk: {
  //         S: mockPK
  //       },
  //       sk: {
  //         S: mockSK
  //       },
  //       name: {
  //         S: mockNameOld
  //       }
  //     }
  //   }
  // };

  let exampleDataService: ExampleDataService;

  beforeEach(() => {
    mockExampleDynamoRepository.getAllRecords = jest.fn(fakeListResolvedPromise);
    mockExampleDynamoRepository.getRecord = jest.fn(fakeResolvedPromise);
    mockExampleDynamoRepository.deleteRecord = jest.fn(fakeResolvedPromise);
    mockExampleDynamoRepository.putRecord = jest.fn(async (input) => Promise.resolve(input));
    mockExampleDynamoRepository.updatePartialRecord = jest.fn(async (input) => Promise.resolve(input));
    exampleDataService = new ExampleDataService(loggerService, mockExampleDynamoRepository, new SchemaValidator());
  });

  describe("getExampleDataItems()", () => {
    it("calls the repository function and maps the results", async () => {
      const expectedResultList = [expectedServiceResultItem];
      const result = await exampleDataService.getExampleDataItems();

      expect(result).toEqual(expectedResultList);
      expect(mockExampleDynamoRepository.getAllRecords).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDataItem()", () => {
    it("calls the repository function and maps the result", async () => {
      const result = await exampleDataService.getDataItem(tenantId, itemId);

      expect(result).toEqual(expectedServiceResultItem);
      expect(mockExampleDynamoRepository.getRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteDataItem()", () => {
    it("calls the repository function", async () => {
      const result = await exampleDataService.deleteDataItem(tenantId, itemId);

      expect(result).toEqual(expectedServiceResultItem);
      expect(mockExampleDynamoRepository.deleteRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe("createDataItem()", () => {
    it("creates a new item", async () => {
      const requestData: CreateExampleDataItemRequest = {
        name: chance.string(),
        email: undefined,
        exampleNumber: undefined,
        address: undefined
      };

      const expectedServiceResult = expect.objectContaining({
        id: expect.stringMatching(cuidRegex),
        name: requestData.name,
        createdTimestamp: expect.stringMatching(isoStringRegex),
        updatedTimestamp: expect.stringMatching(isoStringRegex),
        createdBy: userId,
        updatedBy: userId
      });

      const result = await exampleDataService.createDataItem(requestData, tenantId, userId);

      expect(result).toEqual(expectedServiceResult);

      expect(mockExampleDynamoRepository.putRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateDataItem()", () => {
    it("partially updates an existing item", async () => {
      const requestData: UpdateExampleDataItemRequest = {
        name: chance.string(),
        email: undefined,
        exampleNumber: undefined,
        address: undefined,
        updatedTimestamp: new Date().toISOString()
      };

      const expectedServiceResult = expect.objectContaining({
        name: requestData.name
      });

      const result = await exampleDataService.updateDataItem(requestData, itemId, tenantId, userId);

      expect(result).toEqual(expectedServiceResult);
      expect(mockExampleDynamoRepository.updatePartialRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDataItemsByEmail()", () => {
    beforeEach(() => {
      mockExampleDynamoRepository.getExampleDataItemsByEmail = jest.fn(async () =>
        Promise.resolve({ items: dbResults })
      );
    });
    it("calls the repository method", async () => {
      const expectedServiceResult = expect.objectContaining({
        items: [expectedServiceResultItem]
      });

      const result = await exampleDataService.getDataItemsByEmail(tenantId, "test@email.com");

      expect(result).toEqual(expectedServiceResult);
      expect(mockExampleDynamoRepository.getExampleDataItemsByEmail).toHaveBeenCalledTimes(1);
    });

    describe("cursor encoding", () => {
      const mockCursor = { foo: "bar", baz: 1 };
      beforeEach(() => {
        mockExampleDynamoRepository.getExampleDataItemsByEmail = jest.fn(async () =>
          Promise.resolve({ items: [], lastEvaluatedKey: mockCursor })
        );
      });
      it("encodes and decodes a cursor", async () => {
        const result = await exampleDataService.getDataItemsByEmail(tenantId, "test@email.com");
        const encodedCursor = result.cursor;
        await exampleDataService.getDataItemsByEmail(tenantId, "test@email.com", { cursor: encodedCursor });
        const pagination = mockExampleDynamoRepository.getExampleDataItemsByEmail.mock.calls[1][2];
        expect(mockCursor).toEqual(pagination.lastEvaluatedKey);
      });
      it("handles an invalid cursor without error", async () => {
        const result = await exampleDataService.getDataItemsByEmail(tenantId, "test@email.com", { cursor: "abc" });
        expect(result).toEqual(
          expect.objectContaining({
            items: [],
            cursor: expect.any(String)
          })
        );
      });
    });
  });

  describe("processSqsMessage()", function () {
    it("processes the incoming message", async () => {
      const result = await exampleDataService.processSqsMessage(mockSqsMessage);

      expect(result.message).toEqual("Example SQS Message has been processed.");
    });
  });

  // Uncomment to enable DynamoDB Stream tests
  // describe("processDynamoDBStream()", () => {
  //   it("processes the stream", async () => {
  //     const result = await exampleDataService.processDynamoDBStream(mockDynamoDBStream);

  //     expect(result).toEqual(dbStreamResult);
  //   });

  //   it("handles a poorly structured record", async () => {
  //     const result = await exampleDataService.processDynamoDBStream({});

  //     expect(result).toEqual({
  //       keys: {},
  //       newImage: {},
  //       oldImage: {},
  //       eventName: DynamoStreamEventName.UNKNOWN
  //     });
  //   });
  // });

  describe("processEvent", () => {
    const mockS3Event: any = {
      Records: [
        {
          responseElements: {
            "x-amz-request-id": "34A68WGSX10FDGNJ",
            "x-amz-id-2":
              "N1+xWdAcWrnhvrjT9DX1ZDHjrhOvpBSQhtKAM/SufBrRbJKsEG0LZvMKwHQ+hcvdyZAleM4d/mbqig10M+6QTTSyRKIORZhf"
          },
          s3: {
            bucket: {
              name: "bucket_name"
            },
            object: {
              key: "object_key"
            }
          }
        }
      ]
    };

    beforeEach(() => {
      jest.spyOn(exampleDataService, "processS3Event");
    });

    it("method is called without an error", async () => {
      await exampleDataService.processS3Event(mockS3Event);

      expect(exampleDataService.processS3Event).toHaveBeenCalled();
    });
  });

  describe("verifyCorrelationId()", () => {
    let mockEvent: S3Event;

    beforeEach(() => {
      jest.spyOn(exampleDataService, "verifyCorrelationId");

      mockEvent = {
        Records: [
          {
            responseElements: {
              "x-amz-request-id": "34A68WGSX10FDGNJ",
              "x-amz-id-2":
                "N1+xWdAcWrnhvrjT9DX1ZDHjrhOvpBSQhtKAM/SufBrRbJKsEG0LZvMKwHQ+hcvdyZAleM4d/mbqig10M+6QTTSyRKIORZhf"
            }
          }
        ]
      } as unknown as S3Event;
    });

    it("recognizes the x-amz-request-id", () => {
      expect(function () {
        exampleDataService.verifyCorrelationId(mockEvent);
      }).not.toThrow();
    });

    it("throws an error when the x-amz-request-id object is missing", () => {
      const expectedErrorMessage = "x-amz-request-id is required in the S3 event body";
      delete (mockEvent as any).Records[0].responseElements["x-amz-request-id"];

      const testFunction = (): void => {
        exampleDataService.verifyCorrelationId(mockEvent);
      };
      expect(testFunction).toThrow(BadRequestError);
      expect(testFunction).toThrow(expectedErrorMessage);
    });
  });
});
