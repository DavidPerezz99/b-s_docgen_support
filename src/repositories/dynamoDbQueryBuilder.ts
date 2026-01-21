import type { QueryCommandInput, ScanCommandInput } from "@aws-sdk/client-dynamodb";

import type { FilterExpression, SortKeyCondition } from "./dynamoDbExpressions";
import { A, And, AttributeTracker, Comparison, Eq, Or } from "./dynamoDbExpressions";

export type ScanOrQueryInput = QueryCommandInput | ScanCommandInput;
type Operation = "query" | "scan";
type Filters = Record<string, any[]>;

export type FilterInputParams = Filters | undefined;

export interface QueryInputParams {
  indexName?: string;
  partitionKeyName?: string;
  partitionKeyValue: string;
  sortKeyName?: string;
  sortKeyValue?: string;
  filterInputParams?: FilterInputParams;
}

export interface PaginationOptions {
  pageSize?: number;
  lastEvaluatedKey?: Record<string, any>;
  sortDir?: "asc" | "desc";
}

export interface KeyParams {
  partitionKeyName: string;
  partitionKeyValue: string;
  sortKeyName?: string;
  sortKeyValue?: string;
  sortKeyCondition?: SortKeyCondition;
}

export interface IndexParams {
  /**
   * Required for use with a GSI or LSI
   */
  indexName?: string;
}

/**
 * Utility class to build DynamoDB Query Command Inputs for Query and Scan operations
 * Can be used for queries on any key schema (main partition, GSI, LSI, etc)
 * Full support of DynamoDb Filter Expressions
 * Assists with pagination and filtering
 */
export class QueryBuilder {
  query: QueryCommandInput;
  index?: IndexParams;
  keys?: KeyParams;
  expressionAttributeNames: Record<string, any> = {};
  expressionAttributeValues: Record<string, any> = {};
  filter?: FilterInputParams;
  filterExpression?: FilterExpression;
  fields?: string[];
  pagination?: PaginationOptions;
  rawQueryOptions?: Partial<QueryCommandInput>;
  tracker = new AttributeTracker();

  constructor(private readonly tableName: string) {
    this.query = { TableName: tableName };
  }

  /**
   * Optional
   *
   * Specify the name of the index to query
   * @param indexParams
   * @returns
   */
  withIndex(indexParams: IndexParams): this {
    if (this.index) throw new Error("Only one index can be specified");
    this.index = indexParams;
    return this;
  }
  /**
   * Required for Query operations
   *
   * Specify partition and sort key names and values for the target index
   * as well as the option for a sortKey KeyConditionExpression
   * @param keyParams
   */
  withKeys(keyParams: KeyParams): this {
    if (this.keys) throw new Error("Keys can only be specified once per query");
    this.keys = keyParams;
    return this;
  }

  /**
   * Specify a subset of fields to be returned in a ProjectionExpression
   * @param fields
   * @returns
   */
  withFields(...fields: string[]): this {
    this.fields = fields;
    return this;
  }

  /**
   * Optional
   *
   * For building simple filters
   * Builds a filter expression based on the input using simple equality comparisons
   * Tracks and subs attribute names and values
   *
   * Mutually exclusive with use of `withFilterExpression`
   * @param filterParams
   * @returns
   */
  withFilter(filterParams?: FilterInputParams): this {
    if (this.filter !== undefined || this.filterExpression !== undefined) {
      throw new Error("Only 1 filter or filter expression can be applied per query");
    }
    if (filterParams === undefined) return this;
    this.filter = filterParams;
    return this;
  }

  /**
   * More verbose than using `withFilters`, but more powerful.
   * For building complex queries that can use the full breadth of DynamoDb Filter Expressions
   * Uses FilterExpression operations from the dynamoDbExpressions.ts file
   *
   * Tracks all attributes and values in the built expression to appropriately sub them automatically
   * in the produced query
   *
   * Mutually exclusive with use of `useFilter`
   * @param filterExpression A filter expression object
   * @returns
   */
  withFilterExpression(filterExpression: FilterExpression | undefined): this {
    if (this.filter !== undefined || this.filterExpression !== undefined) {
      throw new Error("Only 1 filter or filter expression can be applied per query");
    }
    if (filterExpression === undefined) return this;
    this.filterExpression = filterExpression;
    return this;
  }

  /**
   * Optional
   *
   * Add pagination properties to the query such as sortDirection, pageSize, and the starting key
   * @param paginationOptions
   * @returns
   */
  withPagination(paginationOptions?: PaginationOptions): this {
    this.pagination = paginationOptions;
    return this;
  }

  /**
   * Additional query options are applied directly to the DynamoDb QueryCommandInput
   * This allows any additional customization of the query input that is not offered in the builder
   *
   * When the query is built, these are applied first before other builder elements so on a conflict
   * with another builder step, they will be overwritten
   * @param additionalQueryOptions
   */
  withRaw(additionalQueryOptions: Partial<QueryCommandInput>): this {
    this.rawQueryOptions = additionalQueryOptions;
    return this;
  }

