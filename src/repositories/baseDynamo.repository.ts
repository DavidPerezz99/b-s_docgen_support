/*
  Docs for interacting with the DynamoDB Document Client:
  https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/dynamodb-example-document-client.html
*/

/*
  This BaseDynamoRepository further simplifies the interface with DynamoDb by providing functions that allow
  for key-value pairs to be used in queries, filters, negation filters (NOT conditions), and simple arrays
  for projection expressions. This implementation also avoids conflicts with DynamoDb keywords.

  There is a lot that can be improved here, but this can be a good start to subclass implementations of
  Repository classes that use DynamoDb as a data source.
*/

import {
  DescribeTableCommand,
  DynamoDBClient,
  ScanCommandInput,
  ScanCommandOutput,
  Update
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommand,
  TransactWriteCommand,
  TransactWriteCommandInput,
  UpdateCommand,
  UpdateCommandInput
} from "@aws-sdk/lib-dynamodb";
import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";

import { FilterInputParams, PaginationOptions, QueryBuilder, QueryInputParams } from "./dynamoDbQueryBuilder";

export interface DynamoTransactionWriteItem {
  record?: Record<string, any>;
  operation: string;
  partitionKeyValue?: string;
  sortKeyValue?: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
}

export interface PaginatedOutput<T extends Record<string, any>> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
}

export enum DBOperations {
  Delete = "DELETE",
  Put = "PUT",
  Update = "UPDATE"
}

@injectable()
export class BaseDynamoRepository {
  protected tableName = "";
  protected partitionKeyName = "";
  protected sortKeyName: string | undefined;

  constructor(
    @inject(LoggerService) protected logger: LoggerService,
    @inject(DynamoDBDocumentClient) protected documentClient: DynamoDBDocumentClient,
    @inject(DynamoDBClient) protected dynamodb: DynamoDBClient
  ) {}

  /*
   * init()
   * Due to the limitations of the IOC tool, these properties must be passed into an init function, instead
   * of the constructor. Derived classes must call init() as part of their constructor
   */
  protected init(tableName: string, partitionKeyName: string, sortKeyName: string | undefined): void {
    this.logger.trace("init() called", { tableName, partitionKeyName, sortKeyName }, this.constructor.name);
    this.tableName = tableName;
    this.partitionKeyName = partitionKeyName;
    this.sortKeyName = sortKeyName;
  }

  /*
   * put()
   * Use this function to create a new Item in the database table.
   * Use this function to completely overwrite the Item that matches the given pk and sk
   * Properties that are not provided will be removed from the database record.
   */
  protected async put(record: Record<string, any>): Promise<Record<string, any>> {
    this.logger.trace("put() called", { record }, this.constructor.name);

    const params = new PutCommand({
      TableName: this.tableName,
      Item: record
    });

    await this.documentClient.send(params);

    // The return value from the put() function is not particularly useful
    // So we return the record that was passed in.
    return record;
  }

  /*
   * update()
   * Update a partial record in the database.
   * Use this function to overwrite only the specific properties provided in the AttributeMap input.
   * The updates parameter object must include the partition key and the sort key.
   * Properties that are not provided are left unchanged on the record in the database.
   * Returns the updated record from the database.
   */
  protected async update(updates: Record<string, any>): Promise<Record<string, any> | undefined> {
    this.logger.trace("update() called", { updates }, this.constructor.name);

    const updateCommand = new UpdateCommand(this.generateUpdateParams(updates));

    const result = await this.documentClient.send(updateCommand);
    return result.Attributes;
  }

  /*
   * get()
   * Use this function to read a single item record from the database.
   * If the table defines a sort key, then the sortKeyValue must be provided
   */
  protected async get(partitionKeyValue: string, sortKeyValue?: string): Promise<Record<string, any> | undefined> {
    this.logger.trace("get() called", { partitionKeyValue, sortKeyValue }, this.constructor.name);

    const params = new GetCommand({
      TableName: this.tableName,
      Key: this.generatePrimaryKey(partitionKeyValue, sortKeyValue)
    });

    const result = await this.documentClient.send(params);
    return result.Item;
  }

