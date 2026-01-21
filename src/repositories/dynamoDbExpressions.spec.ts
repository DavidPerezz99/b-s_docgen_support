import {
  A,
  And,
  AttributeTracker,
  BeginsWith,
  Between,
  Comparison,
  Contains,
  Exists,
  In,
  Not,
  NotExists,
  Or,
  Size,
  Type
} from "./dynamoDbExpressions";

describe("Filter expressions", () => {
  describe("Comparison", () => {
    it("builds a comparison expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Comparison(A("pk"), "=", "123").build(tracker);
      expect(expression).toEqual("#pk = :v_sub0");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#pk": "pk"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "123"
        })
      );
    });
    it("builds Functions as operands of the expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Comparison(A("propA"), "<", new Size("parent.nested")).build(tracker);
      expect(expression).toEqual("#propA < size(#parent.#nested)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#propA": "propA",
          "#parent": "parent",
          "#nested": "nested"
        })
      );
      expect(tracker.attributeValues).toEqual({});
    });
    it("builds primitives as operands of the expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Comparison(1000, "<", new Size("parent.nested")).build(tracker);
      expect(expression).toEqual(":v_sub0 < size(#parent.#nested)");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual({
        ":v_sub0": 1000
      });
    });
  });

  describe("Between", () => {
    it("builds a between expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Between(A("sk"), 0, 10).build(tracker);
      expect(expression).toEqual("#sk BETWEEN :v_sub0 AND :v_sub1");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#sk": "sk"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 0,
          ":v_sub1": 10
        })
      );
    });
    it("builds a between expression with a function", () => {
      const tracker = new AttributeTracker();
      const expression = new Between(new Size("parent.nested"), 0, 10).build(tracker);
      expect(expression).toEqual("size(#parent.#nested) BETWEEN :v_sub0 AND :v_sub1");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 0,
          ":v_sub1": 10
        })
      );
    });
    it("converts Dates to ISO strings", () => {
      const tracker = new AttributeTracker();
      const expression = new Between(A("prop"), new Date("12/12/2023Z"), new Date("12/31/2023Z")).build(tracker);
      expect(expression).toEqual("#prop BETWEEN :v_sub0 AND :v_sub1");
      expect(tracker.attributeNames).toEqual({
        "#prop": "prop"
      });
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "2023-12-12T00:00:00.000Z",
          ":v_sub1": "2023-12-31T00:00:00.000Z"
        })
      );
    });
  });

  describe("Begins with", () => {
    it("builds a begins_with expression", () => {
      const tracker = new AttributeTracker();
      const expression = new BeginsWith(A("sk"), "tenant#123").build(tracker);
      expect(expression).toEqual("begins_with(#sk, :v_sub0)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#sk": "sk"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "tenant#123"
        })
      );
    });
  });

  describe("IN expression", () => {
    it("builds an IN expression", () => {
      const tracker = new AttributeTracker();
      const expression = new In(A("pk"), ["tenant#abc", "tenant#def"]).build(tracker);
      expect(expression).toEqual("#pk IN (:v_sub0, :v_sub1)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#pk": "pk"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "tenant#abc",
          ":v_sub1": "tenant#def"
        })
      );
    });
  });

  describe("contains function", () => {
    it("builds a contains function", () => {
      const tracker = new AttributeTracker();
      const expression = new Contains("parent.nested", "abc").build(tracker);
      expect(expression).toEqual("contains(#parent.#nested, :v_sub0)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#parent": "parent",
          "#nested": "nested"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "abc"
        })
      );
    });
  });

  describe("AND/OR expressions", () => {
    it("builds a basic AND expression", () => {
      const tracker = new AttributeTracker();
      const expression = new And(new Comparison(A("propA"), "<>", 1), new Comparison(A("propA"), "<>", 2)).build(
        tracker
      );
      expect(expression).toEqual("(#propA <> :v_sub0) AND (#propA <> :v_sub1)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#propA": "propA"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 1,
          ":v_sub1": 2
        })
      );
    });
    it("builds an AND expression with many operands", () => {
      const tracker = new AttributeTracker();
      const expression = new And(
        new Comparison(A("propA"), "<>", 1),
        new Comparison(A("propA"), "<>", 2),
        new Comparison(A("propA"), "<>", 2),
        new Comparison(A("propA"), "<>", 2),
        new Comparison(A("propA"), "<>", 2),
        new Comparison(A("propA"), "<>", 2),
        new Comparison(A("propA"), "<>", 2)
      ).build(tracker);
      expect(expression).toEqual(
        "(#propA <> :v_sub0) AND (#propA <> :v_sub1) AND (#propA <> :v_sub2) AND (#propA <> :v_sub3) AND (#propA <> :v_sub4) AND (#propA <> :v_sub5) AND (#propA <> :v_sub6)"
      );
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#propA": "propA"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 1,
          ":v_sub1": 2,
          ":v_sub2": 2,
          ":v_sub3": 2,
          ":v_sub4": 2,
          ":v_sub5": 2,
          ":v_sub6": 2
        })
      );
    });
    it("builds a basic OR expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Or(new Comparison(A("propA"), "<>", 1), new Comparison(A("propA"), "<>", 2)).build(
        tracker
      );
      expect(expression).toEqual("(#propA <> :v_sub0) OR (#propA <> :v_sub1)");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#propA": "propA"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 1,
          ":v_sub1": 2
        })
      );
    });
    // When uncommented, this illustrates (via compiler error) that a Size() class is not compatible with a Condition() class
    // it("comment out this test: can't use size as a Condition", () => {
    //   const tracker = new AttributeTracker();
    //   const expression = new And(new Size("path"), new Size("other")).build(tracker);
    //   expect(expression).not.toBeDefined();
    // })
  });

  describe("Not Expression", () => {
    it("builds a NOT expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Not(
        new And(new Comparison(A("propA"), "<>", 1), new Comparison(A("propA"), "<>", 2))
      ).build(tracker);
      expect(expression).toEqual("NOT ((#propA <> :v_sub0) AND (#propA <> :v_sub1))");
      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#propA": "propA"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": 1,
          ":v_sub1": 2
        })
      );
    });
  });

  describe("Attribute Expressions", () => {
    it("builds an exists expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Exists("parent.nested").build(tracker);
      expect(expression).toEqual("attribute_exists(#parent.#nested)");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual({});
    });
    it("builds a not exists expression", () => {
      const tracker = new AttributeTracker();
      const expression = new NotExists("parent.nested").build(tracker);
      expect(expression).toEqual("attribute_not_exists(#parent.#nested)");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual({});
    });
    it("builds a size expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Size("parent.nested").build(tracker);
      expect(expression).toEqual("size(#parent.#nested)");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual({});
    });
  });

  describe("Attribute type expression", () => {
    it("builds a type expression", () => {
      const tracker = new AttributeTracker();
      const expression = new Type("parent.nested", "list").build(tracker);
      expect(expression).toEqual("attribute_type(#parent.#nested, :v_sub0)");
      expect(tracker.attributeNames).toEqual({
        "#parent": "parent",
        "#nested": "nested"
      });
      expect(tracker.attributeValues).toEqual({
        ":v_sub0": "L"
      });
    });
  });

  describe("attribute tracking", () => {
    it("handles multiple conditions", () => {
      const tracker = new AttributeTracker();
      new Comparison(A("pk"), "=", "123").build(tracker);
      new Comparison(A("sk"), ">", 12).build(tracker);

      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#pk": "pk",
          "#sk": "sk"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "123",
          ":v_sub1": 12
        })
      );
    });
    it("handles multiple comparisons with the same attribute name", () => {
      const tracker = new AttributeTracker();
      new Comparison(A("customProp"), "=", "123").build(tracker);
      new Comparison(A("customProp"), ">", 12).build(tracker);

      expect(tracker.attributeNames).toEqual(
        expect.objectContaining({
          "#customProp": "customProp"
        })
      );
      expect(tracker.attributeValues).toEqual(
        expect.objectContaining({
          ":v_sub0": "123",
          ":v_sub1": 12
        })
      );
    });
  });
});
