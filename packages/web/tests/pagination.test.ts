import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";

describe("parsePagination", () => {
  it("defaults to limit=20, offset=0 with no query params", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ limit: 20, offset: 0 });
  });

  it("accepts explicit valid limit/offset", () => {
    expect(parsePagination(new URLSearchParams("limit=5&offset=10"))).toEqual({
      limit: 5,
      offset: 10,
    });
  });

  it("accepts the max limit boundary (100)", () => {
    expect(parsePagination(new URLSearchParams("limit=100")).limit).toBe(100);
  });

  it.each(["0", "-1", "101", "abc", "1.5"])("rejects invalid limit=%s", (limit) => {
    expect(() => parsePagination(new URLSearchParams(`limit=${limit}`))).toThrow(ApiError);
  });

  it.each(["-1", "abc", "1.5"])("rejects invalid offset=%s", (offset) => {
    expect(() => parsePagination(new URLSearchParams(`offset=${offset}`))).toThrow(ApiError);
  });

  it("accepts offset=0 explicitly", () => {
    expect(parsePagination(new URLSearchParams("offset=0")).offset).toBe(0);
  });
});
