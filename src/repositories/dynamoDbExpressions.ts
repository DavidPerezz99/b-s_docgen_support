type Comparator = "=" | "<" | ">" | "<=" | ">=" | "<>";
type Operand = string | number | Date | null | AttributeName | Condition | Size;
type AttributeType =
  | "string"
  | "stringSet"
  | "number"
  | "numberSet"
  | "binary"
  | "binarySet"
  | "boolean"
  | "null"
  | "list"
  | "map";

const attributeTypeMap: Record<AttributeType, string> = {
  string: "S",
  stringSet: "SS",
  number: "N",
  numberSet: "NN",
  binary: "B",
  binarySet: "BS",
  boolean: "BOOL",
  null: "NULL",
  list: "L",
  map: "M"
};

/**
 * Automatically tracks query attribute names and values across all names and values in a Query
 * So that they can be substituted to avoid any conflicts with DynamoDb Reserved Keywords
 *
 * A tracker instance should be used 1-1 with a given query so that all subs are captured
 */
export class AttributeTracker {
  valueCounter = 0;
  attributeNames: Record<string, any> = {};
  attributeValues: Record<string, any> = {};
  /**
   *
   * @param value the Operand to get a value for.
   *  - If an Attribute, will return a placeholer in the form of #{value} or #{alias}
   *    - The same attribute input will always return the same output, unless an alias is specified
   *  - If a value, will return the value in the form of :v_sub{N} or :alias{N} where N is an incrementing number for unique value names.
   *    - Will never return the same output since N is incremented each time a new value is added
   *  - If a function, will build the expression and return
   * @param alias if specified and applicable, will use the alias for the attribute alias instead of the attribute name
   * @returns String expression: a placeholder or a built function condition
   */
  get(value: Operand, alias?: string): string {
    if (value instanceof Condition || value instanceof Size) {
      return value.build(this);
    }
    if (value instanceof AttributeName) {
      return this.getName(value.name, alias);
    }
    return this.getValue(value, alias);
  }
  private getName(attrName: string, alias?: string): string {
    const mapped = "#" + (alias ?? attrName);
    this.attributeNames[mapped] = attrName;
    return mapped;
  }
  private getValue(value: Operand, alias?: string): string {
    const attrName = alias ?? "v_sub";
    const mapped = ":" + attrName + this.valueCounter++;
    this.attributeValues[mapped] = this.convertValue(value);
    return mapped;
  }
  private convertValue(value: Operand): any {
    if (value instanceof Date) return value.toISOString();
    return value;
  }
}

/**
 * Mark an Operand as an AttributeName so that it is appropriately escaped in the DynamoDb Query
 * @param name
 * @returns
 */
export const A = (name: string): AttributeName => new AttributeName(name);
class AttributeName {
  constructor(public name: string) {}
}

/**
 * Condition for a Sort Key in a KeyConditionExpression
 * A KeyConditionExpression is made up of a Partition Key comparison and an optional SortKeyCondition
 * ex: `#pk = 1 AND #sk > 0`
 */
export type SortKeyCondition = Between | BeginsWith | KeyConditionComparison;

/**
 * Implementation of Filter Expressions based on the DynamoDb docs below
 * Supports these operations with any level of nesting / combination:
 * - Comparison (all comparators supported)
 * - And
 * - Or
 * - Not
 * - Between
 * - BeginsWith
 * - In
 * - Contains
 * - Exists
 * - NotExists
 * - Size
 * - Type
 * ```
 * condition-expression ::=
      operand comparator operand
    | operand BETWEEN operand AND operand
    | operand IN ( operand (',' operand (, ...) ))
    | function
    | condition AND condition
    | condition OR condition
    | NOT condition
    | ( condition )

comparator ::=
    =
    | <>
    | <
    | <=
    | >
    | >=

function ::=
    attribute_exists (path)
    | attribute_not_exists (path)
    | attribute_type (path, type)
    | begins_with (path, substr)
    | contains (path, operand)
    | size (path)
```
 */
