import { describe, expect, it, vi } from "vitest";

import { getImageHandler } from "./getImage";

const mockImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("getImageHandler", () => {
  function createMockDb(result: unknown) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(result),
        }),
      }),
    };
  }

  it("returns image when found", async () => {
    const mockDb = createMockDb([mockImage]);
    const result = await getImageHandler({ db: mockDb as any, imageId: "img1" });
    expect(result).toEqual(mockImage);
  });

  it("returns null when not found", async () => {
    const mockDb = createMockDb([]);
    const result = await getImageHandler({ db: mockDb as any, imageId: "nonexistent" });
    expect(result).toBeNull();
  });
});
