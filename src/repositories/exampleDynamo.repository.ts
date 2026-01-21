import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";

import { EnvironmentConfig } from "../config/env.config";
import { ContainerKeys } from "../config/ioc.keys";
import { NotFoundError } from "../errors/notFound.error";
import { ExampleDataItemRecord } from "../models/exampleDataItemRecord.model";
import { BaseDynamoRepository, PaginatedOutput } from "./baseDynamo.repository";
import { PaginationOptions, QueryBuilder } from "./dynamoDbQueryBuilder";

@injectable()
export class ExampleDynamoRepository extends BaseDynamoRepository {
  constructor(
    @inject(LoggerService) logger: LoggerService,
    @inject(ContainerKeys.envConfig) envConfig: EnvironmentConfig,
    @inject(DynamoDBDocumentClient) documentClient: DynamoDBDocumentClient,
    @inject(DynamoDBClient) dynamodb: DynamoDBClient
  ) {
    super(logger, documentClient, dynamodb);

    this.init(envConfig.dbTableName, "pk", "sk");
  }

  /*
   * pingTable()
   * Gets metadata about the table.
   * Used for "pinging" the table to measure latency and verify connectivity and configuration.
   */
  async pingTable(): Promise<string> {
    this.logger.trace("pingTable() called", null, this.constructor.name);
    return this.describeTable();
  }

  /*
   * getAllRecords()
   * WARNING: Don't use this function on a large table. It is very slow.
   */
  async getAllRecords(): Promise<ExampleDataItemRecord[]> {
    this.logger.trace("getAllRecords() called", null, this.constructor.name);

    return (await this.scanWithFilters()).map((it) => it as ExampleDataItemRecord);
  }

  /*
   * getRecord()
   * Get a single record from the database, based on the primary key (partition key + sort key)
   */
  async getRecord(partitionKeyValue: string, sortKeyValue: string): Promise<ExampleDataItemRecord> {
    this.logger.trace("getRecord() called", { partitionKeyValue, sortKeyValue }, this.constructor.name);

    // Get the database record with this primary key
    const record = await this.get(partitionKeyValue, sortKeyValue);
    if (!record) {
      throw new NotFoundError(`No item found with ID ${partitionKeyValue}`);
    }
    return record as ExampleDataItemRecord;
  }

  /*
   * deleteRecord()
   * Delete a single record from the database, based on the primary key (partition key + sort key)
   */
  async deleteRecord(partitionKeyValue: string, sortKeyValue: string): Promise<ExampleDataItemRecord> {
    this.logger.trace("deleteRecord() called", { partitionKeyValue, sortKeyValue }, this.constructor.name);

    return this.delete(partitionKeyValue, sortKeyValue) as Promise<ExampleDataItemRecord>;
  }

  /*
   * putRecord()
   * Create or replace a single record in the database, based on the primary key (partition key + sort key)
   * If the record already exists, it will be completely overwritten.
   * To do partial updates, use the update() function
   */
  async putRecord(record: ExampleDataItemRecord): Promise<ExampleDataItemRecord> {
    this.logger.trace("putRecord() called", { record }, this.constructor.name);

    return this.put(record) as Promise<ExampleDataItemRecord>;
  }

  /*
   * updatePartialRecord()
   * Update a partial record in the database.
   * Use this function to overwrite only the specific properties provided in the record input.
   * The record object must include the partition key and the sort key, or an error will be thrown.
   * Properties that are not provided are left unchanged on the record in the database.
   * Returns the updated record from the database.
   */
  async updatePartialRecord(partialRecord: Partial<ExampleDataItemRecord>): Promise<ExampleDataItemRecord> {
    this.logger.trace("updatePartialRecord() called", { partialRecord }, this.constructor.name);
    return this.update(partialRecord) as Promise<ExampleDataItemRecord>;
  }

  async getExampleDataItemsByEmail(
    tenantId: string,
    email: string,
    paginationOptions?: PaginationOptions
  ): Promise<PaginatedOutput<ExampleDataItemRecord>> {
    this.logger.debug("getExampleDataItemsByEmail() called", {
      paginationOptions
    });

    // set some default pagination options if not passed
    const options: PaginationOptions = {
      pageSize: 25,
      sortDir: "desc",
      ...paginationOptions
    };

    /**
     * A GSI always has a DIFFERENT Partition Key as the base table, so specifying partitionKeyName is required.
     * Since the sort key value of a Global Secondary Index isn't a unique key, it's possible to get an array of matching results.
     */
    const query = new QueryBuilder(this.tableName)
      .withIndex({
        // Query with the global secondary index
        indexName: "emailIndex"
      })
      .withKeys({
        partitionKeyName: "email",
        partitionKeyValue: email
      })
      .withFilter({ pk: [`TENANT#${tenantId}`] })
      .withPagination(options)
      .build();

    this.logger.debug("Query input", { query });

    return this.queryWithPagination<ExampleDataItemRecord>(query);
  }
}