  /*
   * delete()
   * Use this function to delete a single item record from the database.
   * If the table defines a sort key, then the sortKeyValue must be provided
   * Returns the record as it existed before the deletion.
   */
  protected async delete(partitionKeyValue: string, sortKeyValue?: string): Promise<Record<string, any> | undefined> {
    this.logger.trace("delete() called", { partitionKeyValue, sortKeyValue }, this.constructor.name);

    const params = new DeleteCommand({
      TableName: this.tableName,
      Key: this.generatePrimaryKey(partitionKeyValue, sortKeyValue),
      ReturnValues: "ALL_OLD" // Returns the attribute values of the record before the deletion
    });

    const result = await this.documentClient.send(params);
    return result.Attributes;
  }

  /**
   * Execute a QueryCommandInput against Dynamo with the DocumentClient
   * @param queryInput
   * @returns
   */
  async query(queryInput: QueryCommandInput): Promise<QueryCommandOutput> {
    return this.documentClient.send(new QueryCommand(queryInput));
  }

  /**
   * Execute the same query again iteratively until the input page Limit is reached or the data is exhausted
   * @param queryInput
   * @param result
   * @returns the raw Command Output so that the LastEvaluatedKey is accessible for user-specified paging
   */
  private async queryAll(queryInput: QueryCommandInput): Promise<QueryCommandOutput> {
    let result = await this.documentClient.send(new QueryCommand(queryInput));
    let items = result.Items ?? [];
    /* eslint-disable no-await-in-loop */
    while (this.hasResultBeenTruncated(queryInput.Limit, items.length, result.LastEvaluatedKey)) {
      result = await this.documentClient.send(
        new QueryCommand({
          ...queryInput,
          Limit: queryInput.Limit ? queryInput.Limit - items.length : undefined,
          ExclusiveStartKey: result.LastEvaluatedKey
        })
      );
      items = items.concat(result.Items ?? []);
    }
    /* eslint-enable no-await-in-loop */
    return { ...result, Items: items };
  }

  /**
   * Execute a ScanCommandInput against Dynamo with the DocumentClient
   * @param scanInput
   * @returns
   */
  async scan(scanInput: ScanCommandInput): Promise<ScanCommandOutput> {
    return this.documentClient.send(new ScanCommand(scanInput));
  }

  /**
   * Execute the scan operation again iteratively until the input page Limit is reached or the data is exhausted
   * @param queryInput
   * @param result
   * @returns the raw Scan or Query Command Output so that the LastEvaluatedKey is accessible for user-specified paging
   */
  private async scanAll(scanInput: ScanCommandInput): Promise<ScanCommandOutput> {
    let result = await this.documentClient.send(new ScanCommand(scanInput));
    let items = result.Items ?? [];
    /* eslint-disable no-await-in-loop */
    while (this.hasResultBeenTruncated(scanInput.Limit, items.length, result.LastEvaluatedKey)) {
      result = await this.documentClient.send(
        new QueryCommand({
          ...scanInput,
          Limit: scanInput.Limit ? scanInput.Limit - items.length : undefined,
          ExclusiveStartKey: result.LastEvaluatedKey
        })
      );
      items = items.concat(result.Items ?? []);
    }
    /* eslint-enable no-await-in-loop */
    return { ...result, Items: items };
  }

  /*
   * queryGlobalSecondaryIndex()
   * Use this function to query for any number of items based on a Global Secondary Index.
   * A GSI always has a DIFFERENT Partition Key as the base table, so specifying partitionKeyName is required.
   * Since the sort key value of a Global Secondary Index isn't a unique key, it's possible to get an array of matching results.
   */
  protected async queryGlobalSecondaryIndex(
    indexName: string,
    partitionKeyName: string,
    partitionKeyValue: string,
    sortKeyName: string,
    sortKeyValue: string,
    filterOptions?: FilterInputParams,
    paginationOptions?: PaginationOptions
  ): Promise<PaginatedOutput<Record<string, any>>> {
    this.logger.trace(
      "queryGlobalSecondaryIndex() called",
      {
        indexName,
        partitionKeyName,
        partitionKeyValue,
        paginationOptions
      },
      this.constructor.name
    );

    const options: PaginationOptions = paginationOptions ?? {};

    const query = new QueryBuilder(this.tableName)
      .withIndex({ indexName })
      .withKeys({
        partitionKeyName,
        partitionKeyValue,
        sortKeyName,
        sortKeyValue
      })
      .withFilter(filterOptions)
      .withPagination(options)
      .build();

    return this.queryWithPagination<Record<string, any>>(query);
  }

