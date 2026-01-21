import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { S3Event } from "aws-lambda";

import { BadRequestError } from "../errors/badRequest.error";
import { ExampleDataItemMapper } from "../mappers/exampleDataItem.mapper";
import { CreateExampleDataItemRequest, UpdateExampleDataItemRequest } from "../models/exampleDataItemRequest.schema";
import { ExampleDataItemResponse } from "../models/exampleDataItemResponse.model";
import { ExampleSqsMessage } from "../models/exampleSqsMessage.model";
import { Pagination, PaginationSchema } from "../models/pagination.schema";
// Uncomment to add support for triggering a lambda function from a DynamoDB stream
// import { unmarshall } from "@aws-sdk/util-dynamodb";
// import { ExampleDynamoDBStreamRecord, DynamoStreamEventName } from "../models/exampleDynamoDBStream.model";
// import { AttributeValue } from "@aws-sdk/client-dynamodb-streams";
import { PaginationOptions } from "../repositories/dynamoDbQueryBuilder";
import { ExampleDynamoRepository } from "../repositories/exampleDynamo.repository";
import { SchemaValidator } from "./common/schemaValidator.service";

export interface PaginatedResponse<T extends Record<string, any>> {
  items: T[];
  cursor?: string;
}

@injectable()
export class ExampleDataService {
  constructor(
    @inject(LoggerService) private readonly logger: LoggerService,
    @inject(ExampleDynamoRepository) private readonly exampleDynamoRepository: ExampleDynamoRepository,
    @inject(SchemaValidator) private readonly schemaValidator: SchemaValidator
  ) {}

  async getExampleDataItems(): Promise<ExampleDataItemResponse[]> {
    this.logger.trace("getExampleDataItems called", null, this.constructor.name);

    // Include business logic here
    // If you have a multi-tenancy system, make sure you never allow a user to scan the whole table without a query/filter on the partition key.

    // Get the list of items
    const resultList = await this.exampleDynamoRepository.getAllRecords();

    // Map the database objects into API Response objects
    return resultList.map((it) => ExampleDataItemMapper.convertToExampleDataItemResponse(it));
  }

  /*
   * getDataItem()
   * Get a single record from the database, based on the primary key (partition key + sort key)
   */
  async getDataItem(tenantId: string, itemId: string): Promise<ExampleDataItemResponse> {
    this.logger.trace("getDataItem() called", { tenantId, itemId }, this.constructor.name);

    const record = await this.exampleDynamoRepository.getRecord(`TENANT#${tenantId}`, itemId);

    return ExampleDataItemMapper.convertToExampleDataItemResponse(record);
  }

  /*
   * deleteDataItem()
   * Delete a single record from the database, based on the primary key (partition key + sort key)
   */
  async deleteDataItem(tenantId: string, itemId: string): Promise<ExampleDataItemResponse> {
    this.logger.trace("deleteDataItem() called", { tenantId, itemId }, this.constructor.name);

    const record = await this.exampleDynamoRepository.deleteRecord(`TENANT#${tenantId}`, itemId);

    return ExampleDataItemMapper.convertToExampleDataItemResponse(record);
  }

  /*
   * createDataItem()
   * Create a new data item and store it in the database.
   * This usually includes some business logic to map the request into the database model
   */
  async createDataItem(
    requestData: CreateExampleDataItemRequest,
    tenantId: string,
    userId: string
  ): Promise<ExampleDataItemResponse> {
    this.logger.trace("createDataItem called", { request: requestData, tenantId, userId }, this.constructor.name);

    const record = ExampleDataItemMapper.createNewDynamoRecord(requestData, tenantId, userId);

    // Put the record in the data store
    const insertedRecord = await this.exampleDynamoRepository.putRecord(record);

    return ExampleDataItemMapper.convertToExampleDataItemResponse(insertedRecord);
  }

  /*
   * updateDataItem()
   * Update a partial data item in the database.
   * Use this function to overwrite only the specific properties provided in the record input.
   * The record object must include the partition key and the sort key, or an error will be thrown.
   * Properties that are not provided are left unchanged on the record in the database.
   * Returns the updated record from the database.
   */
  async updateDataItem(
    requestData: UpdateExampleDataItemRequest,
    itemId: string,
    tenantId: string,
    userId: string
  ): Promise<ExampleDataItemResponse> {
    this.logger.trace("updateDataItem() called", { requestData, itemId, tenantId, userId }, this.constructor.name);

    const partialRecordInput = ExampleDataItemMapper.convertToPartialDynamoRecord(
      requestData,
      itemId,
      tenantId,
      userId
    );

    // Overwrite the given attributes of the record in the data store
    const updatedRecord = await this.exampleDynamoRepository.updatePartialRecord(partialRecordInput);

    return ExampleDataItemMapper.convertToExampleDataItemResponse(updatedRecord);
  }

