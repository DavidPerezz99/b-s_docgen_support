import { caseSensitiveHeaderName } from "./httpUtils";

const mockEvent: any = {
  body: null,
  headers: {
    "x-Some-Header-Name": "a really important value"
  },
  pathParameters: {},
  queryStringParameters: {}
};

describe("HttpUtils", () => {
  describe("caseSensitiveHeaderName()", () => {
    describe("successfully", () => {
      it("handles case-insensitive headers", () => {
        const result = caseSensitiveHeaderName(mockEvent, "x-some-header-name");
        expect(result).toEqual("x-Some-Header-Name");
      });
    });

    describe("when the header is not found", () => {
      it("returns the input value ", () => {
        const result = caseSensitiveHeaderName(mockEvent, "x-unknown-header");
        expect(result).toEqual("x-unknown-header");
      });
    });
  });
});