  /*
   * queryLocalSecondaryIndex()
   * Use this function to query for any number of items based on a Local Secondary Index
   * An LSI always has the same Partition Key as the base table, so specifying partitionKeyName is not necessary.
   * Since the sort key value of a Local Secondary Index isn't a unique key, it's possible to get an array of matching results.
   */
  protected async queryLocalSecondaryIndex(
    indexName: string,
    partitionKeyValue: string,
    sortKeyName: string,
    sortKeyValue: string,
    filterOptions?: FilterInputParams,
    paginationOptions?: PaginationOptions
  ): Promise<PaginatedOutput<Record<string, any>>> {
    this.logger.trace(
      "queryLocalSecondaryIndex() called",
      {
        indexName,
        partitionKeyValue,
        sortKeyName,
        sortKeyValue
      },
      this.constructor.name
    );
    const options: PaginationOptions = paginationOptions ?? {};

    const query = new QueryBuilder(this.tableName)
      .withIndex({ indexName })
      .withKeys({
        partitionKeyName: this.partitionKeyName,
        partitionKeyValue,
        sortKeyName,
        sortKeyValue
      })
      .withFilter(filterOptions)
      .withPagination(options)
      .build();

    return this.queryWithPagination<Record<string, any>>(query);
  }

  /*
   * queryWithFilters()
   * Use this function to query for any number of items based on just a partition key and filter criteria.
   * This function supports querying the base table, LSI indexes, and GSI indexes, using the QueryInputParams object.
   * This function will aggregate all of the Dynamo results to ensure that a complete data set is returned.
   */
  protected async queryWithFilters(
    params: QueryInputParams,
    filterInputParams: FilterInputParams
  ): Promise<Record<string, any>[]> {
    this.logger.trace("queryWithFilters() called", { params, filterInputParams }, this.constructor.name);

    const queryInput = new QueryBuilder(this.tableName)
      .withKeys({
        partitionKeyName: params.partitionKeyName ?? this.partitionKeyName,
        partitionKeyValue: params.partitionKeyValue,
        sortKeyName: params.sortKeyName,
        sortKeyValue: params.sortKeyValue
      })
      .withFilter(filterInputParams)
      .build();

    return this.queryWithAggregation(queryInput);
  }

  /*
   * scanWithFilters()
   * WARNING: Use this function sparingly!
   * A scan operation in DynamoDB is very slow, especially as the amount of data in the table scales up.
   * Use this function to scan through every record in the table, applying filters after the data is retreived.
   * Filters supported by this function are simple equals and not equals.
   *
   * Example usage:
   * const recordsArray = this.scanWithFilters({
   *   filters: { status: "active" }, // Only return records that have status = "active"
   *   negationFilters: { deleted: true }, // AND don't return any records that have deleted = true
   *   fields: [ "score" ] // Instead of including all fields in the response, just include the "score" field
   * });
   */
  protected async scanWithFilters(filters?: FilterInputParams): Promise<Record<string, any>[]> {
    const queryInput = new QueryBuilder(this.tableName).withFilter(filters).build("scan");

    return this.scanWithAggregation(queryInput);
  }

  /*
   * generatePrimaryKey()
   * Given a list of fields, create the projection expression with aliased field names, to avoid reserved word conflicts.
   */
  protected generatePrimaryKey(partitionKeyValue: string, sortKeyValue?: string): Record<string, string> {
    const key: Record<string, string> = {
      [this.partitionKeyName]: partitionKeyValue
    };

    // If the table has a sort key defined, then it must be specified in the Primary Key object
    if (this.sortKeyName) {
      // Verify that the sort key is provided
      if (sortKeyValue === undefined) {
        throw new Error(
          `The attribute "${this.sortKeyName}" is required in the primary key, because it is the sort key.`
        );
      }

      key[this.sortKeyName] = sortKeyValue;
    }

    return key;
  }

