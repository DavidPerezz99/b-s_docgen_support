import type { ScanCommandInput } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import type { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";

import type { PaginatedOutput } from "./baseDynamo.repository";
import { BaseDynamoRepository } from "./baseDynamo.repository";

// Expose the base repo methods as public for testing
class Repo extends BaseDynamoRepository {
  async queryWithPaginationExt<T extends Record<string, any>>(
    queryInput: QueryCommandInput
  ): Promise<PaginatedOutput<T>> {
    return this.queryWithPagination(queryInput);
  }
  async queryWithAggregationExt(queryInput: QueryCommandInput | ScanCommandInput): Promise<Record<string, any>[]> {
    return this.queryWithAggregation(queryInput);
  }
}

describe("BaseDynamoRepository", () => {
  const mockLumigoService = {
    logProgrammaticError: jest.fn()
  } as unknown as LumigoService;
  const loggerService = new LoggerService(mockLumigoService);
  let mockDocumentClient: DynamoDBDocumentClient;
  let baseDynamoRepository: Repo;
  beforeEach(() => {
    mockDocumentClient = {
      send: jest.fn()
    } as any as DynamoDBDocumentClient;
    baseDynamoRepository = new Repo(loggerService, mockDocumentClient, {} as any);
  });

  describe("paging and aggregation", () => {
    beforeEach(() => {
      (mockDocumentClient.send as jest.Mock)
        .mockResolvedValueOnce({ Items: [1, 2, 3], LastEvaluatedKey: { x: 1 } })
        .mockResolvedValueOnce({ Items: [4, 5, 6], LastEvaluatedKey: { x: 2 } })
        .mockResolvedValueOnce({ Items: [7, 8, 9] });
    });
    describe("paging", () => {
      it("fetches data up until the page limit - limit smaller than available records", async () => {
        const result = await baseDynamoRepository.queryWithPaginationExt({
          TableName: "foo",
          Limit: 3
        });
        expect(result.items).toHaveLength(3);
        expect(mockDocumentClient.send).toHaveBeenCalledTimes(1);
      });
      it("limit is decremented by the amount returned in prior call", async () => {
        const result = await baseDynamoRepository.queryWithPaginationExt({
          TableName: "foo",
          Limit: 6
        });
        expect(result.items).toHaveLength(6);
        expect(mockDocumentClient.send).toHaveBeenCalledTimes(2);
        // check that the limit is decremented appropriately on subsequent calls
        const sendMock = mockDocumentClient.send as jest.Mock;
        expect(sendMock.mock.calls[1][0].input.Limit).toEqual(3);
        expect(sendMock.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ x: 1 });
      });
      it("stops fetching when LastEvaluatedKey is not present", async () => {
        const result = await baseDynamoRepository.queryWithPaginationExt({
          TableName: "foo",
          Limit: 10
        });
        expect(result.items).toHaveLength(9);
        expect(mockDocumentClient.send).toHaveBeenCalledTimes(3);
      });
      it("fetches data until there is none left with no Limit specified", async () => {
        const result = await baseDynamoRepository.queryWithPaginationExt({
          TableName: "foo"
        });
        expect(result.items).toHaveLength(9);
        expect(mockDocumentClient.send).toHaveBeenCalledTimes(3);
      });
    });
    describe("aggregation", () => {
      it("fetches data until there is none left", async () => {
        const result = await baseDynamoRepository.queryWithAggregationExt({
          TableName: "foo"
        });
        expect(result).toHaveLength(9);
        expect(mockDocumentClient.send).toHaveBeenCalledTimes(3);
      });
    });
  });
});
