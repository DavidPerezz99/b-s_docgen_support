import type { QueryCommandInput } from "@aws-sdk/client-dynamodb";

import { A, And, BeginsWith, Comparison, Eq, Not, Or } from "./dynamoDbExpressions";
import { QueryBuilder } from "./dynamoDbQueryBuilder";

describe("Query Builder", () => {
  const tableName = "table";

  it("sets the table name", () => {
    const query: QueryCommandInput = new QueryBuilder(tableName)
      .withKeys({
        partitionKeyName: "pk",
        partitionKeyValue: "pkValue"
      })
      .build();
    expect(query.TableName).toEqual(tableName);
  });

  describe("Keys / Indexes", () => {
    describe("creates the KeyConditionExpression and ExpressionAttributeNames / Values", () => {
      it("with a primary key", () => {
        const query: QueryCommandInput = new QueryBuilder(tableName)
          .withKeys({
            partitionKeyName: "pk",
            partitionKeyValue: "myPk"
          })
          .build();
        expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
        expect(query.ExpressionAttributeNames).toEqual({ "#pk": "pk" });
        expect(query.ExpressionAttributeValues as any).toEqual({ ":v_sub0": "myPk" });
      });
      it("with a primary key and sort key", () => {
        const query: QueryCommandInput = new QueryBuilder(tableName)
          .withKeys({
            partitionKeyName: "pk",
            partitionKeyValue: "myPk",
            sortKeyName: "sk",
            sortKeyValue: "mySk"
          })
          .build();
        expect(query.KeyConditionExpression).toEqual("(#pk = :v_sub0) AND (#sk = :v_sub1)");
        expect(query.ExpressionAttributeNames).toEqual({
          "#pk": "pk",
          "#sk": "sk"
        });
        expect(query.ExpressionAttributeValues as any).toEqual({
          ":v_sub0": "myPk",
          ":v_sub1": "mySk"
        });
      });
      it("with a sort key condition expression", () => {
        const query: QueryCommandInput = new QueryBuilder(tableName)
          .withKeys({
            partitionKeyName: "pk",
            partitionKeyValue: "myPk",
            sortKeyCondition: new BeginsWith(A("sk"), "tenant#abc")
          })
          .build();
        expect(query.KeyConditionExpression).toEqual("(#pk = :v_sub0) AND (begins_with(#sk, :v_sub1))");
        expect(query.ExpressionAttributeNames).toEqual({
          "#pk": "pk",
          "#sk": "sk"
        });
        expect(query.ExpressionAttributeValues as any).toEqual({
          ":v_sub0": "myPk",
          ":v_sub1": "tenant#abc"
        });
      });
      it("sets a gsi or lsi index name", () => {
        const query: QueryCommandInput = new QueryBuilder(tableName)
          .withIndex({
            indexName: "gsiName"
          })
          .withKeys({
            partitionKeyName: "pk",
            partitionKeyValue: "myPk",
            sortKeyName: "sk",
            sortKeyValue: "mySk"
          })
          .build();
        expect(query.KeyConditionExpression).toEqual("(#pk = :v_sub0) AND (#sk = :v_sub1)");
        expect(query.ExpressionAttributeNames).toEqual({
          "#pk": "pk",
          "#sk": "sk"
        });
        expect(query.ExpressionAttributeValues as any).toEqual({
          ":v_sub0": "myPk",
          ":v_sub1": "mySk"
        });
        expect(query.IndexName).toEqual("gsiName");
      });
      it("omits ExpressionAttributeValues and ExpressionAttributeNames for a scan when no index is specified", () => {
        const query = new QueryBuilder(tableName).build("scan");
        expect(query.ExpressionAttributeNames).toBeUndefined();
        expect(query.ExpressionAttributeValues).toBeUndefined();
      });
      describe("query operations", () => {
        describe("throws with an invalid index", () => {
          it("with no index", () => {
            expect(() => {
              new QueryBuilder(tableName).build();
            }).toThrow();
          });
          it("with missing partitionKeyName", () => {
            expect(() => {
              new QueryBuilder(tableName).withKeys({ partitionKeyValue: "myPk" } as any).build();
            }).toThrow();
          });
          it("with missing partitionKeyValue on a query (implicit)", () => {
            expect(() => {
              new QueryBuilder(tableName).withKeys({ partitionKeyName: "pk" } as any).build();
            }).toThrow();
          });
          it("with missing partitionKeyValue on a query (explicit)", () => {
            expect(() => {
              new QueryBuilder(tableName).withKeys({ partitionKeyName: "pk" } as any).build("query");
            }).toThrow();
          });
        });
      });
      describe("scan operations", () => {
        it("doesn't throw for unspecified index", () => {
          expect(() => {
            new QueryBuilder(tableName).build("scan");
          }).not.toThrow();
        });
        it("doesn't throw for missing partition key name/value", () => {
          expect(() => {
            new QueryBuilder(tableName).withKeys({ indexName: "secondary" } as any).build("scan");
          }).not.toThrow();
        });
      });
    });
  });

  describe("Filters", () => {
    it("it combines filter expression names and values with index ones", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilter({
          customField: ["value1"]
        })
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1"
      });
      expect(query.FilterExpression).toEqual("#customField = :v_sub1");
    });
    it("it produces a filter expression with multiple values", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilter({
          customField: ["value1", "value2"]
        })
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1",
        ":v_sub2": "value2"
      });
      expect(query.FilterExpression).toEqual("(#customField = :v_sub1) OR (#customField = :v_sub2)");
    });
    it("it produces a filter expression with multiple fields", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilter({
          foo: ["value1"],
          bar: ["value2", "value3"],
          baz: ["value4"]
        })
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#foo": "foo",
        "#bar": "bar",
        "#baz": "baz"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1",
        ":v_sub2": "value2",
        ":v_sub3": "value3",
        ":v_sub4": "value4"
      });
      expect(query.FilterExpression).toEqual(
        "(#foo = :v_sub1) AND ((#bar = :v_sub2) OR (#bar = :v_sub3)) AND (#baz = :v_sub4)"
      );
    });
    it("produces a projection expression for field names", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk",
          sortKeyName: "sk",
          sortKeyValue: "mySk"
        })
        .withFields("foo", "bar")
        .build();
      expect(query.KeyConditionExpression).toEqual("(#pk = :v_sub0) AND (#sk = :v_sub1)");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#sk": "sk",
        "#foo": "foo",
        "#bar": "bar"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "mySk"
      });
      expect(query.FilterExpression).toBeUndefined();
      expect(query.ProjectionExpression).toBe("#foo,#bar,#pk,#sk");
    });
    it("includes ExpressionAttributeValues and ExpressionAttributeNames for a scan with filters", () => {
      const query = new QueryBuilder(tableName).withFilter({ tenantId: ["abcdef"] }).build("scan");
      expect(query.ExpressionAttributeNames).toEqual({ "#tenantId": "tenantId" });
      expect(query.ExpressionAttributeValues).toEqual({ ":v_sub0": "abcdef" });
    });
  });

  /**
   * The Filter Expression tests duplicate the Filter tests above to illustrate that the same queries (and much more)
   * can be created using the filter expression conditions
   */
  describe("Filter Expressions", () => {
    it("it combines filter expression names and values with index ones", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(new Comparison(A("customField"), "=", "value1"))
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1"
      });
      expect(query.FilterExpression).toEqual("#customField = :v_sub1");
    });
    it("it produces a filter expression with multiple values", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(
          new Or(new Comparison(A("customField"), "=", "value1"), new Comparison(A("customField"), "=", "value2"))
        )
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1",
        ":v_sub2": "value2"
      });
      expect(query.FilterExpression).toEqual("(#customField = :v_sub1) OR (#customField = :v_sub2)");
    });
    it("it produces a filter expression with multiple fields", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(
          new And(
            new Eq(A("foo"), "value1"),
            new Or(new Eq(A("bar"), "value2"), new Eq(A("bar"), "value3")),
            new Eq(A("baz"), "value4")
          )
        )
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#foo": "foo",
        "#bar": "bar",
        "#baz": "baz"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1",
        ":v_sub2": "value2",
        ":v_sub3": "value3",
        ":v_sub4": "value4"
      });
      expect(query.FilterExpression).toEqual(
        "(#foo = :v_sub1) AND ((#bar = :v_sub2) OR (#bar = :v_sub3)) AND (#baz = :v_sub4)"
      );
    });
    it("produces a filter expression with single negation value", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(new Not(new Comparison(A("customField"), "=", "value1")))
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1"
      });
      expect(query.FilterExpression).toEqual("NOT (#customField = :v_sub1)");
    });
    it("produces a filter expression with multiple negation values", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(new Not(new Or(new Eq(A("customField"), "value1"), new Eq(A("customField"), "value2"))))
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value1",
        ":v_sub2": "value2"
      });
      expect(query.FilterExpression).toEqual("NOT ((#customField = :v_sub1) OR (#customField = :v_sub2))");
    });
    it("produces a filter with matches and negations", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk"
        })
        .withFilterExpression(
          new And(
            new Eq(A("match"), "value0"),
            new Not(new Or(new Eq(A("customField"), "value1"), new Eq(A("customField"), "value2")))
          )
        )
        .build();
      expect(query.KeyConditionExpression).toEqual("#pk = :v_sub0");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#match": "match",
        "#customField": "customField"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "value0",
        ":v_sub2": "value1",
        ":v_sub3": "value2"
      });
      expect(query.FilterExpression).toEqual(
        "(#match = :v_sub1) AND (NOT ((#customField = :v_sub2) OR (#customField = :v_sub3)))"
      );
    });
    it("produces a projection expression for field names", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "myPk",
          sortKeyName: "sk",
          sortKeyValue: "mySk"
        })
        .withFields("foo", "bar")
        .build();
      expect(query.KeyConditionExpression).toEqual("(#pk = :v_sub0) AND (#sk = :v_sub1)");
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk",
        "#sk": "sk",
        "#foo": "foo",
        "#bar": "bar"
      });
      expect(query.ExpressionAttributeValues as any).toEqual({
        ":v_sub0": "myPk",
        ":v_sub1": "mySk"
      });
      expect(query.FilterExpression).toBeUndefined();
      expect(query.ProjectionExpression).toBe("#foo,#bar,#pk,#sk");
    });
    it("includes ExpressionAttributeValues and ExpressionAttributeNames for a scan with filters", () => {
      const query = new QueryBuilder(tableName)
        .withFilterExpression(new Comparison(A("tenantId"), "=", "abcdef"))
        .build("scan");
      expect(query.ExpressionAttributeNames).toEqual({ "#tenantId": "tenantId" });
      expect(query.ExpressionAttributeValues).toEqual({ ":v_sub0": "abcdef" });
    });
  });

  describe("Pagination", () => {
    it("sets Limit on the query", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withPagination({
          pageSize: 2
        })
        .build();
      expect(query.TableName).toEqual(tableName);
      expect(query.Limit).toEqual(2);
    });
    it("sets ScanIndexForward = false when sorting desc", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withPagination({
          sortDir: "desc"
        })
        .build();
      expect(query.TableName).toEqual(tableName);
      expect(query.ScanIndexForward).toEqual(false);
    });
    it("doesn't set ScanIndexForward when sorting asc (default is asc)", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withPagination({
          sortDir: "asc"
        })
        .build();
      expect(query.TableName).toEqual(tableName);
      expect(query.ScanIndexForward).toBeUndefined();
    });
    it("sets ExclusiveStartKey on the query", () => {
      const date = new Date().toISOString();
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withPagination({
          pageSize: 2,
          sortDir: "desc",
          lastEvaluatedKey: {
            pk: "myPk",
            inviteDate: date
          }
        })
        .build();
      expect(query.TableName).toEqual(tableName);
      expect(query.Limit).toEqual(2);
      expect(query.ScanIndexForward).toEqual(false);
      expect(query.ExclusiveStartKey as any).toEqual({
        pk: "myPk",
        inviteDate: date
      });
    });
  });

  describe("Custom Query Inputs", () => {
    it("sets additional custom values on QueryCommandInput not included in the builder", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withRaw({
          ConsistentRead: true
        })
        .build();
      expect(query.ConsistentRead).toBe(true);
    });
    it("overwrites conflicting custom inputs", () => {
      const query: QueryCommandInput = new QueryBuilder(tableName)
        .withKeys({
          partitionKeyName: "pk",
          partitionKeyValue: "pkValue"
        })
        .withRaw({
          ExpressionAttributeNames: { "#foo": "foo" }
        })
        .build();
      expect(query.ExpressionAttributeNames).toEqual({
        "#pk": "pk"
      });
    });
  });
});