  /*
   * generateUpdateParams()
   * Create the UpdateItemInput object needed to make a partial update request on the database table, for a single item.
   */
  protected generateUpdateParams(updates: Record<string, any>): UpdateCommandInput {
    this.logger.trace("generateUpdateParams() called", { updates }, this.constructor.name);

    // Verify that the partition key and sort key are included in the updates object
    if (!updates[this.partitionKeyName]) {
      throw new Error(
        `The attribute "${this.partitionKeyName}" is required when updating a record, because it is the partition key.`
      );
    }
    if (this.sortKeyName && updates[this.sortKeyName] === undefined) {
      throw new Error(
        `The attribute "${this.sortKeyName}" is required when updating a record, because it is the sort key.`
      );
    }

    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    let updateExpression: string | undefined;

    // Convert each property into an alias to avoid keyword collisions
    for (const property in updates) {
      // Don't add the partition key or sort key to the update expression
      if (property === this.partitionKeyName || property === this.sortKeyName) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(updates, property) && updates[property] !== undefined) {
        const propertyNameAlias = "#" + property;
        const propertyValueAlias = ":" + property;

        if (updateExpression) {
          // Append to the update expression
          updateExpression += ", ";
        } else {
          // Begin the update expression
          updateExpression = "SET ";
        }

        // This adds the assignment expression, using the aliases to avoid keyword collisions
        // e.g. "#status = :status"
        updateExpression += `${propertyNameAlias} = ${propertyValueAlias}`;

        // This sets the references for the aliases
        // e.g. expressionAttributeNames["#status"] = "status"
        // e.g. expressionAttributeValues[":status"] = "active"
        expressionAttributeNames[propertyNameAlias] = property;
        expressionAttributeValues[propertyValueAlias] = updates[property];
      }
    }

    const partitionKeyValue = updates[this.partitionKeyName];
    const sortKeyValue = this.sortKeyName ? updates[this.sortKeyName] : undefined;
    const itemKey = this.generatePrimaryKey(partitionKeyValue, sortKeyValue);