  /**
   * Build a QueryCommandInput from the specified builder options to be used by a DynamoDB Document Client
   * @returns
   */
  build(operation: Operation = "query"): QueryCommandInput | ScanCommandInput {
    this.tracker = new AttributeTracker();
    if (
      operation === "query" &&
      (!this.keys?.partitionKeyName || (this.keys.partitionKeyValue as unknown) === undefined)
    ) {
      throw new Error(
        "A key configuration using `withKeys` containing a partition key name and value is required for a query operation"
      );
    }
    let query = Object.assign(this.query, this.rawQueryOptions);
    if (operation === "query") {
      query = this.buildKeys(query, this.keys);
    }
    query = this.buildIndex(query, this.index);
    query = this.buildFilter(query, this.filter);
    query = this.buildFilterExpression(query, this.filterExpression);
    query = this.buildFields(query, this.fields);
    query = this.buildPagination(query, this.pagination);
    query = this.buildExpressionAttributeNamesAndValues(
      query,
      this.tracker.attributeNames,
      this.tracker.attributeValues
    );
    return query;
  }

  private buildExpressionAttributeNamesAndValues(
    query: QueryCommandInput,
    names: Record<string, any>,
    values: Record<string, any>
  ): QueryCommandInput {
    if (Object.keys(names).length > 0) {
      Object.assign(query, {
        ExpressionAttributeNames: names
      });
    }
    if (Object.keys(values).length > 0) {
      Object.assign(query, {
        ExpressionAttributeValues: values
      });
    }
    return query;
  }

  private buildKeys(query: QueryCommandInput, keys?: KeyParams): QueryCommandInput {
    if (!keys) return query;

    // Build the partition key expression
    const partitionKeyCondition = new Eq(A(keys.partitionKeyName), keys.partitionKeyValue);

    // Build the sort key expression, if a sort key is specified
    if (keys.sortKeyName && keys.sortKeyValue !== undefined) {
      const sortKeyCondition = new Eq(A(keys.sortKeyName), keys.sortKeyValue);
      query.KeyConditionExpression = new And(partitionKeyCondition, sortKeyCondition).build(this.tracker);
    } else if (keys.sortKeyCondition !== undefined) {
      query.KeyConditionExpression = new And(partitionKeyCondition, keys.sortKeyCondition).build(this.tracker);
    } else {
      query.KeyConditionExpression = partitionKeyCondition.build(this.tracker);
    }

    return query;
  }

  private buildIndex(query: QueryCommandInput, index?: IndexParams): QueryCommandInput {
    // If an index is specified, add it to the QueryCommandInput
    if (index?.indexName) {
      query.IndexName = index.indexName;
    }
    return query;
  }

  private buildPagination(query: QueryCommandInput, pagination?: PaginationOptions): QueryCommandInput {
    if (!pagination) return query;
    query.Limit = pagination.pageSize;
    if (pagination.lastEvaluatedKey) {
      query.ExclusiveStartKey = pagination.lastEvaluatedKey;
    }
    if (pagination.sortDir === "desc") {
      query.ScanIndexForward = false;
    }
    return query;
  }

  private buildFilterExpression(query: QueryCommandInput, filterExpression?: FilterExpression): QueryCommandInput {
    if (!filterExpression) return query;
    query.FilterExpression = filterExpression.build(this.tracker);
    return query;
  }

  private buildFilter(query: QueryCommandInput, filter?: FilterInputParams): QueryCommandInput {
    if (!filter) return query;
    query.FilterExpression = this.generateFilterInput(filter);
    return query;
  }

  private buildFields(query: QueryCommandInput, fields?: string[]): QueryCommandInput {
    if (!fields) return query;
    query.ProjectionExpression = this.generateProjectionExpression(fields);
    return query;
  }

  private generateFilterInput(filterInputParams: FilterInputParams): string | undefined {
    const filters = filterInputParams;

    let filterExpressionCondition: FilterExpression | undefined = undefined;
    if (filters && Object.keys(filters).length > 0) {
      filterExpressionCondition = this.generateFilterExpression(filters);
    }

    if (filterExpressionCondition) {
      return filterExpressionCondition.build(this.tracker);
    }
    return undefined;
  }
  /*
   * generateFilterExpression()
   * Given a list of key-value pair filters, create the filter expression with aliased field names, using equals as the operator.
   */
  protected generateFilterExpression(filters: Filters): FilterExpression {
    const filterKeys = Object.keys(filters);

    // if only one value for a key, create just a comparison condition
    // otherwise Create an OR of comparisons for all the values for that key
    const comparisons: FilterExpression[] = Object.entries(filters).map(([key, values]) => {
      if (values.length === 1) return new Comparison(A(key), "=", values[0]);
      return new Or(...values.map((v) => new Comparison(A(key), "=", v)));
    });

    // If more than one key, AND all the conditions, otherwise return the one condition
    if (filterKeys.length === 1) {
      return Object.values(comparisons)[0];
    } else {
      return new And(...Object.values(comparisons));
    }
  }

  /*
   * generateProjectionExpression()
   * Given a list of fields, create the projection expression with aliased field names, to avoid reserved word conflicts.
   */
  protected generateProjectionExpression(fields: string[]): string {
    const projectionFields: Set<string> = new Set();
    for (const field of fields) {
      // so that we don't risk a specified field being in conflict with a DynamoDb keyword
      const fieldName = this.tracker.get(A(field));
      projectionFields.add(fieldName);
    }
    // The primary key properties should always be included in the response, and a validation error will occur if they appear
    // in the projection expression twice
    if (this.keys) {
      const pkName = this.tracker.get(A(this.keys.partitionKeyName));
      projectionFields.add(pkName);

      if (this.keys.sortKeyName) {
        const skName = this.tracker.get(A(this.keys.sortKeyName));
        projectionFields.add(skName);
      }
    }
    return Array.from(projectionFields).join(",");
  }
}
