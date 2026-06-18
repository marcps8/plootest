import { NextResponse } from "next/server";
import { AppError } from "@ploot/shared";
import { toPostDTO } from "@ploot/shared";

export function jsonData<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status }
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "internal_error", message: "Unexpected error" },
    { status: 500 }
  );
}

export { toPostDTO };