export type FilterExpression = Condition;

interface ExpressionBuilder {
  build(tracker: AttributeTracker): string;
}

/**
 * A DynamoDB query expression that evaluates to either *true* or *false*
 */
abstract class Condition implements ExpressionBuilder {
  // This symbol allows the Typescript compiler to differentiate between a class
  // that merely implements the `build` method (i.e. `ExpressionBuilder`), vs a class that extends `Condition`
  // This is required to differentiate the `Size` function as just a value, compared to a `Condition`
  // even though it has the same `build` method signature as a `Condition`
  readonly _extendsCondition = Symbol();
  abstract build(tracker: AttributeTracker): string;
}

/**
 * A dot notation path to an attribute.
 * Is automatically escaped when built to an expression.
 *
 * Ex:
 * path = "parent.nested" would fetch this value:
 * ```
 * {
 *   parent: {
 *     nested: 1
 *   }
 * }
 * ```
 *
 * In a filter expression, the path would be escaped like:
 * #parent.#nested to avoid any potential keyword overlaps
 * And appropriate substitutions would be added to the expression attribute names / values
 */

/**
 * Escapes a path for a path operation in DynamoDB with a given AttributeTracker for subs
 * @param tracker
 * @param path
 * @returns
 */
const escapePath = (tracker: AttributeTracker, path: string): string => {
  return path
    .split(".")
    .map((part) => tracker.get(A(part)))
    .join(".");
};

/**
 * Produces a comparison condition of a left and right operand like:
 *
 * `{operand1} {comparator} {operand2}`
 *
 * ex:
 *
 * `new Comparison(A("sk"), 100)` when built, produces:
 *
 * `#sk > 100`
 */
export class Comparison extends Condition {
  constructor(
    private readonly operand1: Operand,
    private readonly comparator: Comparator,
    private readonly operand2: Operand
  ) {
    super();
  }
  build(tracker: AttributeTracker): string {
    const attributeName = tracker.get(this.operand1);
    const attributeValue = tracker.get(this.operand2);
    return `${attributeName} ${this.comparator} ${attributeValue}`;
  }
}

/**
 * Shortcut for Comparison with "=" comparator
 */
export class Eq extends Comparison {
  constructor(operand1: Operand, operand2: Operand) {
    super(operand1, "=", operand2);
  }
}

/**
 * Limited Comparison expression for Key Conditions
 * where "<>" is not allowed
 */
export class KeyConditionComparison extends Comparison {
  constructor(keyName: string, comparator: Omit<Comparator, "<>">, operand2: Operand) {
    super(A(keyName), comparator as Comparator, operand2);
  }
}

/**
 * Produces a between statement like:
 *
 * `{operand} BETWEEN {start} AND {end}`
 */
export class Between extends Condition {
  constructor(
    private readonly operand: Operand,
    private readonly start: Operand,
    private readonly end: Operand
  ) {
    super();
  }
  build(tracker: AttributeTracker): string {
    const attributeName = tracker.get(this.operand);
    const start = tracker.get(this.start);
    const end = tracker.get(this.end);
    return `${attributeName} BETWEEN ${start} AND ${end}`;
  }
}

/**
 * Produces a begins_with() function like:
 *
 * `begins_with({operand}, {beginsWith})`
 */
export class BeginsWith extends Condition {
  constructor(
    private readonly operand: Operand,
    private readonly beginsWith: string
  ) {
    super();
  }
  build(tracker: AttributeTracker): string {
    const attributeName = tracker.get(this.operand);
    const attributeValue = tracker.get(this.beginsWith);
    return `begins_with(${attributeName}, ${attributeValue})`;
  }
}

/**
 * Produces an expression like:
 *
 * `{operand} IN ({operands1}, {operands2}, ....)`
 */
