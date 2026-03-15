import { describe, expect, it, vi } from "vitest";

import { deleteImageHandler } from "./deleteImage";

const existingImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("deleteImageHandler", () => {
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockBucket = { delete: mockDelete } as any;

  function createMockDb(selectResult: unknown[]) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
  }

  it("throws when image not found", async () => {
    const mockDb = createMockDb([]);
    await expect(
      deleteImageHandler({
        db: mockDb as any,
        bucket: mockBucket,
        userId: "user1",
        imageId: "nonexistent",
      }),
    ).rejects.toThrow("Not found");
  });

  it("throws when user does not own the image", async () => {
    const mockDb = createMockDb([existingImage]);
    await expect(
      deleteImageHandler({
        db: mockDb as any,
        bucket: mockBucket,
        userId: "other-user",
        imageId: "img1",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("deletes D1 record first, then R2 object", async () => {
    const callOrder: string[] = [];
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingImage]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          callOrder.push("d1");
        }),
      }),
    };
    mockDelete.mockClear().mockImplementation(async () => {
      callOrder.push("r2");
    });

    await deleteImageHandler({
      db: mockDb as any,
      bucket: mockBucket,
      userId: "user1",
      imageId: "img1",
    });

    expect(callOrder).toEqual(["d1", "r2"]);
    expect(mockDelete).toHaveBeenCalledWith(existingImage.r2Key);
  });
});
