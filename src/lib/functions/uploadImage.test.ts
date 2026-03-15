import { describe, expect, it, vi } from "vitest";

import { uploadImageHandler } from "./uploadImage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

describe("uploadImageHandler", () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  const mockDb = { insert: mockInsert };
  const mockPut = vi.fn().mockResolvedValue(undefined);
  const mockBucket = { put: mockPut } as any;

  function createFile(name: string, type: string, size?: number) {
    const content = size ? new Uint8Array(size) : new Uint8Array([0x89]);
    return new File([content], name, { type });
  }

  it("throws for invalid mime type", async () => {
    const file = createFile("a.txt", "text/plain");
    await expect(
      uploadImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "u1", file }),
    ).rejects.toThrow("Invalid file type");
  });

  it("throws when file exceeds 10MB", async () => {
    const file = createFile("big.jpg", "image/jpeg", 11 * 1024 * 1024);
    await expect(
      uploadImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "u1", file }),
    ).rejects.toThrow("File too large");
  });

  it.each(ALLOWED_TYPES)("saves %s to R2 and D1", async (mimeType) => {
    mockPut.mockClear();
    mockInsert.mockClear().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const file = createFile("photo.jpg", mimeType);
    const result = await uploadImageHandler({
      db: mockDb as any,
      bucket: mockBucket,
      userId: "u1",
      file,
    });

    expect(mockPut).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
  });
});