    return {
      TableName: this.tableName,
      Key: itemKey,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW"
    };
  }

  /*
   * queryWithAggregation()
   * This helper function starts a chain to query the table through all of the paginated results.
   * DynamoDB has a maximum result size of 1MB, so if there is more data available than that, it is paginated in the response
   *
   * Note: This should only be used for async data processing since it aggregates a query result that could be of very large size
   * For online API queries, keep the pagination and expose that to the API
   */
  protected async queryWithAggregation(
    queryInput: QueryCommandInput | ScanCommandInput
  ): Promise<Record<string, any>[]> {
    this.logger.trace("queryWithAggregation() called", { queryCommand: queryInput }, this.constructor.name);

    const result = await this.queryAll(queryInput);
    return result.Items ?? [];
  }

  /*
   * scanWithAggregation()
   * This helper function starts a chain to scan the table through all of the paginated results.
   * DynamoDB has a maximum result size of 1MB, so if there is more data available than that, it is paginated in the response
   *
   * If a Limit is specified in the scanInput, results will only be aggregated up until the limit is hit.
   *
   * This should only be used for async data processing since it aggregates a query result that could be of very large size
   * For online API queries, keep the pagination and expose that to the API
   */
  protected async scanWithAggregation(scanInput: ScanCommandInput): Promise<Record<string, any>[]> {
    this.logger.trace("scanWithAggregation() called", { queryCommand: scanInput }, this.constructor.name);

    const result = await this.scanAll(scanInput);
    return result.Items ?? [];
  }

  /**
   * Helper method to format a response when pagination is expected
   * @param queryInput
   * @returns
   */
  protected async queryWithPagination<T extends Record<string, any>>(
    queryInput: QueryCommandInput
  ): Promise<PaginatedOutput<T>> {
    const result = await this.queryAll(queryInput);
    const items = (result.Items ?? []) as T[];

    return {
      items,
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  }

  /*
   * describeTable()
   * Gets metadata about the table.
   * Used for "pinging" the table to measure latency and verify connectivity and configuration.
   */
  protected async describeTable(): Promise<string> {
    this.logger.trace("describeTable() called", null, this.constructor.name);

    const params = new DescribeTableCommand({
      TableName: this.tableName
    });

    const result = await this.dynamodb.send(params);

    if (result.Table?.TableStatus !== "ACTIVE") {
      throw new Error("DynamoDB table status is not in healthy state.");
    }

    return result.Table.TableStatus;
  }

  /*
   * transactionalWrite()
   * Executes multiple write operations within a single transaction.
   * If any one of the write operations fails, the transaction is aborted.
   */
  protected async transactionalWrite(entities: DynamoTransactionWriteItem[]): Promise<DynamoTransactionWriteItem[]> {
    this.logger.trace("transactionalWrite() called", { entities }, this.constructor.name);

    const params: TransactWriteCommandInput = {
      TransactItems: []
    };

    entities.forEach((item) => {
      const operation = item.operation;
      const record = item.record;
      const partitionKeyValue = item.partitionKeyValue;
      const sortKeyValue = item.sortKeyValue;
      const conditionExpression = item.conditionExpression;
      const expressionAttributeNames = item.expressionAttributeNames;
      const expressionAttributeValues = item.expressionAttributeValues;

      switch (operation) {
        case DBOperations.Put: {
          if (record) {
            const putParams = {
              TableName: this.tableName,
              Item: record,
              ...(conditionExpression && { ConditionExpression: conditionExpression }),
              ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
              ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues })
            };

            params.TransactItems?.push({ Put: putParams });
          }
          break;
        }

        case DBOperations.Update: {
          if (record) {
            const updateParams = this.generateUpdateParams(record) as Update;

            if (conditionExpression) {
              updateParams.ConditionExpression = conditionExpression;
            }

            if (expressionAttributeNames) {
              updateParams.ExpressionAttributeNames = updateParams.ExpressionAttributeNames || {};
              Object.assign(updateParams.ExpressionAttributeNames, expressionAttributeNames);
            }

            if (expressionAttributeValues) {
              updateParams.ExpressionAttributeValues = updateParams.ExpressionAttributeValues || {};
              Object.assign(updateParams.ExpressionAttributeValues, expressionAttributeValues);
            }

            params.TransactItems?.push({
              Update: updateParams
            });
          }
          break;
        }

        case DBOperations.Delete: {
          if (partitionKeyValue) {
            const deleteParams = {
              TableName: this.tableName,
              Key: this.generatePrimaryKey(partitionKeyValue, sortKeyValue),
              ...(conditionExpression && { ConditionExpression: conditionExpression }),
              ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
              ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues })
            };

            params.TransactItems?.push({
              Delete: deleteParams
            });
          }
          break;
        }
      }
    });

    await this.documentClient.send(new TransactWriteCommand(params));
    return entities;
  }

  /**
   * DynamoDB has a maximum result size of 1MB, so it's possible that a result set is truncated due to size
   * This method will determine if a result set was truncated (vs. one that was manually limited with a Limit input)
   *
   * @param input
   * @param result
   * @returns
   */
  hasResultBeenTruncated(
    inputLimit: number | undefined,
    aggregatedOutputLength: number | undefined,
    lastEvaluatedKey: Record<string, any> | undefined
  ): boolean {
    const outputLength = aggregatedOutputLength ?? 0;
    // if a Limit was specified, the result may still have been truncated if the max size ouput was reached before the Limit
    // we know the result was truncated if the output size is smaller than the inputLimit and a LastEvaluatedKey is present to fetch more data
    if (inputLimit && inputLimit > 0) {
      return lastEvaluatedKey !== undefined && outputLength < inputLimit;
    }
    // if no Limit was specified, the LastEvaluatedKey indicates whether the result was truncated
    return lastEvaluatedKey !== undefined;
  }
}