  /**
   * Query for a list of items using a global secondary index
   * @param tenantId
   * @param email
   * @param paginationInput
   * @returns
   */
  async getDataItemsByEmail(
    tenantId: string,
    email: string,
    paginationInput?: Pagination
  ): Promise<PaginatedResponse<ExampleDataItemResponse>> {
    this.logger.debug("getDataItemsByEmail", { tenantId, email, paginationInput });

    const pagination = this.schemaValidator.validateObject(paginationInput, PaginationSchema);

    const paginationOptions: PaginationOptions = {
      pageSize: pagination?.pageSize,
      sortDir: pagination?.sortDir as "asc" | "desc" | undefined,
      lastEvaluatedKey: this.decodeCursor(pagination?.cursor)
    };

    const { items, lastEvaluatedKey } = await this.exampleDynamoRepository.getExampleDataItemsByEmail(
      tenantId,
      email,
      paginationOptions
    );
    // The lastEvaluatedKey is a record of dynamo index keys, but the caller only needs to know that it functions as a cursor
    // The lastEvaluated key object could be exposed itself,
    // but it makes using the key as a cursor easier when converting it to a single value
    // since it can be passed easily as a single query param to a controller when requesting additional pages
    return {
      items: items.map((record) => ExampleDataItemMapper.convertToExampleDataItemResponse(record)),
      cursor: this.encodeCursor(lastEvaluatedKey)
    };
  }

  async processSqsMessage(sqsMessage: ExampleSqsMessage): Promise<any> {
    this.logger.debug("Processing message", { sqsMessage });
    // Do something cool
    return Promise.resolve({
      message: "Example SQS Message has been processed."
    });
  }

  // Business logic to process your dynamoDB stream event
  // Example: unmarshall a DynamoRecord into a StreamRecord (JavaScript Object)
  // async processDynamoDBStream(record: DynamoDBRecord): Promise<ExampleDynamoDBStreamRecord> {
  //   this.logger.debug("Processing Stream", { record });

  //   const keys = unmarshall((record.dynamodb?.Keys as Record<string, AttributeValue>) || {});
  //   const newImage = unmarshall((record.dynamodb?.NewImage as Record<string, AttributeValue>) || {});
  //   const oldImage = unmarshall((record.dynamodb?.OldImage as Record<string, AttributeValue>) || {});
  //   const eventName = record.eventName;

  //   const result: ExampleDynamoDBStreamRecord = {
  //     keys: keys,
  //     newImage: newImage,
  //     oldImage: oldImage,
  //     eventName: eventName
  //       ? DynamoStreamEventName[eventName as keyof typeof DynamoStreamEventName]
  //       : DynamoStreamEventName.UNKNOWN
  //   };

  //   this.logger.info("Example DynamoDB Stream has been processed", { result });
  //   return Promise.resolve(result);
  // }

  // This is an example method to hold business logic for processing an S3Event
  async processS3Event(event: S3Event): Promise<void> {
    this.logger.debug("processEvent() called", { event });

    // Extract x-amz-request-id from the event body to use as the correlation ID. Comment this line
    // out or encapsulate it into a try-catch if you do not want code to error out when the
    // x-amz-request-id cannot be extracted
    this.verifyCorrelationId(event);

    // Insert business logic here for processing S3 event - "do something cool!"

    // Example extracting values from the S3Event body
    const bucket = event.Records[0].s3.bucket.name;
    const object = event.Records[0].s3.object.key;

    this.logger.info("bucket name", { bucket });
    this.logger.info("object key", { object });
  }

  // For S3 events, extract the x-amz-request-id header from the S3 event to be used as the correlation ID
  verifyCorrelationId(event: S3Event): void {
    this.logger.trace("verifyCorrelationId() called", {}, this.constructor.name);

    // extract correlation object from event header
    const correlationObject = this.extractCorrelationObject(event);

    // Store the correlatiion object on the process object
    process.env.currentCorrelationId = correlationObject.correlationId;
  }

  private extractCorrelationObject(event: S3Event): any {
    if (!event.Records[0].responseElements["x-amz-request-id"]) {
      throw new BadRequestError("x-amz-request-id is required in the S3 event body");
    }

    const correlationId = event.Records[0].responseElements["x-amz-request-id"];

    return correlationId;
  }

  /**
   * Helper for dynamodb start keys
   * Encode the start key record to a single string value for ease of use
   * @param record
   * @returns
   */
  private encodeCursor(record?: Record<string, any>): string | undefined {
    if (record === undefined) return undefined;
    return Buffer.from(JSON.stringify(record)).toString("base64url");
  }

  /**
   * Helper for dynamodb start keys
   * Decode an incoming cursor string value to the start key record for querying
   * @param input
   * @returns
   */
  private decodeCursor(input?: string): any {
    if (input === undefined) return undefined;
    try {
      return JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
    } catch (error) {
      this.logger.error("Unable to parse base64 input to record", { error, input });
      return undefined;
    }
  }
}