export class In extends Condition {
  list: Operand[];
  constructor(
    private readonly operand: Operand,
    list: Operand[]
  ) {
    super();
    this.list = list;
  }
  build(tracker: AttributeTracker): string {
    const attributeName = tracker.get(this.operand);
    const attributeValues = this.list.map((o) => tracker.get(o));
    return `${attributeName} IN (${attributeValues.join(", ")})`;
  }
}

/**
 * Produces an expression like:
 *
 * `({conditions[0]}) AND ({conditions[1]}) AND ...`
 */
export class And extends Condition {
  conditions: Condition[];
  constructor(...conditions: Condition[]) {
    super();
    this.conditions = conditions;
  }
  build(tracker: AttributeTracker): string {
    if (this.conditions.length < 2) {
      throw new Error("And condition must have at least 2 operands but got: " + this.conditions.length);
    }
    return `(${this.conditions.map((c) => c.build(tracker)).join(") AND (")})`;
  }
}

/**
 * Produces an expression like:
 *
 * `({conditions[0]}) OR ({conditions[1]}) OR ...`
 */
export class Or extends Condition {
  conditions: Condition[];
  constructor(...conditions: Condition[]) {
    super();
    this.conditions = conditions;
  }
  build(tracker: AttributeTracker): string {
    if (this.conditions.length < 2) {
      throw new Error("Or condition must have at least 2 operands but got: " + this.conditions.length);
    }
    return `(${this.conditions.map((c) => c.build(tracker)).join(") OR (")})`;
  }
}

/**
 * Produces an expression like:
 *
 * `NOT ({expression})`
 */
export class Not extends Condition {
  constructor(private readonly condition: Condition) {
    super();
  }
  build(tracker: AttributeTracker): string {
    return `NOT (${this.condition.build(tracker)})`;
  }
}

/**
 * Produces attribute_exists() function like:
 *
 * `attribute_exists({path})`
 */
export class Exists extends Condition {
  constructor(private readonly path: string) {
    super();
  }
  build(tracker: AttributeTracker): string {
    return `attribute_exists(${escapePath(tracker, this.path)})`;
  }
}

/**
 * Produces attribute_not_exists() function like:
 *
 * `attribute_not_exists({path})`
 */
export class NotExists extends Condition {
  constructor(private readonly path: string) {
    super();
  }
  build(tracker: AttributeTracker): string {
    return `attribute_not_exists(${escapePath(tracker, this.path)})`;
  }
}

/**
 * Produces attribute_type() function like:
 *
 * `attribute_type({path}, {type})`
 */
export class Type extends Condition {
  constructor(
    private readonly path: string,
    private readonly type: AttributeType
  ) {
    super();
  }
  build(tracker: AttributeTracker): string {
    const attributeValue = tracker.get(attributeTypeMap[this.type]);
    return `attribute_type(${escapePath(tracker, this.path)}, ${attributeValue})`;
  }
}

/**
 * Produces contains() function like:
 *
 * `contains({path}, {operand})`
 *
 * Note well:
 *
 * If the *attribute* specified by path is a String, the operand must be a String.
 * If the *attribute* specified by path is a Set, the operand must be the set's element type.
 */
export class Contains extends Condition {
  constructor(
    private readonly path: string,
    private readonly operand: Operand
  ) {
    super();
  }
  build(tracker: AttributeTracker): string {
    const attributeValue = tracker.get(this.operand);
    return `contains(${escapePath(tracker, this.path)}, ${attributeValue})`;
  }
}

/**
 * Produces size() function like:
 *
 * `size({path})`
 *
 * Note well: `size()` produces a value and must be combined with a `Comparison`
 * or used in another expression to create a Condition, unlike other built-in DynamoDB functions
 */
export class Size implements ExpressionBuilder {
  constructor(private readonly path: string) {}
  build(tracker: AttributeTracker): string {
    return `size(${escapePath(tracker, this.path)})`;
  }
}
